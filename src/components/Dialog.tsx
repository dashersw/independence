import React, { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

export interface DialogRequest {
  kind: 'prompt' | 'confirm'
  title: string
  defaultValue?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: (value: string) => void
}

// HUD-styled replacement for window.prompt / window.confirm: same dark panel,
// gold accents and typography as the rest of the interface, so save naming and
// destructive confirmations don't drop out of the game's visual world.
const Dialog = ({ request, onClose }: { request: DialogRequest | null; onClose: () => void }) => {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!request) return
    setValue(request.defaultValue ?? '')
    // focus + select so typing replaces the suggested name immediately
    const id = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 20)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('keydown', onKey)
    }
  }, [request, onClose])

  if (!request) return null

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    request.onConfirm(value)
    onClose()
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="hud dialog-card" onSubmit={submit}>
        <p className="dialog-title">{request.title}</p>
        {request.kind === 'prompt' && (
          <input
            ref={inputRef}
            className="dialog-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={60}
          />
        )}
        <div className="dialog-buttons">
          <button type="button" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className={request.danger ? 'danger' : 'primary'}>
            {request.confirmLabel ?? t('dialog.ok')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default Dialog
