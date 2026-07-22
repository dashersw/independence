import React, { useEffect, useRef, useState } from 'react'
import { Lang, getLang, setLang, t } from '../i18n'
import { SaveMeta, deleteSave, listSaves } from '../saves'
import Dialog, { DialogRequest } from './Dialog'
import { canFullscreen, isFullscreen, isStandalone, toggleFullscreen } from './fullscreen'
import { musicEnabled, musicVolume, setMusicEnabled, setMusicVolume } from '../music'

const LANGS: { code: Lang; flag: string }[] = [
  { code: 'en', flag: '🇬🇧' },
  { code: 'tr', flag: '🇹🇷' }
]

interface Props {
  onSave: (name: string) => boolean
  onLoad: (id: string) => boolean
  defaultSaveName: () => string
}

// Cog button, fixed bottom-right, opening a settings panel: language plus
// named save slots. Self-contained so it survives independently of the HUD
// bars it floats near.
const SettingsMenu = ({ onSave, onLoad, defaultSaveName }: Props) => {
  const [open, setOpen] = useState(false)
  const [lang, setLangState] = useState(getLang())
  const [saves, setSaves] = useState<SaveMeta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogRequest | null>(null)
  // the API is only offered where it exists and there is chrome to escape
  const [fsOffered] = useState(() => canFullscreen())
  const [fullscreen, setFullscreen] = useState(() => isFullscreen())
  const [music, setMusic] = useState(() => musicEnabled())
  const [volume, setVolume] = useState(() => musicVolume())

  useEffect(() => {
    const sync = () => setFullscreen(isFullscreen())
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])
  const rootRef = useRef<HTMLDivElement>(null)

  const refreshSaves = () => setSaves(listSaves())

  useEffect(() => {
    if (!open) return
    refreshSaves()
    setError(null)
    const onDocClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest && el.closest('.dialog-backdrop')) return
      if (rootRef.current && !rootRef.current.contains(el)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (code: Lang) => {
    setLang(code)
    setLangState(code)
  }

  const doSave = () =>
    setDialog({
      kind: 'prompt',
      title: t('menu.saveNamePrompt'),
      defaultValue: defaultSaveName(),
      confirmLabel: t('menu.saveCurrent'),
      onConfirm: raw => {
        if (onSave(raw.trim() || defaultSaveName())) {
          refreshSaves()
          setError(null)
        } else setError(t('menu.saveFailed'))
      }
    })

  const doLoad = (id: string) =>
    setDialog({
      kind: 'confirm',
      title: t('menu.confirmLoad'),
      confirmLabel: t('menu.load'),
      onConfirm: () => {
        if (onLoad(id)) setOpen(false)
        else setError(t('menu.loadFailed'))
      }
    })

  const doDelete = (id: string) =>
    setDialog({
      kind: 'confirm',
      title: t('menu.confirmDelete'),
      confirmLabel: t('menu.delete'),
      danger: true,
      onConfirm: () => {
        deleteSave(id)
        refreshSaves()
      }
    })

  return (
    <div className="lang-switcher" ref={rootRef}>
      {open && (
        <div className="settings-menu">
          <div className="settings-section">
            <p className="settings-label">{t('menu.language')}</p>
            {LANGS.map(l => (
              <button
                key={l.code}
                className={`lang-option${lang === l.code ? ' active' : ''}`}
                onClick={() => choose(l.code)}
              >
                <span className="lang-flag">{l.flag}</span>
                <span>{t(`lang.${l.code}`)}</span>
              </button>
            ))}
          </div>

          {(fsOffered || !isStandalone()) && (
            <div className="settings-section">
              <p className="settings-label">{t('menu.display')}</p>
              {fsOffered ? (
                <button
                  className="save-action"
                  onClick={async () => setFullscreen(await toggleFullscreen())}
                >
                  {fullscreen ? `\u21F2 ${t('menu.exitFullscreen')}` : `\u21F1 ${t('menu.fullscreen')}`}
                </button>
              ) : (
                <p className="settings-empty">{t('menu.installHint')}</p>
              )}
            </div>
          )}

          <div className="settings-section">
            <p className="settings-label">{t('menu.sound')}</p>
            <button
              className="save-action"
              onClick={() => {
                setMusicEnabled(!music)
                setMusic(!music)
              }}
            >
              {music ? `🎵 ${t('menu.musicOff')}` : `🎵 ${t('menu.musicOn')}`}
            </button>
            <label className="volume-row">
              <input
                type="range"
                className="volume-slider"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                aria-label={t('menu.musicVolume')}
                onChange={e => {
                  const level = Number(e.target.value) / 100
                  setMusicVolume(level)
                  setVolume(level)
                }}
              />
              <span className="volume-value">{t('menu.volumeValue', { volume: Math.round(volume * 100) })}</span>
            </label>
          </div>

          <div className="settings-section">
            <p className="settings-label">{t('menu.saves')}</p>
            <button className="save-action" onClick={doSave}>
              💾 {t('menu.saveCurrent')}
            </button>
            {error && <p className="settings-error">{error}</p>}
            {saves.length === 0 ? (
              <p className="settings-empty">{t('menu.noSaves')}</p>
            ) : (
              <ul className="save-list">
                {saves.map(s => (
                  <li key={s.id} className="save-row">
                    <span className="save-info">
                      <strong>{s.name}</strong>
                      <em>{t('menu.savedRound', { round: s.round, date: s.date })}</em>
                    </span>
                    <span className="save-buttons">
                      <button onClick={() => doLoad(s.id)} title={t('menu.load')}>
                        ↺
                      </button>
                      <button onClick={() => doDelete(s.id)} title={t('menu.delete')}>
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <button
        className="lang-cog"
        onClick={() => setOpen(o => !o)}
        aria-label={t('menu.title')}
        aria-expanded={open}
        title={t('menu.title')}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 2.6c.5 0 1 .04 1.47.11l.36 1.83c.7.16 1.36.43 1.96.8l1.6-.98c.75.5 1.42 1.1 1.98 1.8l-.9 1.65c.4.6.7 1.27.88 1.98l1.85.3c.09.47.14.96.14 1.45s-.05.98-.14 1.45l-1.85.3a6.6 6.6 0 0 1-.88 1.98l.9 1.65c-.56.7-1.23 1.3-1.98 1.8l-1.6-.98c-.6.37-1.26.64-1.96.8l-.36 1.83c-.47.07-.97.11-1.47.11s-1-.04-1.47-.11l-.36-1.83a6.6 6.6 0 0 1-1.96-.8l-1.6.98a8.7 8.7 0 0 1-1.98-1.8l.9-1.65a6.6 6.6 0 0 1-.88-1.98l-1.85-.3A8.9 8.9 0 0 1 2.6 12c0-.49.05-.98.14-1.45l1.85-.3c.18-.71.48-1.38.88-1.98l-.9-1.65c.56-.7 1.23-1.3 1.98-1.8l1.6.98c.6-.37 1.26-.64 1.96-.8l.36-1.83A8.9 8.9 0 0 1 12 2.6Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <Dialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  )
}

export default SettingsMenu
