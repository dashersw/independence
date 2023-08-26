import { setLang, t } from '../../i18n'
import type { Lang } from '../../i18n'
import { useLang } from '../../useLang'

const LANGS: Lang[] = ['en', 'tr']

// Same markup and classes as the game's intro screen switcher, so the two
// pages offer an identical control.
export const LanguageToggle = () => {
  const lang = useLang()

  return (
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
  )
}
