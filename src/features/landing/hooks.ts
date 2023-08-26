import { useEffect, useState } from 'react'
import { useLang } from '../../useLang'
import { landingCopy } from './copy'
import { STOP_IDS } from './constants'

const REVEAL_VIEWPORT_FRACTION = 0.92
const HERO_EXIT_FRACTION = 0.3
const SCROLL_THROTTLE_MS = 90
const IDLE_POLL_MS = 800
const VIEWPORT_MIDPOINT_DIVISOR = 2

const isInFrame = (element: Element, topFraction: number) => {
  const rect = element.getBoundingClientRect()

  return rect.top < innerHeight * topFraction && rect.bottom > 0
}

const revealEntered = (pending: Set<Element>) => {
  for (const element of pending) {
    if (!isInFrame(element, REVEAL_VIEWPORT_FRACTION)) continue

    element.classList.add('is-visible')
    pending.delete(element)
  }
}

const startEnteredScenes = (scenes: Set<Element>) => {
  for (const scene of scenes) {
    if (!isInFrame(scene, 1)) continue

    scene.classList.add('seen')
    scenes.delete(scene)
  }
}

const currentStop = (stopElements: HTMLElement[]) => {
  let current = STOP_IDS[0]

  for (const element of stopElements) {
    const midpoint = innerHeight / VIEWPORT_MIDPOINT_DIVISOR
    if (element.getBoundingClientRect().top <= midpoint) current = element.id
  }

  return current
}

export const useScrollStage = () => {
  const [activeStop, setActiveStop] = useState(STOP_IDS[0])
  const [pastHero, setPastHero] = useState(false)

  useEffect(() => {
    const pending = new Set(document.querySelectorAll('.reveal'))
    const seaScenes = new Set(document.querySelectorAll('.scene-sea'))
    const stopElements = STOP_IDS.map((id) => document.querySelector<HTMLElement>(`#${id}`)).filter(
      Boolean,
    ) as HTMLElement[]
    const hero = document.querySelector('#top')
    let isThrottled = false

    const update = () => {
      isThrottled = false
      revealEntered(pending)
      startEnteredScenes(seaScenes)
      if (hero) setPastHero(hero.getBoundingClientRect().bottom < innerHeight * HERO_EXIT_FRACTION)
      setActiveStop(currentStop(stopElements))
    }

    const onScroll = () => {
      if (isThrottled) return

      isThrottled = true
      setTimeout(update, SCROLL_THROTTLE_MS)
    }

    update()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll, { passive: true })
    const idle = setInterval(update, IDLE_POLL_MS)

    return () => {
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
      clearInterval(idle)
    }
  }, [])

  return { activeStop, pastHero }
}

export const useLandingCopy = () => landingCopy(useLang())

export const useDocumentMeta = (meta: { title: string; description: string }) => {
  useEffect(() => {
    document.title = meta.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description)
  }, [meta])
}

export const useLandingBodyClass = () => {
  useEffect(() => {
    document.body.classList.add('landing-page-body')

    return () => document.body.classList.remove('landing-page-body')
  }, [])
}
