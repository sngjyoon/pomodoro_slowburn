// Export/import of focus history as a JSON file. localStorage is per browser and
// per origin, so this is the only way to move history between them.

import { parseSessions, type FocusSession } from './sessions'
import { parseTags, type Tag } from './tags'

export const BACKUP_APP = 'slowburn'
export const BACKUP_VERSION = 1

export interface Backup {
  app: typeof BACKUP_APP
  version: typeof BACKUP_VERSION
  exportedAt: number
  sessions: FocusSession[]
  tags: Tag[]
}

export interface History {
  sessions: FocusSession[]
  tags: Tag[]
}

export function buildBackup(history: History, now: number): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now, sessions: history.sessions, tags: history.tags }
}

/** File name like `slowburn-backup-2026-11-22.json`, using the local date. */
export function backupFileName(now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${BACKUP_APP}-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

/** Parses a backup file's text. Returns null if it isn't a Slowburn backup; drops invalid records otherwise. */
export function parseBackup(text: string): History | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>
  if (b.app !== BACKUP_APP || b.version !== BACKUP_VERSION) return null
  if (!Array.isArray(b.sessions) || !Array.isArray(b.tags)) return null
  return { sessions: parseSessions(b.sessions), tags: parseTags(b.tags) }
}

export interface MergeResult extends History {
  addedSessions: number
  addedTags: number
}

/**
 * Merges imported history into the current one without losing or duplicating anything.
 * - Sessions already present (same id) are skipped, so importing twice is harmless.
 * - Tags match by id, then by name (case-insensitive): custom tags get random ids, so the
 *   same "Writing" tag has a different id in each browser. Imported sessions are relabeled
 *   to the matching local tag.
 * - Existing tags keep their local name and archived state.
 */
export function mergeHistory(current: History, incoming: History): MergeResult {
  const tags = [...current.tags]
  const byId = new Map(tags.map((t) => [t.id, t]))
  const byName = new Map(tags.map((t) => [t.name.toLowerCase(), t]))
  const remap = new Map<string, string>()
  let addedTags = 0

  for (const tag of incoming.tags) {
    const match = byId.get(tag.id) ?? byName.get(tag.name.toLowerCase())
    if (match) {
      remap.set(tag.id, match.id)
      continue
    }
    tags.push(tag)
    byId.set(tag.id, tag)
    byName.set(tag.name.toLowerCase(), tag)
    remap.set(tag.id, tag.id)
    addedTags++
  }

  const seen = new Set(current.sessions.map((s) => s.id))
  const added: FocusSession[] = []
  for (const s of incoming.sessions) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    added.push({ ...s, tag: s.tag === null ? null : (remap.get(s.tag) ?? s.tag) })
  }

  const sessions = added.length ? [...current.sessions, ...added].sort((a, b) => a.start - b.start) : current.sessions
  return { sessions, tags, addedSessions: added.length, addedTags }
}
