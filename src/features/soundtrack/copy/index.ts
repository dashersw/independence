import type { Lang } from '../../../i18n'
import { en } from './en'
import { tr } from './tr'

export type { SoundtrackCopy } from './en'

export const soundtrackCopy = (lang: Lang) => (lang === 'tr' ? tr : en)
