// Going fullscreen, and knowing whether it is worth offering.
//
// iOS has no API for hiding Safari's toolbar, and it only auto-hides the bar on
// a page that SCROLLS — this one pans instead, so the bar never leaves. The
// standard Fullscreen API is the way out where it exists: unprefixed on desktop
// and iPadOS since Safari 16.4, webkit-prefixed before that, and on iPhone only
// in recent versions (caniuse still reports iOS as partial). So: never assume,
// always feature-detect, and fall back to the installed home-screen app, which
// has no chrome at all.

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
  webkitRequestFullScreen?: () => Promise<void> | void
}
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  webkitCancelFullScreen?: () => Promise<void> | void
}

const requestOn = (el: FsElement) =>
  el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el) ?? el.webkitRequestFullScreen?.bind(el)

const exitOn = (doc: FsDocument) =>
  doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc) ?? doc.webkitCancelFullScreen?.bind(doc)

/** Already running without browser chrome — installed to the home screen. */
export const isStandalone = () => {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return iosStandalone === true || window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches
}

export const isFullscreen = () => {
  if (typeof document === 'undefined') return false
  const doc = document as FsDocument
  return !!(doc.fullscreenElement ?? doc.webkitFullscreenElement)
}

/**
 * Whether a fullscreen button is worth showing at all: the API has to exist,
 * and there has to be chrome to escape. An installed app is already there.
 */
export const canFullscreen = () => {
  if (typeof document === 'undefined' || isStandalone()) return false
  const el = document.documentElement as FsElement
  const doc = document as FsDocument
  // Safari advertises the method but refuses it when disabled by policy
  if (doc.fullscreenEnabled === false) return false
  return !!requestOn(el)
}

/** Toggle. Must be called from a user gesture — browsers reject it otherwise. */
export const toggleFullscreen = async () => {
  const doc = document as FsDocument
  try {
    if (isFullscreen()) {
      await exitOn(doc)?.()
      return false
    }
    await requestOn(document.documentElement as FsElement)?.()
    return isFullscreen()
  } catch {
    // iPhone Safari has historically rejected this for non-video elements;
    // the home-screen install is the fallback and needs no error of its own
    return isFullscreen()
  }
}
