import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { InboxRecord, PieceRecord } from '../types'

// This module is imported by the service worker as well as the app, so it must
// not touch anything that only exists on window.

interface KeywayDB extends DBSchema {
  pieces: { key: string; value: PieceRecord; indexes: { addedAt: number } }
  inbox: { key: string; value: InboxRecord }
}

let dbPromise: Promise<IDBPDatabase<KeywayDB>> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB<KeywayDB>('keyway', 1, {
      upgrade(database) {
        const pieces = database.createObjectStore('pieces', { keyPath: 'id' })
        pieces.createIndex('addedAt', 'addedAt')
        database.createObjectStore('inbox', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

export async function putPiece(piece: PieceRecord): Promise<void> {
  await (await db()).put('pieces', piece)
}

export async function getPiece(id: string): Promise<PieceRecord | undefined> {
  return (await db()).get('pieces', id)
}

/** Newest first. */
export async function listPieces(): Promise<PieceRecord[]> {
  const all = await (await db()).getAllFromIndex('pieces', 'addedAt')
  return all.reverse()
}

export async function deletePiece(id: string): Promise<void> {
  await (await db()).delete('pieces', id)
}

export async function putInbox(record: InboxRecord): Promise<void> {
  await (await db()).put('inbox', record)
}

export async function takeInbox(id: string): Promise<InboxRecord | undefined> {
  const database = await db()
  const record = await database.get('inbox', id)
  if (record) await database.delete('inbox', id)
  return record
}
