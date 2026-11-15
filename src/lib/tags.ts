// Tags categorize focus sessions (Study, Reading, ...). Sessions store the tag id,
// so renaming is safe. Deleting a tag that has sessions archives it instead, so
// its history still shows in the breakdown.

import type { FocusSession } from './sessions'

export interface Tag {
  id: string
  name: string
  /** Hidden from the picker but kept so past sessions keep their label. */
  archived?: boolean
}

export const MAX_TAG_NAME = 24

export const DEFAULT_TAGS: readonly Tag[] = [
  { id: 'study', name: 'Study' },
  { id: 'reading', name: 'Reading' },
  { id: 'research', name: 'Research' },
  { id: 'teaching', name: 'Teaching' },
]

export function isTag(x: unknown): x is Tag {
  if (typeof x !== 'object' || x === null) return false
  const t = x as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    t.id !== '' &&
    typeof t.name === 'string' &&
    t.name.trim() !== '' &&
    (t.archived === undefined || typeof t.archived === 'boolean')
  )
}

/** Keeps valid tags with unique ids. */
export function parseTags(x: unknown): Tag[] {
  if (!Array.isArray(x)) return []
  const seen = new Set<string>()
  return x.filter((t): t is Tag => isTag(t) && !seen.has(t.id) && Boolean(seen.add(t.id)))
}

export const activeTags = (tags: readonly Tag[]) => tags.filter((t) => !t.archived)

export const cleanTagName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_NAME)

export type AddTagResult = { ok: true; tags: Tag[]; tag: Tag } | { ok: false; reason: 'empty' | 'duplicate' }

/**
 * Adds a tag. Re-adding the name of an archived tag restores it (keeping its history)
 * instead of creating a duplicate.
 */
export function addTag(
  tags: readonly Tag[],
  rawName: string,
  makeId: () => string = () => crypto.randomUUID(),
): AddTagResult {
  const name = cleanTagName(rawName)
  if (!name) return { ok: false, reason: 'empty' }
  const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
  if (existing && !existing.archived) return { ok: false, reason: 'duplicate' }
  if (existing) {
    const restored = { id: existing.id, name }
    return { ok: true, tag: restored, tags: tags.map((t) => (t.id === existing.id ? restored : t)) }
  }
  const tag = { id: makeId(), name }
  return { ok: true, tag, tags: [...tags, tag] }
}

/**
 * Removes a tag, or archives it if any session uses it. Pass `inUse` when a running
 * focus phase will still record this tag.
 */
export function removeTag(
  tags: readonly Tag[],
  id: string,
  sessions: readonly FocusSession[],
  inUse = false,
): Tag[] {
  const used = inUse || sessions.some((s) => s.tag === id)
  return used ? tags.map((t) => (t.id === id ? { ...t, archived: true } : t)) : tags.filter((t) => t.id !== id)
}
