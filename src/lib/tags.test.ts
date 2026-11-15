import { describe, expect, it } from 'vitest'
import type { FocusSession } from './sessions'
import { DEFAULT_TAGS, MAX_TAG_NAME, activeTags, addTag, parseTags, removeTag } from './tags'

const ids = () => {
  let n = 0
  return () => `t${++n}`
}
const sessionWith = (tag: string | null): FocusSession => ({ id: 's', start: 0, end: 1, focusedMs: 1, tag })

describe('addTag', () => {
  it('adds a trimmed, single-spaced name', () => {
    const r = addTag(DEFAULT_TAGS, '  Deep   work ', ids())
    expect(r).toMatchObject({ ok: true, tag: { id: 't1', name: 'Deep work' } })
  })

  it('rejects empty and duplicate names (case-insensitive)', () => {
    expect(addTag(DEFAULT_TAGS, '   ')).toEqual({ ok: false, reason: 'empty' })
    expect(addTag(DEFAULT_TAGS, 'study')).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('caps the name length', () => {
    const r = addTag([], 'x'.repeat(100), ids())
    expect(r.ok && r.tag.name.length).toBe(MAX_TAG_NAME)
  })

  it('restores an archived tag with the same name instead of duplicating it', () => {
    const tags = [{ id: 'old', name: 'Writing', archived: true }]
    const r = addTag(tags, 'writing', ids())
    expect(r).toEqual({ ok: true, tag: { id: 'old', name: 'writing' }, tags: [{ id: 'old', name: 'writing' }] })
  })
})

describe('removeTag', () => {
  it('deletes an unused tag', () => {
    expect(removeTag(DEFAULT_TAGS, 'study', []).map((t) => t.id)).toEqual(['reading', 'research', 'teaching'])
  })

  it('archives a tag that sessions still use', () => {
    const out = removeTag(DEFAULT_TAGS, 'study', [sessionWith('study')])
    expect(out.find((t) => t.id === 'study')).toEqual({ id: 'study', name: 'Study', archived: true })
    expect(activeTags(out).map((t) => t.id)).not.toContain('study')
  })

  it('archives a tag the running timer will still record', () => {
    expect(removeTag(DEFAULT_TAGS, 'study', [], true).find((t) => t.id === 'study')?.archived).toBe(true)
  })
})

describe('parseTags', () => {
  it('drops invalid and duplicate-id tags', () => {
    expect(parseTags([{ id: 'a', name: 'A' }, { id: 'a', name: 'Again' }, { id: '', name: 'x' }, { id: 'b', name: ' ' }, 3])).toEqual([
      { id: 'a', name: 'A' },
    ])
    expect(parseTags('nope')).toEqual([])
  })
})
