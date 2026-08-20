import React, { useEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import mapData from '../../../game/map-data.json'
import Territory from '../../../game/territory'
import { VB } from '../../viewport'
import type { FactionComponent } from '../../map-geometry'
import type { DotParams } from '../../LabelEditor'
import {
  ART_CSS,
  ART_SCALE,
  OVERLAY_SCALE,
  ArtBandShadows,
  ArtBands,
  ArtBase,
  ArtCoastShade,
  ArtFlags,
  ArtRegionShade,
  PaintDefs,
  StaticDecor,
  TerritoryInkLayer,
} from '../../map-art'
import { FlagDefs } from '../../map-flags'

// Display bitmap dimensions, fixed for the session: the quick first pass
// upscales into them, the sharp pass fills them natively.
export const ART_W = Math.round(VB.w * ART_SCALE)
export const ART_H = Math.round(VB.h * ART_SCALE)

// the two-stage first bake: stage one at 1× shows the map as fast as the
// filters allow, stage two re-bakes at full resolution and swaps silently
const QUICK_SCALE = 1

interface MapBakingOptions {
  territories: Territory[]
  bySlug: Record<string, Territory>
  flagClusters: FactionComponent[]
  ownershipKey: string
  editMode: boolean
  lang: string
  dotFor: (slug: string) => DotParams
  onReady?: () => void
}

export const useMapBaking = ({
  territories,
  bySlug,
  flagClusters,
  ownershipKey,
  editMode,
  lang,
  dotFor,
  onReady,
}: MapBakingOptions) => {
  const readyReported = useRef(false)
  // ---- offscreen bakes ----
  // Static pieces (the expensive blur/turbulence filters) rasterize ONCE to
  // PNG blobs; every conquest re-rasterizes only the cheap dynamic pieces and
  // assembles the final bitmap on a canvas. The composite is shown on a real
  // <canvas> under the SVG — no PNG round-trip for the displayed map.
  const artCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const revealCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [artDrawn, setArtDrawn] = useState(false)
  const staticPartsRef = useRef<Promise<Blob[]> | null>(null)
  // the static bucket includes StaticDecor's sea/country labels, which DO
  // depend on language — invalidate and re-bake (once, cheaply) on a switch
  const staticLangRef = useRef<string | null>(null)
  // conquest reveal: when a re-bake lands, the new bitmap washes over the old
  // one in a soft-edged circle growing from the conquered territory
  const [reveal, setReveal] = useState<null | { old: ImageBitmap; origin: [number, number]; radius: number }>(null)
  const bakedOwnersRef = useRef<Record<string, string> | null>(null)

  const wrapSvg = (children: React.ReactNode, scale: number) =>
    renderToStaticMarkup(
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        width={Math.round(VB.w * scale)}
        height={Math.round(VB.h * scale)}
      >
        <style>{ART_CSS}</style>
        <FlagDefs />
        <PaintDefs />
        {children}
      </svg>,
    )
  // the noise rect spans the desk area; feTurbulence is deterministic in user
  // space, so cropping the same rect to different viewBoxes yields the same
  // pattern — the map bake and the desk texture stay seamless at the frame
  const noiseSvg = (filter: string, vb: { x: number; y: number; w: number; h: number }, scale: number) =>
    renderToStaticMarkup(
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        width={Math.round(vb.w * scale)}
        height={Math.round(vb.h * scale)}
      >
        <PaintDefs />
        <rect x={-400} y={-300} width={2360} height={1420} filter={`url(#${filter})`} />
      </svg>,
    )
  const loadImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  const rasterizeSvg = (markup: string) =>
    loadImage(URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })))
  const rasterizeAll = (markups: string[]) => Promise.all(markups.map(rasterizeSvg))
  const revokeAll = (imgs: HTMLImageElement[]) => imgs.forEach((i) => URL.revokeObjectURL(i.src))
  const encodePng = (img: HTMLImageElement): Promise<Blob> => {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d')!.drawImage(img, 0, 0)
    return new Promise((res, rej) =>
      c.toBlob((b) => {
        // release the backing store immediately — iOS Safari counts spent
        // canvases against a hard total-canvas budget until they are resized
        c.width = 0
        c.height = 0
        if (b) res(b)
        else rej(new Error('toBlob failed'))
      }, 'image/png'),
    )
  }
  // one encode in flight at a time: a single scratch buffer instead of six,
  // with a breather between encodes so their main-thread staging (drawImage)
  // never strings into one long post-load jank
  const encodeAllSequentially = async (imgs: HTMLImageElement[]): Promise<Blob[]> => {
    const blobs: Blob[] = []
    for (const img of imgs) {
      blobs.push(await encodePng(img))
      await new Promise((r) => setTimeout(r, 100))
    }
    return blobs
  }

  const staticMarkups = (scale: number) => [
    wrapSvg(<ArtBase />, scale),
    wrapSvg(TerritoryInkLayer, scale),
    wrapSvg(<ArtCoastShade blend={false} />, scale),
    wrapSvg(<StaticDecor />, scale),
    // grain/blotch crops for the map frame — baked INTO the bitmap so the
    // live tree carries no mix-blend-mode layers (each one forces a
    // full-screen compositor pass and a ~30 MB resident texture)
    noiseSvg('paper-grain', VB, Math.min(scale, OVERLAY_SCALE)),
    noiseSvg('wash-blotch', VB, Math.min(scale, OVERLAY_SCALE)),
  ]
  const dynamicMarkups = (scale: number) => [
    wrapSvg(<ArtFlags bySlug={bySlug} flagClusters={flagClusters} />, scale),
    wrapSvg(<ArtRegionShade bySlug={bySlug} blend={false} />, scale),
    wrapSvg(<ArtBands flagClusters={flagClusters} />, scale),
    wrapSvg(<ArtBandShadows flagClusters={flagClusters} blend={false} />, scale),
  ]

  // assemble the painted stack on an offscreen canvas at display resolution
  const compose = (statics: HTMLImageElement[], dynamics: HTMLImageElement[]): HTMLCanvasElement => {
    const [baseImg, inkImg, coastImg, decorImg, grainImg, blotchImg] = statics
    const [flagsImg, shadeImg, bandsImg, bandShadowImg] = dynamics
    const c = document.createElement('canvas')
    c.width = ART_W
    c.height = ART_H
    const ctx = c.getContext('2d')!
    ctx.drawImage(baseImg, 0, 0, ART_W, ART_H)
    ctx.drawImage(flagsImg, 0, 0, ART_W, ART_H)
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(shadeImg, 0, 0, ART_W, ART_H)
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(inkImg, 0, 0, ART_W, ART_H)
    ctx.drawImage(bandsImg, 0, 0, ART_W, ART_H)
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(bandShadowImg, 0, 0, ART_W, ART_H)
    ctx.drawImage(coastImg, 0, 0, ART_W, ART_H)
    // parchment tint (multiply at 0.2), then the pale veil (normal 0.12)
    ctx.fillStyle = '#e6d3aa'
    ctx.globalAlpha = 0.2
    ctx.fillRect(0, 0, ART_W, ART_H)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 0.12
    ctx.fillStyle = '#f0e6cd'
    ctx.fillRect(0, 0, ART_W, ART_H)
    ctx.globalAlpha = 1
    ctx.drawImage(decorImg, 0, 0, ART_W, ART_H)
    // paper grain (multiply 0.4) and watercolor blotch (soft-light 0.6),
    // exactly the blend math the old live overlay layers carried
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.4
    ctx.drawImage(grainImg, 0, 0, ART_W, ART_H)
    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = 0.6
    ctx.drawImage(blotchImg, 0, 0, ART_W, ART_H)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    return c
  }

  // draw the finished composite onto the display canvas, freeing the offscreen
  const blit = (offscreen: HTMLCanvasElement) => {
    const display = artCanvasRef.current
    if (display) {
      display.getContext('2d')!.drawImage(offscreen, 0, 0)
      display.dataset.drawn = '1'
    }
    offscreen.width = 0
    offscreen.height = 0
  }

  const currentOwners = () => {
    const owners: Record<string, string> = {}
    for (const t of territories) owners[t.slug] = t.faction.name
    return owners
  }

  useEffect(() => {
    if (editMode) return
    // base / territory ink / coast shade never change; decor labels do when
    // the language switches — re-bake the static bucket when that happens
    if (staticLangRef.current !== lang) staticPartsRef.current = null
    staticLangRef.current = lang
    let cancelled = false

    if (!staticPartsRef.current) {
      // ---- first bake: two-stage ----
      let resolveBlobs!: (blobs: Blob[]) => void
      let rejectBlobs!: (err: unknown) => void
      staticPartsRef.current = new Promise<Blob[]>((res, rej) => {
        resolveBlobs = res
        rejectBlobs = rej
      })
      staticPartsRef.current.catch(() => {
        staticPartsRef.current = null
      })

      // stage 2: full-resolution re-bake, silent swap, then cache the static
      // layers as PNG blobs for later conquest re-bakes. Runs to completion
      // even if the effect is cancelled — a conquest may already await it.
      let sharpStarted = false
      const startSharp = () => {
        if (sharpStarted) return
        sharpStarted = true
        ;(async () => {
          try {
            const statics = await rasterizeAll(staticMarkups(ART_SCALE))
            const dynamics = await rasterizeAll(dynamicMarkups(ART_SCALE))
            if (!cancelled) blit(compose(statics, dynamics))
            revokeAll(dynamics)
            const blobs = await encodeAllSequentially(statics)
            revokeAll(statics)
            resolveBlobs(blobs)
          } catch (e) {
            rejectBlobs(e)
          }
        })()
      }

      // stage 1: quick 1× pass — the intro lifts on this one
      ;(async () => {
        try {
          const [statics, dynamics] = await Promise.all([
            rasterizeAll(staticMarkups(QUICK_SCALE)),
            rasterizeAll(dynamicMarkups(QUICK_SCALE)),
          ])
          if (!cancelled) {
            blit(compose(statics, dynamics))
            bakedOwnersRef.current = currentOwners()
            setArtDrawn(true)
          }
          revokeAll([...statics, ...dynamics])
          // let the quick frame reach the screen before the heavy pass starts
          window.setTimeout(startSharp, 200)
        } catch (e) {
          console.error('map bake failed', e)
          startSharp()
        }
      })()

      return () => {
        cancelled = true
        startSharp()
      }
    }

    // ---- conquest / repeat bake: cached statics + fresh dynamic layers ----
    ;(async () => {
      try {
        const [statics, dynamics] = await Promise.all([
          staticPartsRef.current!.then((blobs) => Promise.all(blobs.map((b) => loadImage(URL.createObjectURL(b))))),
          rasterizeAll(dynamicMarkups(ART_SCALE)),
        ])
        const all = [...statics, ...dynamics]
        if (cancelled) {
          revokeAll(all)
          return
        }

        const offscreen = compose(statics, dynamics)
        revokeAll(all)
        const previousOwners = bakedOwnersRef.current
        bakedOwnersRef.current = currentOwners()
        const changed = previousOwners
          ? territories.find((t) => previousOwners[t.slug] && previousOwners[t.slug] !== t.faction.name)
          : undefined

        const display = artCanvasRef.current
        const old = display?.dataset.drawn === '1' && changed ? await createImageBitmap(display) : null
        if (cancelled) {
          old?.close()
          offscreen.width = 0
          offscreen.height = 0
          return
        }

        blit(offscreen)
        if (old && changed) {
          const dot = dotFor(changed.slug)
          // the wash only needs to cover the region that actually changed —
          // sized to the territory so the edge crosses it slowly enough to see
          const bb = ((mapData.territories as any)[changed.slug].bbox as number[]) ?? [
            dot.x - 60,
            dot.y - 60,
            dot.x + 60,
            dot.y + 60,
          ]
          const radius = (Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2) * 1.4 + 30
          setReveal((prev) => {
            prev?.old.close()
            return { old, origin: [dot.x, dot.y], radius }
          })
        }
      } catch (e) {
        // a failed bake keeps the previous bitmap; log for diagnosis
        console.error('map bake failed', e)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownershipKey, editMode, lang])

  // drive the conquest reveal on the overlay canvas: the OLD bitmap covers the
  // new one and a soft-edged hole grows from the conquered territory until the
  // fade has cleared the frame. The overlay's backing store only exists while
  // a reveal is running.
  useEffect(() => {
    if (!reveal) return
    const overlay = revealCanvasRef.current
    if (!overlay) {
      reveal.old.close()
      setReveal(null)
      return
    }
    overlay.width = ART_W
    overlay.height = ART_H
    const ctx = overlay.getContext('2d')!
    const cx = (reveal.origin[0] - VB.x) * ART_SCALE
    const cy = (reveal.origin[1] - VB.y) * ART_SCALE
    const Rmax = (reveal.radius / 0.65) * ART_SCALE // gradient opaque to 65% — overshoot so the fade clears
    const t0 = performance.now()
    const DUR = 900
    let raf = 0
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / DUR)
      const r = Math.max(1, Rmax * (1 - Math.pow(1 - t, 3)))
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, ART_W, ART_H)
      ctx.drawImage(reveal.old, 0, 0)
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      grad.addColorStop(0, 'rgba(0,0,0,1)')
      grad.addColorStop(0.65, 'rgba(0,0,0,1)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, ART_W, ART_H)

      if (t < 1) {
        raf = requestAnimationFrame(tick)
        return
      }

      overlay.width = 0
      overlay.height = 0
      reveal.old.close()
      setReveal(null)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      // an interrupted reveal (unmount, edit-mode flip, replacement) must not
      // strand the old bitmap or the overlay's backing store — close() and a
      // re-zero are no-ops when the animation already finished cleanly
      cancelAnimationFrame(raf)
      overlay.width = 0
      overlay.height = 0
      reveal.old.close()
    }
  }, [reveal])

  // The dark desk surround keeps its grain/blotch texture as ONE small opaque
  // bitmap (no blend modes: the noise is pre-multiplied over the flat desk
  // color). Low resolution suffices — it is noise on a flat dark surface.
  // (The vignette stays a live gradient rect: gradients are cheap.)
  const [deskUrl, setDeskUrl] = useState<string | null>(null)
  const deskUrlRef = useRef<string | null>(null)
  useEffect(() => {
    const DESK_SCALE = 0.5
    const AREA = { x: -400, y: -300, w: 2360, h: 1420 }
    const W = Math.round(AREA.w * DESK_SCALE)
    const H = Math.round(AREA.h * DESK_SCALE)
    let cancelled = false
    ;(async () => {
      try {
        const [grain, blotch] = await Promise.all([
          rasterizeSvg(noiseSvg('paper-grain', AREA, DESK_SCALE)),
          rasterizeSvg(noiseSvg('wash-blotch', AREA, DESK_SCALE)),
        ])
        const c = document.createElement('canvas')
        c.width = W
        c.height = H
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#2e2419'
        ctx.fillRect(0, 0, W, H)
        ctx.globalCompositeOperation = 'multiply'
        ctx.globalAlpha = 0.4
        ctx.drawImage(grain, 0, 0, W, H)
        ctx.globalCompositeOperation = 'soft-light'
        ctx.globalAlpha = 0.6
        ctx.drawImage(blotch, 0, 0, W, H)
        URL.revokeObjectURL(grain.src)
        URL.revokeObjectURL(blotch.src)
        c.toBlob((b) => {
          c.width = 0
          c.height = 0
          if (!b || cancelled) return
          deskUrlRef.current = URL.createObjectURL(b)
          setDeskUrl(deskUrlRef.current)
        })
      } catch (e) {
        console.error('desk texture bake failed', e)
      }
    })()
    return () => {
      cancelled = true
      if (deskUrlRef.current) URL.revokeObjectURL(deskUrlRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Do not uncover the game until the quick composite has been drawn and has
  // survived a browser paint (plus the desk texture, which frames it).
  useEffect(() => {
    if (readyReported.current) return
    if (!editMode && (!artDrawn || !deskUrl)) return

    let cancelled = false
    let firstFrame = 0
    let secondFrame = 0
    const decode = (url: string) =>
      new Promise<void>((resolve) => {
        const image = new Image()
        image.onload = () => resolve()
        image.onerror = () => resolve()
        image.src = url
        image.decode?.().then(resolve, () => undefined)
      })

    Promise.all(editMode ? [] : [decode(deskUrl!)]).then(() => {
      if (cancelled) return
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          if (cancelled || readyReported.current) return
          readyReported.current = true
          onReady?.()
        })
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [artDrawn, deskUrl, editMode, onReady])

  return { deskUrl, artCanvasRef, revealCanvasRef }
}
