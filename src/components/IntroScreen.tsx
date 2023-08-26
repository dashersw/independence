import React, { useEffect, useRef, useState } from 'react'
import { Lang, getLang, setLang, t } from '../i18n'

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
  const beginButton = useRef<HTMLButtonElement>(null)
  const transitionStarted = useRef(false)
  const lang = getLang()

  useEffect(() => {
    beginButton.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!preparing || !mapReady || transitionStarted.current) return
    transitionStarted.current = true
    setLeaving(true)
    const timer = window.setTimeout(onBegin, 520)
    return () => window.clearTimeout(timer)
  }, [preparing, mapReady, onBegin])

  const begin = () => {
    if (preparing || leaving) return
    setPreparing(true)
    onStart()
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
        {LANGS.map(code => (
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
            <span>{t('intro.begin')}</span>
            <b aria-hidden="true">→</b>
          </button>
          <p className="intro-caption">{t('intro.caption')}</p>
        </div>
      </div>
    </section>
  )
}

export default IntroScreen
