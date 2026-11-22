import { describe, expect, it } from 'vitest'
import { backupFileName, buildBackup, mergeHistory, parseBackup, type History } from './backup'
import type { FocusSession } from './sessions'
import { DEFAULT_TAGS } from './tags'

const session = (id: string, start: number, tag: string | null = 'study'): FocusSession => ({
  id,
  start,
  end: start + 60_000,
  focusedMs: 60_000,
  tag,
})

describe('buildBackup / parseBackup', () => {
  it('round-trips through JSON', () => {
    const history: History = { sessions: [session('a', 1)], tags: [...DEFAULT_TAGS] }
    const text = JSON.stringify(buildBackup(history, 123))
    expect(parseBackup(text)).toEqual(history)
  })

  it('rejects invalid JSON and files from other apps or versions', () => {
    expect(parseBackup('not json')).toBeNull()
    expect(parseBackup('null')).toBeNull()
    expect(parseBackup('[]')).toBeNull()
    expect(parseBackup(JSON.stringify({ app: 'other', version: 1, sessions: [], tags: [] }))).toBeNull()
    expect(parseBackup(JSON.stringify({ app: 'slowburn', version: 2, sessions: [], tags: [] }))).toBeNull()
    expect(parseBackup(JSON.stringify({ app: 'slowburn', version: 1, sessions: {}, tags: [] }))).toBeNull()
  })

  it('drops invalid records but keeps the valid ones', () => {
    const text = JSON.stringify({
      app: 'slowburn',
      version: 1,
      sessions: [session('a', 1), { id: 'bad' }],
      tags: [{ id: 'study', name: 'Study' }, { id: '', name: 'x' }],
    })
    expect(parseBackup(text)).toEqual({ sessions: [session('a', 1)], tags: [{ id: 'study', name: 'Study' }] })
  })

  it('names the file by local date', () => {
    expect(backupFileName(new Date(2026, 10, 2, 23, 30).getTime())).toBe('slowburn-backup-2026-11-02.json')
  })
})

describe('mergeHistory', () => {
  it('adds new sessions sorted by start and skips ones already present', () => {
    const current: History = { sessions: [session('a', 10), session('b', 30)], tags: [...DEFAULT_TAGS] }
    const incoming: History = { sessions: [session('b', 30), session('c', 20)], tags: [...DEFAULT_TAGS] }
    const r = mergeHistory(current, incoming)
    expect(r.sessions.map((s) => s.id)).toEqual(['a', 'c', 'b'])
    expect(r.addedSessions).toBe(1)
    expect(r.addedTags).toBe(0)
  })

  it('is idempotent', () => {
    const current: History = { sessions: [session('a', 10)], tags: [...DEFAULT_TAGS] }
    const incoming: History = { sessions: [session('x', 5)], tags: [...DEFAULT_TAGS, { id: 'w', name: 'Writing' }] }
    const once = mergeHistory(current, incoming)
    const twice = mergeHistory(once, incoming)
    expect(twice.sessions).toEqual(once.sessions)
    expect(twice.tags).toEqual(once.tags)
    expect(twice.addedSessions).toBe(0)
  })

  it('adds unknown tags and keeps their imported sessions', () => {
    const current: History = { sessions: [], tags: [...DEFAULT_TAGS] }
    const incoming: History = { sessions: [session('a', 1, 'w')], tags: [{ id: 'w', name: 'Writing', archived: true }] }
    const r = mergeHistory(current, incoming)
    expect(r.tags).toContainEqual({ id: 'w', name: 'Writing', archived: true })
    expect(r.sessions[0].tag).toBe('w')
    expect(r.addedTags).toBe(1)
  })

  it('relabels sessions to a local tag with the same name but a different id', () => {
    const current: History = { sessions: [], tags: [{ id: 'local', name: 'Writing' }] }
    const incoming: History = { sessions: [session('a', 1, 'remote')], tags: [{ id: 'remote', name: 'writing' }] }
    const r = mergeHistory(current, incoming)
    expect(r.tags).toEqual([{ id: 'local', name: 'Writing' }])
    expect(r.sessions[0].tag).toBe('local')
  })

  it('keeps the local tag name and archived state when ids match', () => {
    const current: History = { sessions: [], tags: [{ id: 'study', name: 'Study', archived: true }] }
    const incoming: History = { sessions: [], tags: [{ id: 'study', name: 'Studying' }] }
    expect(mergeHistory(current, incoming).tags).toEqual(current.tags)
  })

  it('keeps untagged and unknown-tag sessions as they are', () => {
    const current: History = { sessions: [], tags: [] }
    const incoming: History = { sessions: [session('a', 1, null), session('b', 2, 'ghost')], tags: [] }
    expect(mergeHistory(current, incoming).sessions.map((s) => s.tag)).toEqual([null, 'ghost'])
  })
})
