import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { getAllSets, saveSet, deleteSet, generateId } from '../db';
import type { FlashcardSet } from '../db';
import { Modal } from '../components/Modal';

export function HomePage() {
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();

  // Modal states
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [targetSet, setTargetSet] = useState<FlashcardSet | null>(null);

  const loadSets = useCallback(async () => {
    const data = await getAllSets();
    setSets(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSets();
  }, [loadSets]);

  const handleCreate = async () => {
    const name = nameInput.trim();
    if (!name) return;
    const newSet: FlashcardSet = {
      id: generateId(),
      name,
      terms: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveSet(newSet);
    setCreateOpen(false);
    setNameInput('');
    navigate(`/set/${newSet.id}`);
  };

  const handleRenameOpen = (set: FlashcardSet) => {
    setTargetSet(set);
    setNameInput(set.name);
    setRenameOpen(true);
  };

  const handleRename = async () => {
    if (!targetSet) return;
    const name = nameInput.trim();
    if (!name) return;
    await saveSet({ ...targetSet, name, updatedAt: Date.now() });
    setRenameOpen(false);
    setNameInput('');
    setTargetSet(null);
    loadSets();
  };

  const handleDeleteOpen = (set: FlashcardSet) => {
    setTargetSet(set);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!targetSet) return;
    await deleteSet(targetSet.id);
    setDeleteOpen(false);
    setTargetSet(null);
    loadSets();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900 hidden sm:block">Fearless Flashcards</h1>
            <h1 className="text-lg font-bold text-gray-900 sm:hidden">Flashcards</h1>
          </div>
          <button
            onClick={() => { setNameInput(''); setCreateOpen(true); }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Set</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Your Flashcard Sets</h2>
          <p className="text-gray-500 text-sm mt-1">{sets.length} set{sets.length !== 1 ? 's' : ''}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : sets.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No sets yet</h3>
            <p className="text-gray-400 mb-6">Create your first flashcard set to get started</p>
            <button
              onClick={() => { setNameInput(''); setCreateOpen(true); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
            >
              Create Set
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sets.map(set => (
              <div
                key={set.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => navigate(`/set/${set.id}`)}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-gray-900 text-base leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                      {set.name}
                    </h3>
                    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleRenameOpen(set)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Rename"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteOpen(set)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-indigo-600 font-medium mb-3">
                    {set.terms.length} term{set.terms.length !== 1 ? 's' : ''}
                  </div>
                  {set.terms.length > 0 && (
                    <div className="space-y-1">
                      {set.terms.slice(0, 3).map((term, i) => (
                        <div key={i} className="text-xs text-gray-500 truncate flex items-center gap-1.5">
                          <span className="w-1 h-1 bg-gray-300 rounded-full shrink-0" />
                          {term.term}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-5 pb-3 pt-0">
                  <div className="text-xs text-gray-400">
                    Updated {new Date(set.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Flashcard Set">
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Set name</label>
          <input
            autoFocus
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="e.g. English Vocabulary Chapter 3"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setCreateOpen(false)}
              className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!nameInput.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>

      {/* Rename Modal */}
      <Modal isOpen={renameOpen} onClose={() => setRenameOpen(false)} title="Rename Set">
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Set name</label>
          <input
            autoFocus
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); }}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setRenameOpen(false)}
              className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleRename}
              disabled={!nameInput.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Set">
        <div className="p-6">
          <p className="text-gray-600 text-sm mb-1">Are you sure you want to delete</p>
          <p className="font-semibold text-gray-900 mb-4">"{targetSet?.name}"?</p>
          <p className="text-red-500 text-sm mb-6">This action cannot be undone. All {targetSet?.terms.length} term{targetSet?.terms.length !== 1 ? 's' : ''} will be permanently deleted.</p>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteOpen(false)}
              className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
