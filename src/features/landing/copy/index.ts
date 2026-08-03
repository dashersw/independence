import type { Lang } from '../../../i18n'
import { en } from './en'
import { tr } from './tr'

export type { LandingCopy } from './en'

export const landingCopy = (lang: Lang) => (lang === 'tr' ? tr : en)
