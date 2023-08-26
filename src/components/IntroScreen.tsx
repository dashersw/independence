import React, { useEffect, useRef, useState } from 'react'
import { Lang, getLang, setLang, t } from '../i18n'
import { musicEnabled, setMusicEnabled } from '../music'
import { initSounds, playSound } from '../sounds'

interface Props {
  onStart: () => void
  onBegin: () => void
  mapReady: boolean
}

const LANGS: Lang[] = ['en', 'tr']

/**
 * The campaign opens on the map before it becomes a board: one quiet moment
 * to establish the date, the land and the stakes before the HUD appears.
 */
const IntroScreen = ({ onStart, onBegin, mapReady }: Props) => {
  const [leaving, setLeaving] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [music, setMusic] = useState(() => musicEnabled())
  const beginButton = useRef<HTMLButtonElement>(null)
  const transitionStarted = useRef(false)
  // Synchronous re-entry guard: the `disabled` attribute only lands on the next
  // render, so a fast second click would otherwise slip through before then.
  const begun = useRef(false)
  const lang = getLang()

  useEffect(() => {
    beginButton.current?.focus({ preventScroll: true })
    // Warm the sound engine now, while the intro is on screen — the game isn't
    // mounted yet, so without this the intro's own controls (Begin, language,
    // music) would have no audio and the opening fanfare would miss its cue.
    initSounds()
  }, [])

  useEffect(() => {
    if (!preparing || !mapReady || transitionStarted.current) return
    transitionStarted.current = true
    setLeaving(true)
    // The campaign fanfare, as the intro dissolves into the board.
    playSound('gameStart')
    const timer = window.setTimeout(onBegin, 520)
    return () => window.clearTimeout(timer)
  }, [preparing, mapReady, onBegin])

  const begin = () => {
    if (begun.current) return
    begun.current = true
    playSound('uiClick')
    setPreparing(true)
    // Mounting the game is heavy enough to lock the main thread, so defer it
    // until the browser has actually painted the transparent "LOADING" state.
    // A single rAF still runs before paint; the nested rAF fires on the frame
    // after, once the loading style is on screen.
    requestAnimationFrame(() => requestAnimationFrame(onStart))
  }

  const toggleMusic = () => {
    setMusicEnabled(!music)
    setMusic(!music)
  }

  const keepFocusInside = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    if (controls.length === 0) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <section
      className={`intro-screen intro-baked${leaving ? ' leaving' : ''}`}
      data-lang={lang}
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-title"
      onKeyDown={keepFocusInside}
    >
      <div className="opening-scene-background" data-lang={lang} aria-hidden="true" />

      <nav className="intro-languages" aria-label={t('menu.language')}>
        {LANGS.map((code) => (
          <button
            key={code}
            className={lang === code ? 'active' : ''}
            onClick={() => setLang(code)}
            aria-pressed={lang === code}
          >
            {code.toLocaleUpperCase(code)}
          </button>
        ))}
      </nav>

      <div className="intro-content">
        {/* The words are baked into the art, but remain in the accessibility
            tree so the intro still has a real heading and description. */}
        <div className="intro-copy">
          <p className="intro-date">{t('intro.date')}</p>
          <h1 id="intro-title">{t('brand.title')}</h1>
          <div className="intro-mark" aria-hidden="true">
            <span />
            <i>★</i>
            <span />
          </div>
          <p className="intro-subtitle">{t('intro.subtitle')}</p>
        </div>
        <div className="intro-actions">
          <button ref={beginButton} className="intro-begin" onClick={begin} disabled={preparing || leaving}>
            <span>{preparing || leaving ? t('intro.loading') : t('intro.begin')}</span>
            {preparing || leaving ? null : <b aria-hidden="true">→</b>}
          </button>
          <p className="intro-caption">{t('intro.caption')}</p>
        </div>
      </div>

      <button
        className={`intro-sound${music ? '' : ' muted'}`}
        onClick={toggleMusic}
        aria-label={music ? t('menu.musicOff') : t('menu.musicOn')}
        aria-pressed={music}
        title={music ? t('menu.musicOff') : t('menu.musicOn')}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
          {!music && <line x1="2.5" y1="2.5" x2="21.5" y2="21.5" />}
        </svg>
      </button>
    </section>
  )
}

export default IntroScreen
