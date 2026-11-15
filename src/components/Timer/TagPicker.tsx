import { useState, type FormEvent } from 'react'
import { MAX_TAG_NAME, activeTags, type AddTagResult, type Tag } from '../../lib/tags'

interface Props {
  tags: Tag[]
  selected: string | null
  /** True when a tag must be picked before focus can start. */
  required: boolean
  locked: boolean
  onSelect: (id: string | null) => void
  onAdd: (name: string) => AddTagResult
  onRemove: (id: string) => void
}

export function TagPicker({ tags, selected, required, locked, onSelect, onAdd, onRemove }: Props) {
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const visible = activeTags(tags)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const result = onAdd(name)
    if (!result.ok) {
      setError(result.reason === 'empty' ? 'Type a name for the tag.' : 'That tag already exists.')
      return
    }
    if (!locked) onSelect(result.tag.id)
    setName('')
    setError(null)
    setAdding(false)
  }

  const cancelAdd = () => {
    setAdding(false)
    setName('')
    setError(null)
  }

  return (
    <div className="tags">
      <div className="tags-head">
        <span className="tags-title" id="tags-title">
          Tag this session
        </span>
        {visible.length > 0 && (
          <button type="button" className="link-btn" onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
            {editing ? 'Done' : 'Edit tags'}
          </button>
        )}
      </div>

      <div className="tag-list" role="group" aria-labelledby="tags-title">
        {visible.map((tag) =>
          editing ? (
            <span key={tag.id} className="tag-chip tag-chip-editing">
              {tag.name}
              <button type="button" className="tag-remove" aria-label={`Delete tag ${tag.name}`} onClick={() => onRemove(tag.id)}>
                ×
              </button>
            </span>
          ) : (
            <button
              key={tag.id}
              type="button"
              className="tag-chip"
              aria-pressed={selected === tag.id}
              disabled={locked}
              onClick={() => onSelect(selected === tag.id ? null : tag.id)}
            >
              {tag.name}
            </button>
          ),
        )}

        {adding ? (
          <form className="tag-add-form" onSubmit={submit}>
            <input
              autoFocus
              aria-label="New tag name"
              placeholder="Tag name"
              maxLength={MAX_TAG_NAME}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => e.key === 'Escape' && cancelAdd()}
              onBlur={() => !name.trim() && cancelAdd()}
            />
            <button type="submit" className="tag-chip">
              Add
            </button>
          </form>
        ) : (
          <button type="button" className="tag-chip tag-chip-new" onClick={() => setAdding(true)}>
            + New tag
          </button>
        )}
      </div>

      <p className="tags-note" id="tags-note" role={error ? 'alert' : undefined} data-required={required || undefined}>
        {error ??
          (required
            ? visible.length
              ? 'Pick a tag to start focusing.'
              : 'Add a tag to start focusing.'
            : locked
              ? 'You can switch tags between phases.'
              : '\u00a0')}
      </p>
    </div>
  )
}
