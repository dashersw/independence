import { useEffect, useState } from 'react'
import { getLang, onLangChange } from './i18n'

// React binding over the game's language module, so the landing page reads the
// same state the game does instead of keeping its own copy.
export const useLang = () => {
  const [lang, setLangState] = useState(getLang)

  useEffect(() => onLangChange(() => setLangState(getLang())), [])

  return lang
}
