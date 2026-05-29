import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import { HexColorPicker } from 'react-colorful';
import { jsPDF } from 'jspdf';
import { getSet } from '../db';
import type { FlashcardSet } from '../db';

// ─── A4 constants ─────────────────────────────────────────────────────────────

const A4_PORT_W = 21.0;  // cm, portrait width
const A4_PORT_H = 29.7;  // cm, portrait height
const A4_PX_W   = 794;   // px at 96dpi, portrait width
const A4_PX_H   = 1123;  // px at 96dpi, portrait height

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrintOptions {
  cols: number;
  rows: number;
  cardMargin: number;        // cm — inner padding of each card
  titleFontSize: number;     // pt
  defFontSize: number;       // pt
  titleAlignment: 'left' | 'center' | 'right';
  defAlignment: 'left' | 'center' | 'right';
  bgColor: string;
  textColor: string;
  titleBold: boolean;
  titleItalic: boolean;
  titleUnderline: boolean;
  defBold: boolean;
  defItalic: boolean;
  defUnderline: boolean;
  landscape: boolean;
}

const DEFAULT_OPTIONS: PrintOptions = {
  cols: 2,
  rows: 2,
  cardMargin: 0.5,
  titleFontSize: 18,
  defFontSize: 12,
  titleAlignment: 'center',
  defAlignment: 'left',
  bgColor: '#ffffff',
  textColor: '#1a1a2e',
  titleBold: true,
  titleItalic: false,
  titleUnderline: false,
  defBold: false,
  defItalic: false,
  defUnderline: false,
  landscape: false,
};

// Cols × rows grid presets
const GRID_PRESETS: Array<{ cols: number; rows: number }> = [
  { cols: 1, rows: 1 },
  { cols: 1, rows: 2 },
  { cols: 2, rows: 1 },
  { cols: 2, rows: 2 },
  { cols: 2, rows: 3 },
  { cols: 2, rows: 4 },
  { cols: 3, rows: 2 },
  { cols: 3, rows: 3 },
  { cols: 4, rows: 2 },
  { cols: 4, rows: 3 },
];

// ─── Derived layout helpers ───────────────────────────────────────────────────

function pageSize(landscape: boolean) {
  return landscape
    ? { w: A4_PORT_H, h: A4_PORT_W }  // cm
    : { w: A4_PORT_W, h: A4_PORT_H };
}

function pagePx(landscape: boolean) {
  return landscape
    ? { w: A4_PX_H, h: A4_PX_W }
    : { w: A4_PX_W, h: A4_PX_H };
}

function cardSizeCm(opts: PrintOptions) {
  const pg = pageSize(opts.landscape);
  return { w: pg.w / opts.cols, h: pg.h / opts.rows };
}

// ─── Page model ───────────────────────────────────────────────────────────────

interface PageDef {
  kind: 'terms' | 'defs';
  chunkIndex: number;
  chunk: FlashcardSet['terms'];
}

function buildPages(terms: FlashcardSet['terms'], cols: number, rows: number): PageDef[] {
  const perPage = cols * rows;
  const pages: PageDef[] = [];
  let idx = 0;
  for (let i = 0; i < terms.length; i += perPage) {
    pages.push({ kind: 'terms', chunkIndex: idx, chunk: terms.slice(i, i + perPage) });
    pages.push({ kind: 'defs',  chunkIndex: idx, chunk: terms.slice(i, i + perPage) });
    idx++;
  }
  return pages;
}

// ─── Font loading ─────────────────────────────────────────────────────────────

const FONT_FILES = {
  normal:     '/fonts/SourceSans3-Regular.ttf',
  bold:       '/fonts/SourceSans3-Bold.ttf',
  italic:     '/fonts/SourceSans3-Italic.ttf',
  bolditalic: '/fonts/SourceSans3-BoldItalic.ttf',
} as const;
type FontVariant = keyof typeof FONT_FILES;

const fontCache: Partial<Record<FontVariant, string>> = {};

async function loadFontVariant(variant: FontVariant): Promise<string | null> {
  if (fontCache[variant]) return fontCache[variant]!;
  try {
    const res = await fetch(FONT_FILES[variant]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const b64 = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(new Blob([buf]));
    });
    fontCache[variant] = b64;
    return b64;
  } catch (e) {
    console.error('Font load failed:', variant, e);
    return null;
  }
}

