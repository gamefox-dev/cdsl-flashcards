import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

export interface Term {
  id: string;
  term: string;
  definition: string;
}

export interface FlashcardSet {
  id: string;
  name: string;
  terms: Term[];
  createdAt: number;
  updatedAt: number;
}

interface FlashcardDB extends DBSchema {
  sets: {
    key: string;
    value: FlashcardSet;
    indexes: { 'by-updated': number };
  };
}

let dbPromise: Promise<IDBPDatabase<FlashcardDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<FlashcardDB>('fearless-flashcards', 1, {
      upgrade(db) {
        const store = db.createObjectStore('sets', { keyPath: 'id' });
        store.createIndex('by-updated', 'updatedAt');
      },
    });
  }
  return dbPromise;
}

export async function getAllSets(): Promise<FlashcardSet[]> {
  const db = await getDB();
  const sets = await db.getAllFromIndex('sets', 'by-updated');
  return sets.reverse();
}

export async function getSet(id: string): Promise<FlashcardSet | undefined> {
  const db = await getDB();
  return db.get('sets', id);
}

export async function saveSet(set: FlashcardSet): Promise<void> {
  const db = await getDB();
  await db.put('sets', set);
}

export async function deleteSet(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('sets', id);
}

export function generateId(): string {
  return crypto.randomUUID();
}
