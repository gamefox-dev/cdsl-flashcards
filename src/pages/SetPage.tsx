import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { getSet, saveSet, generateId } from '../db';
import type { FlashcardSet, Term } from '../db';
import { Modal } from '../components/Modal';

export function SetPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [set, setSet] = useState<FlashcardSet | null>(null);
  const [loading, setLoading] = useState(true);

  // Term edit/add modal
  const [termModalOpen, setTermModalOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [termInput, setTermInput] = useState('');
  const [defInput, setDefInput] = useState('');

  // Delete term modal
  const [deleteTermOpen, setDeleteTermOpen] = useState(false);
  const [targetTerm, setTargetTerm] = useState<Term | null>(null);

  // Import modal
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const data = await getSet(id);
    if (!data) { navigate('/'); return; }
    setSet(data);
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const persist = async (updated: FlashcardSet) => {
    await saveSet({ ...updated, updatedAt: Date.now() });
    setSet({ ...updated, updatedAt: Date.now() });
  };

  const openAddTerm = () => {
    setEditingTerm(null);
    setTermInput('');
    setDefInput('');
    setTermModalOpen(true);
  };

  const openEditTerm = (term: Term) => {
    setEditingTerm(term);
    setTermInput(term.term);
    setDefInput(term.definition);
    setTermModalOpen(true);
  };

  const handleSaveTerm = async () => {
    if (!set) return;
    const t = termInput.trim();
    const d = defInput.trim();
    if (!t || !d) return;

    let terms: Term[];
    if (editingTerm) {
      terms = set.terms.map(x => x.id === editingTerm.id ? { ...x, term: t, definition: d } : x);
    } else {
      terms = [...set.terms, { id: generateId(), term: t, definition: d }];
    }
    await persist({ ...set, terms });
    setTermModalOpen(false);
  };

  const openDeleteTerm = (term: Term) => {
    setTargetTerm(term);
    setDeleteTermOpen(true);
  };

  const handleDeleteTerm = async () => {
    if (!set || !targetTerm) return;
    const terms = set.terms.filter(x => x.id !== targetTerm.id);
    await persist({ ...set, terms });
    setDeleteTermOpen(false);
    setTargetTerm(null);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportJson((ev.target?.result as string) || '');
      setImportError('');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!set) return;
    try {
      const parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array');
      const newTerms: Term[] = parsed.map((item: unknown, i: number) => {
        if (typeof item !== 'object' || item === null) throw new Error(`Item ${i} is not an object`);
        const obj = item as Record<string, unknown>;
        if (typeof obj.term !== 'string' || typeof obj.definition !== 'string') {
          throw new Error(`Item ${i} must have "term" and "definition" string fields`);
        }
        return { id: generateId(), term: obj.term, definition: obj.definition };
      });
      await persist({ ...set, terms: [...set.terms, ...newTerms] });
      setImportOpen(false);
      setImportJson('');
      setImportError('');
    } catch (e) {
      setImportError((e as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!set) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900 truncate">{set.name}</h1>
            <p className="text-xs text-gray-400">{set.terms.length} term{set.terms.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => navigate(`/set/${id}/print`)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span className="hidden sm:inline">Print / Export</span>
            <span className="sm:hidden">Print</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Action bar */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={openAddTerm}
            className="flex items-center gap-2 bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Term
          </button>
          <button
            onClick={() => { setImportJson(''); setImportError(''); setImportOpen(true); }}
            className="flex items-center gap-2 bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Import JSON
          </button>
        </div>

        {/* Terms list */}
        {set.terms.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No terms yet</h3>
            <p className="text-gray-400 mb-6">Add terms manually or import from JSON</p>
            <button onClick={openAddTerm} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-3 rounded-xl transition-colors">
              Add First Term
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {set.terms.map((term, i) => (
              <div key={term.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="p-5 flex gap-4">
                  <span className="text-xs text-gray-400 font-mono mt-1 shrink-0 w-6 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-1">Term</div>
                      <div className="text-sm text-gray-900 whitespace-pre-wrap">{term.term}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-purple-500 uppercase tracking-wide mb-1">Definition</div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">{term.definition}</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => openEditTerm(term)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => openDeleteTerm(term)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add/Edit Term Modal */}
      <Modal
        isOpen={termModalOpen}
        onClose={() => setTermModalOpen(false)}
        title={editingTerm ? 'Edit Term' : 'Add Term'}
        maxWidth="max-w-lg"
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Term</label>
            <textarea
              autoFocus
              value={termInput}
              onChange={e => setTermInput(e.target.value)}
              rows={3}
              placeholder="Enter term..."
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Definition</label>
            <textarea
              value={defInput}
              onChange={e => setDefInput(e.target.value)}
              rows={4}
              placeholder="Enter definition..."
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setTermModalOpen(false)}
              className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveTerm}
              disabled={!termInput.trim() || !defInput.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
            >
              {editingTerm ? 'Save Changes' : 'Add Term'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Term Modal */}
      <Modal isOpen={deleteTermOpen} onClose={() => setDeleteTermOpen(false)} title="Delete Term">
        <div className="p-6">
          <p className="text-gray-600 text-sm mb-3">Are you sure you want to delete this term?</p>
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="text-sm font-medium text-gray-900 mb-1">{targetTerm?.term}</div>
            <div className="text-xs text-gray-500 line-clamp-2">{targetTerm?.definition}</div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTermOpen(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm">Cancel</button>
            <button onClick={handleDeleteTerm} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm">Delete</button>
          </div>
        </div>
      </Modal>

      {/* Import JSON Modal */}
      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Import from JSON" maxWidth="max-w-lg">
        <div className="p-6 space-y-4">
          <div className="bg-indigo-50 rounded-xl p-4 text-xs text-indigo-700">
            <p className="font-semibold mb-1">Expected format:</p>
            <pre className="overflow-x-auto">{`[
  {
    "term": "Self-discipline",
    "definition": "(n) the ability to control..."
  }
]`}</pre>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Paste JSON or upload file</label>
            <textarea
              value={importJson}
              onChange={e => { setImportJson(e.target.value); setImportError(''); }}
              rows={8}
              placeholder='[{"term": "...", "definition": "..."}]'
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-indigo-600 hover:underline"
            >
              Or upload a .json file
            </button>
          </div>
          {importError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {importError}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setImportOpen(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm">Cancel</button>
            <button onClick={handleImport} disabled={!importJson.trim()} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-colors text-sm">Import</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