async function registerFonts(pdf: jsPDF): Promise<string> {
  const variants: FontVariant[] = ['normal', 'bold', 'italic', 'bolditalic'];
  const styles = ['normal', 'bold', 'italic', 'bolditalic'] as const;
  let ok = true;
  for (let i = 0; i < variants.length; i++) {
    const b64 = await loadFontVariant(variants[i]);
    if (!b64) { ok = false; continue; }
    const file = `SS3-${variants[i]}.ttf`;
    pdf.addFileToVFS(file, b64);
    pdf.addFont(file, 'SourceSans3', styles[i]);
  }
  return ok ? 'SourceSans3' : 'helvetica';
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padEnd(6, '0');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ─── Color picker popover ─────────────────────────────────────────────────────

function ColorPickerField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff';

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <div ref={ref} className="relative">
        <div className="flex gap-2 items-center">
          <button type="button" onClick={() => setOpen(o => !o)}
            style={{ backgroundColor: safe }}
            className="w-10 h-9 rounded-lg border border-gray-300 shrink-0 cursor-pointer shadow-sm" />
          <input type="text" value={value} onChange={e => onChange(e.target.value)}
            className="flex-1 border border-gray-300 rounded-xl px-2 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0" />
        </div>
        {open && (
          <div className="absolute left-0 mt-2 z-50 rounded-xl overflow-hidden shadow-2xl border border-gray-200" style={{ top: '100%' }}>
            <HexColorPicker color={safe} onChange={onChange} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Alignment picker ─────────────────────────────────────────────────────────

function AlignPicker({ value, onChange }: {
  value: 'left' | 'center' | 'right';
  onChange: (v: 'left' | 'center' | 'right') => void;
}) {
  return (
    <div className="flex gap-1">
      {(['left', 'center', 'right'] as const).map(a => (
        <button key={a} type="button" onClick={() => onChange(a)}
          className={`flex-1 flex items-center justify-center py-2 rounded-xl border text-xs font-medium transition-colors capitalize
            ${value === a ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-300'}`}>
          {a}
        </button>
      ))}
    </div>
  );
}

// ─── A4 page preview ──────────────────────────────────────────────────────────

function A4PagePreview({ page, options }: { page: PageDef; options: PrintOptions }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const px   = pagePx(options.landscape);
  const card = cardSizeCm(options);

  // card dimensions in preview pixels — exact integer pixel values
  const cardWpx = px.w / options.cols;
  const cardHpx = px.h / options.rows;
  const marginPx = (options.cardMargin / (pageSize(options.landscape).w)) * px.w;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setScale(Math.min(1, entry.contentRect.width / px.w))
    );
    ro.observe(el);
    setScale(Math.min(1, el.clientWidth / px.w));
    return () => ro.disconnect();
  }, [px.w]);

  const isTitle   = page.kind === 'terms';
  const fontSize  = isTitle ? options.titleFontSize  : options.defFontSize;
  const bold      = isTitle ? options.titleBold      : options.defBold;
  const italic    = isTitle ? options.titleItalic    : options.defItalic;
  const underline = isTitle ? options.titleUnderline : options.defUnderline;
  const alignment = isTitle ? options.titleAlignment : options.defAlignment;

  // All grid positions
  const totalCells = options.cols * options.rows;

  return (
    <div ref={containerRef} className="w-full">
      {/* Aspect-ratio spacer */}
      <div style={{ paddingBottom: `${(px.h / px.w) * 100}%`, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start' }}>
          {/* A4 sheet */}
          <div style={{
            width: px.w, height: px.h,
            background: '#e8e8e8',
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            flexShrink: 0,
            position: 'relative',
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          }}>
            {Array.from({ length: totalCells }).map((_, cellIdx) => {
              const srcCol = cellIdx % options.cols;
              const row    = Math.floor(cellIdx / options.cols);
              // Mirror columns on definition pages for duplex alignment
              const col    = page.kind === 'defs' ? (options.cols - 1 - srcCol) : srcCol;
              const term   = page.chunk[cellIdx];
              const text   = term ? (page.kind === 'terms' ? term.term : term.definition) : null;

              return (
                <div key={cellIdx} style={{
                  position: 'absolute',
                  left: col * cardWpx,
                  top:  row * cardHpx,
                  width:  cardWpx,
                  height: cardHpx,
                  backgroundColor: text !== null ? options.bgColor : '#f2f2f2',
                  boxSizing: 'border-box',
                  outline: '1px dashed #bbb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start',
                  padding: marginPx,
                  overflow: 'hidden',
                }}>
                  {text !== null ? (
                    <span style={{
                      fontSize,
                      fontWeight: bold ? 'bold' : 'normal',
                      fontStyle: italic ? 'italic' : 'normal',
                      textDecoration: underline ? 'underline' : 'none',
                      color: options.textColor,
                      textAlign: alignment,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxWidth: '100%',
                      fontFamily: '"Source Sans 3", "Noto Sans", sans-serif',
                      lineHeight: 1.35,
                    }}>
                      {text}
                    </span>
                  ) : (
                    /* empty cell indicator */
                    <span style={{ fontSize: Math.min(fontSize * 0.7, 14), color: '#ccc', fontFamily: 'sans-serif' }}>—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* Card size label */}
      <p className="text-xs text-center text-gray-400 mt-2">
        {card.w.toFixed(1)} × {card.h.toFixed(1)} cm per card
        {page.kind === 'defs' && <span className="ml-1 text-purple-400">(columns mirrored for duplex)</span>}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [set, setSet]         = useState<FlashcardSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_OPTIONS);
  const [pageIndex, setPageIndex]   = useState(0);
  const [generating, setGenerating] = useState(false);
  const [fontStatus, setFontStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');

  useEffect(() => {
    if (!id) return;
    getSet(id).then(data => {
      if (!data) { navigate('/'); return; }
      setSet(data);
      setLoading(false);
    });
  }, [id, navigate]);

  // Pre-fetch all font variants on mount
  useEffect(() => {
    setFontStatus('loading');
    Promise.all((['normal', 'bold', 'italic', 'bolditalic'] as FontVariant[]).map(loadFontVariant))
      .then(rs => setFontStatus(rs.every(Boolean) ? 'ready' : 'failed'));
  }, []);

  const opt = useCallback(<K extends keyof PrintOptions>(key: K, val: PrintOptions[K]) =>
    setOptions(prev => ({ ...prev, [key]: val })), []);

  const perPage  = options.cols * options.rows;
  const pages    = useMemo(() => set ? buildPages(set.terms, options.cols, options.rows) : [], [set, options.cols, options.rows]);
  const safeIdx  = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const curPage  = pages[safeIdx];
  const card     = cardSizeCm(options);
  const pgSize   = pageSize(options.landscape);

  // ── PDF generation ──────────────────────────────────────────────────────────

  const generatePDF = useCallback(async (mode: 'download' | 'print') => {
    if (!set || pages.length === 0) return;
    setGenerating(true);
    try {
      const pdf = new jsPDF({
        orientation: options.landscape ? 'landscape' : 'portrait',
        unit: 'cm',
        format: 'a4',
      });

      const fontName = await registerFonts(pdf);

      // Exact card dimensions derived from grid — no floating point surprises
      const cw = pgSize.w / options.cols;
      const ch = pgSize.h / options.rows;
      const mg = options.cardMargin;

      for (let pi = 0; pi < pages.length; pi++) {
        if (pi > 0) pdf.addPage();
        const page    = pages[pi];
        const isTitle = page.kind === 'terms';
        const totalCells = options.cols * options.rows;

        for (let ci = 0; ci < totalCells; ci++) {
          const term = page.chunk[ci];  // may be undefined for empty cells at end

          const srcCol = ci % options.cols;
          const row    = Math.floor(ci / options.cols);
          // Mirror columns on definition pages for correct duplex alignment
          const col    = isTitle ? srcCol : (options.cols - 1 - srcCol);

          const x = col * cw;
          const y = row * ch;

          // ── Background ──
          const [br, bg, bb] = hexRgb(options.bgColor);
          pdf.setFillColor(br, bg, bb);
          pdf.rect(x, y, cw, ch, 'F');

          // ── Dashed cut border ──
          pdf.setDrawColor(160, 160, 160);
          pdf.setLineWidth(0.015);
          pdf.setLineDashPattern([0.15, 0.15], 0);
          pdf.rect(x, y, cw, ch, 'S');
          pdf.setLineDashPattern([], 0);

          if (!term) continue; // empty cell — just draw the background box

          // ── Text ──
          const text      = isTitle ? term.term : term.definition;
          const fontSize  = isTitle ? options.titleFontSize  : options.defFontSize;
          const bold      = isTitle ? options.titleBold      : options.defBold;
          const italic    = isTitle ? options.titleItalic    : options.defItalic;
          const underline = isTitle ? options.titleUnderline : options.defUnderline;
          const alignment = isTitle ? options.titleAlignment : options.defAlignment;

          const [tr, tg, tb] = hexRgb(options.textColor);
          pdf.setTextColor(tr, tg, tb);

          const style = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
          pdf.setFont(fontName, style);
          pdf.setFontSize(fontSize);

          const innerW = cw - 2 * mg;
          const innerH = ch - 2 * mg;

          // Split text to fit card width
          const allLines = pdf.splitTextToSize(text, innerW) as string[];

          // 1 pt = 2.54/72 cm. Line height with 1.3 leading factor.
          const fontHcm  = (fontSize * 2.54) / 72;
          const lineHcm  = fontHcm * 1.3;

          // Clamp lines to what fits vertically
          const maxLines = Math.max(1, Math.floor(innerH / lineHcm));
          const lines    = allLines.slice(0, maxLines);

          const blockH   = lines.length * lineHcm;

          // Vertical center: top of block → add ascender to get first baseline
          const blockTop = y + mg + (innerH - blockH) / 2;
          const firstBaseline = blockTop + fontHcm * 0.82; // ~82% of em = ascender

          // Horizontal anchor
          let textX: number;
          if (alignment === 'center') {
            textX = x + mg + innerW / 2;
          } else if (alignment === 'right') {
            textX = x + cw - mg;
          } else {
            textX = x + mg;
          }

          pdf.text(lines, textX, firstBaseline, {
            align: alignment,
            lineHeightFactor: 1.3,
          });

          // Manual underline
          if (underline) {
            lines.forEach((line: string, li: number) => {
              const lineY = firstBaseline + li * lineHcm;
              const lineW = pdf.getTextWidth(line);
              const lx    = alignment === 'center' ? textX - lineW / 2
                          : alignment === 'right'  ? textX - lineW
                          : textX;
              pdf.setDrawColor(tr, tg, tb);
              pdf.setLineWidth(0.012);
              pdf.line(lx, lineY + 0.07, lx + lineW, lineY + 0.07);
            });
          }
        }
      }

      if (mode === 'download') {
        pdf.save(`${set.name.replace(/[^a-z0-9]/gi, '_')}_flashcards.pdf`);
      } else {
        const url = URL.createObjectURL(pdf.output('blob'));
        const win = window.open(url, '_blank');
        if (win) {
          win.addEventListener('load', () => {
            win.print();
            setTimeout(() => URL.revokeObjectURL(url), 30_000);
          });
        }
      }
    } finally {
      setGenerating(false);
    }
  }, [set, pages, options, pgSize]);

  // ── Sub-components ───────────────────────────────────────────────────────────

  function LabeledRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        {children}
      </div>
    );
  }

  function StyleToggles({ bold, italic, underline, onBold, onItalic, onUnderline }: {
    bold: boolean; italic: boolean; underline: boolean;
    onBold: () => void; onItalic: () => void; onUnderline: () => void;
  }) {
    const cls = (a: boolean) =>
      `px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
       ${a ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-300'}`;
    return (
      <div className="flex gap-1.5">
        <button type="button" onClick={onBold}      className={cls(bold)}>      <b>B</b></button>
        <button type="button" onClick={onItalic}    className={cls(italic)}>    <em>I</em></button>
        <button type="button" onClick={onUnderline} className={cls(underline)}> <u>U</u></button>
      </div>
    );
  }

  // ── Early returns ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (!set) return null;

  const totalTerms = set.terms.length;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(`/set/${id}`)}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-900 truncate">Print / Export — {set.name}</h1>
            <p className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
              <span>
                {totalTerms} terms · {options.cols}×{options.rows} grid ·{' '}
                {card.w.toFixed(1)}×{card.h.toFixed(1)} cm · {pages.length} PDF pages
              </span>
              {fontStatus === 'loading' && <span className="text-amber-500">⏳ Loading fonts…</span>}
              {fontStatus === 'ready'   && <span className="text-green-600">✓ Source Sans 3 ready</span>}
              {fontStatus === 'failed'  && <span className="text-red-500">⚠ Font failed, using Helvetica</span>}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => generatePDF('print')} disabled={generating || totalTerms === 0}
              className="flex items-center gap-1.5 bg-white border border-gray-300 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 text-xs font-medium px-3 py-2 rounded-xl transition-colors disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span className="hidden sm:inline">Print PDF</span>
            </button>
            <button onClick={() => generatePDF('download')} disabled={generating || totalTerms === 0}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-2 rounded-xl transition-colors disabled:opacity-50">
              {generating
                ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
              }
              <span className="hidden sm:inline">{generating ? 'Generating…' : 'Download PDF'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-screen-xl mx-auto w-full">

        {/* ── Options sidebar ── */}
        <aside className="lg:w-80 bg-white border-b lg:border-b-0 lg:border-r border-gray-200 p-5 flex flex-col gap-5 overflow-y-auto lg:h-[calc(100vh-57px)] lg:sticky lg:top-[57px]">

          {/* Grid layout */}
          <div>
            <h2 className="text-sm font-bold text-gray-800 mb-1">Grid Layout</h2>
            <p className="text-xs text-gray-400 mb-3">Cols × Rows — card size is computed automatically</p>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {GRID_PRESETS.map(p => {
                const active = options.cols === p.cols && options.rows === p.rows;
                return (
                  <button key={`${p.cols}x${p.rows}`} type="button"
                    onClick={() => { opt('cols', p.cols); opt('rows', p.rows); setPageIndex(0); }}
                    className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors
                      ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400'}`}>
                    {p.cols}×{p.rows}
                  </button>
                );
              })}
            </div>

            {/* Manual col/row inputs */}
            <div className="grid grid-cols-2 gap-3">
              <LabeledRow label="Columns">
                <input type="number" min={1} max={8} value={options.cols}
                  onChange={e => { opt('cols', Math.max(1, parseInt(e.target.value) || 1)); setPageIndex(0); }}
                  className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full" />
              </LabeledRow>
              <LabeledRow label="Rows">
                <input type="number" min={1} max={8} value={options.rows}
                  onChange={e => { opt('rows', Math.max(1, parseInt(e.target.value) || 1)); setPageIndex(0); }}
                  className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full" />
              </LabeledRow>
            </div>

            <div className="mt-3 bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-500 space-y-0.5">
              <div>Card size: <strong>{card.w.toFixed(2)} × {card.h.toFixed(2)} cm</strong></div>
              <div>{perPage} cards/page · {Math.ceil(totalTerms / perPage)} batches · {pages.length} PDF pages</div>
            </div>

            {/* Landscape toggle */}
            <button type="button"
              onClick={() => { opt('landscape', !options.landscape); setPageIndex(0); }}
              className={`mt-3 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors
                ${options.landscape ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-300'}`}>
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              {options.landscape ? 'Landscape A4 (on)' : 'Landscape A4 (off)'}
            </button>
          </div>

          {/* Inner margin */}
          <div className="border-t border-gray-100 pt-4">
            <LabeledRow label={`Inner Margin: ${options.cardMargin} cm`}>
              <input type="range" min={0} max={2} step={0.05} value={options.cardMargin}
                onChange={e => opt('cardMargin', parseFloat(e.target.value))}
                className="w-full accent-indigo-600" />
            </LabeledRow>
          </div>

          {/* Colors */}
          <div className="border-t border-gray-100 pt-4">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Colors</h2>
            <div className="flex flex-col gap-3">
              <ColorPickerField label="Background" value={options.bgColor}   onChange={v => opt('bgColor', v)} />
              <ColorPickerField label="Text Color"  value={options.textColor} onChange={v => opt('textColor', v)} />
            </div>
          </div>

          {/* Typography */}
          <div className="border-t border-gray-100 pt-4">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Typography</h2>
            <div className="space-y-3">

              {/* Term side */}
              <div className="bg-indigo-50 rounded-xl p-3 space-y-2.5">
                <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Term side</div>
                <LabeledRow label={`Font size: ${options.titleFontSize}pt`}>
                  <input type="range" min={6} max={72} value={options.titleFontSize}
                    onChange={e => opt('titleFontSize', parseInt(e.target.value))}
                    className="w-full accent-indigo-600" />
                </LabeledRow>
                <LabeledRow label="Alignment">
                  <AlignPicker value={options.titleAlignment} onChange={v => opt('titleAlignment', v)} />
                </LabeledRow>
                <StyleToggles
                  bold={options.titleBold} italic={options.titleItalic} underline={options.titleUnderline}
                  onBold={() => opt('titleBold', !options.titleBold)}
                  onItalic={() => opt('titleItalic', !options.titleItalic)}
                  onUnderline={() => opt('titleUnderline', !options.titleUnderline)}
                />
              </div>

              {/* Definition side */}
              <div className="bg-purple-50 rounded-xl p-3 space-y-2.5">
                <div className="text-xs font-bold text-purple-600 uppercase tracking-wide">Definition side</div>
                <LabeledRow label={`Font size: ${options.defFontSize}pt`}>
                  <input type="range" min={6} max={60} value={options.defFontSize}
                    onChange={e => opt('defFontSize', parseInt(e.target.value))}
                    className="w-full accent-purple-600" />
                </LabeledRow>
                <LabeledRow label="Alignment">
                  <AlignPicker value={options.defAlignment} onChange={v => opt('defAlignment', v)} />
                </LabeledRow>
                <StyleToggles
                  bold={options.defBold} italic={options.defItalic} underline={options.defUnderline}
                  onBold={() => opt('defBold', !options.defBold)}
                  onItalic={() => opt('defItalic', !options.defItalic)}
                  onUnderline={() => opt('defUnderline', !options.defUnderline)}
                />
              </div>
            </div>
          </div>
        </aside>

        {/* ── Preview area ── */}
        <main className="flex-1 p-4 lg:p-6 flex flex-col gap-4 min-w-0">
          {totalTerms === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 py-20 text-center">
              <div>
                <p className="text-sm font-medium">No terms yet</p>
                <p className="text-xs mt-1">Go back and add terms to this set first</p>
              </div>
            </div>
          ) : (
            <>
              {/* Page navigator */}
              <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-gray-800">
                    Page {safeIdx + 1} / {pages.length}
                  </span>
                  {curPage && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                      ${curPage.kind === 'terms' ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'}`}>
                      {curPage.kind === 'terms' ? '▲ Terms' : '▼ Definitions'}
                    </span>
                  )}
                  {curPage && (
                    <span className="text-xs text-gray-400">
                      cards {curPage.chunkIndex * perPage + 1}–{Math.min((curPage.chunkIndex + 1) * perPage, totalTerms)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {[
                    { label: '«', fn: () => setPageIndex(0),                                        dis: safeIdx === 0 },
                    { label: '‹', fn: () => setPageIndex(i => Math.max(0, i - 1)),                  dis: safeIdx === 0 },
                    { label: '›', fn: () => setPageIndex(i => Math.min(pages.length - 1, i + 1)),   dis: safeIdx >= pages.length - 1 },
                    { label: '»', fn: () => setPageIndex(pages.length - 1),                         dis: safeIdx >= pages.length - 1 },
                  ].map(btn => (
                    <button key={btn.label} type="button" onClick={btn.fn} disabled={btn.dis}
                      className="w-8 h-8 flex items-center justify-center text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors">
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* A4 preview */}
              {curPage && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                  <A4PagePreview page={curPage} options={options} />
                </div>
              )}

              {/* Page strip */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">All PDF Pages</h3>
                <div className="flex flex-wrap gap-2">
                  {pages.map((p, i) => (
                    <button key={i} type="button" onClick={() => setPageIndex(i)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl border transition-colors
                        ${i === safeIdx
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0
                        ${i === safeIdx ? 'bg-white/70' : p.kind === 'terms' ? 'bg-indigo-400' : 'bg-purple-400'}`} />
                      p{i + 1} {p.kind === 'terms' ? 'T' : 'D'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tip */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-semibold text-amber-800 mb-1">💡 Duplex printing</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Pages alternate <strong>T (terms) → D (definitions)</strong> for each batch of {perPage} cards.
                  Definition pages are horizontally mirrored so duplex printing
                  (<em>flip on short edge</em>) aligns each card's back to its front. Cut along the dashed lines.
                </p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
