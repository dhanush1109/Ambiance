import { useState } from 'react'
import FavoriteCard from '../components/FavoriteCard'
import Sheet from '../components/Sheet'
import Icon from '../components/Icon'
import { useFavoritesStore } from '../state/favoritesStore'
import { useConnectionStore, isConnected } from '../state/connectionStore'
import { useUiStore } from '../state/uiStore'
import { controller } from '../services/controller'
import { haptics } from '../services/haptics'
import './settings.css'

export default function FavoritesScreen() {
  const items = useFavoritesStore((s) => s.items)
  const add = useFavoritesStore((s) => s.add)
  const remove = useFavoritesStore((s) => s.remove)
  const rename = useFavoritesStore((s) => s.rename)
  const move = useFavoritesStore((s) => s.move)

  const connected = useConnectionStore(isConnected)
  const showToast = useUiStore((s) => s.showToast)

  const [renaming, setRenaming] = useState(null)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState(null)

  const save = () => {
    haptics.tap()
    const item = add()
    showToast(`Saved “${item.name}”`, 'ok')
  }

  return (
    <div className="screen">
      <div className="screen-headrow">
        <div>
          <h1 className="screen-title">Saved looks</h1>
          <p className="screen-sub">Your own colour pairs, ready to recall.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={save}>
          <Icon name="plus" size={18} />
          Save current
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty card">
          <Icon name="favorites" size={28} className="empty-icon" />
          <h2 className="empty-title">Nothing saved yet</h2>
          <p className="empty-text">
            Set a colour you like on the Home screen — or apply one of the Moods — then tap
            <b> Save current</b> and it will wait here for you.
          </p>
        </div>
      ) : (
        <div className="fav-list">
          {items.map((f, i) => (
            <FavoriteCard
              key={f.id}
              fav={f}
              disabled={!connected}
              isFirst={i === 0}
              isLast={i === items.length - 1}
              onApply={(fav) => {
                haptics.tap()
                controller.applyFavorite(fav)
                showToast(fav.name, 'ok')
              }}
              onRename={(fav) => {
                setRenaming(fav)
                setDraft(fav.name)
              }}
              onRemove={(fav) => setConfirming(fav)}
              onMove={move}
            />
          ))}
        </div>
      )}

      <Sheet
        open={!!renaming}
        title="Rename look"
        onClose={() => setRenaming(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setRenaming(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                haptics.tap()
                rename(renaming.id, draft)
                setRenaming(null)
                showToast('Renamed', 'ok')
              }}
            >
              Save
            </button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">Name</span>
          <input
            className="field-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={40}
            autoFocus
          />
        </label>
      </Sheet>

      <Sheet
        open={!!confirming}
        title="Delete this look?"
        onClose={() => setConfirming(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirming(null)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                haptics.tap()
                remove(confirming.id)
                setConfirming(null)
                showToast('Deleted', 'info')
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="sheet-text">
          “{confirming?.name}” will be removed. This cannot be undone.
        </p>
      </Sheet>
    </div>
  )
}
