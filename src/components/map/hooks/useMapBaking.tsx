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
  bakeSvg,
} from '../../map-art'
import { FlagDefs } from '../../map-flags'

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
  // assembles the final bitmap on a canvas. Canvas composite ops carry the
  // multiply blending, identically in every engine.
  const [artUrl, setArtUrl] = useState<string | null>(null)
  const artUrlRef = useRef<string | null>(null)
  const staticPartsRef = useRef<Promise<Blob[]> | null>(null)
  // the static bucket includes StaticDecor's sea/country labels, which DO
  // depend on language — invalidate and re-bake (once, cheaply) on a switch
  const staticLangRef = useRef<string | null>(null)
  // conquest reveal: when a re-bake lands, the new bitmap washes over the old
  // one in a soft-edged circle growing from the conquered territory
  const [reveal, setReveal] = useState<null | { prevUrl: string; origin: [number, number]; radius: number }>(null)
  const revealCircleRef = useRef<SVGCircleElement | null>(null)
  const bakedOwnersRef = useRef<Record<string, string> | null>(null)

  const wrapSvg = (children: React.ReactNode) =>
    renderToStaticMarkup(
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        width={Math.round(VB.w * ART_SCALE)}
        height={Math.round(VB.h * ART_SCALE)}
      >
        <style>{ART_CSS}</style>
        <FlagDefs />
        <PaintDefs />
        {children}
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
  const toPng = async (markup: string): Promise<Blob> => {
    const img = await rasterizeSvg(markup)
    const c = document.createElement('canvas')
    c.width = Math.round(VB.w * ART_SCALE)
    c.height = Math.round(VB.h * ART_SCALE)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    URL.revokeObjectURL(img.src)
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'))
  }

  useEffect(() => {
    if (editMode) return
    // base / territory ink / coast shade never change; decor labels do when
    // the language switches — re-bake the static bucket when that happens
    if (staticLangRef.current !== lang) staticPartsRef.current = null
    staticLangRef.current = lang
    if (!staticPartsRef.current)
      staticPartsRef.current = Promise.all([
        toPng(wrapSvg(<ArtBase />)),
        toPng(wrapSvg(TerritoryInkLayer)),
        toPng(wrapSvg(<ArtCoastShade blend={false} />)),
        toPng(wrapSvg(<StaticDecor />)),
      ])
    let cancelled = false
    ;(async () => {
      try {
        const [statics, flagsImg, shadeImg, bandsImg, bandShadowImg] = await Promise.all([
          staticPartsRef.current!.then((blobs) => Promise.all(blobs.map((b) => loadImage(URL.createObjectURL(b))))),
          rasterizeSvg(wrapSvg(<ArtFlags bySlug={bySlug} flagClusters={flagClusters} />)),
          rasterizeSvg(wrapSvg(<ArtRegionShade bySlug={bySlug} blend={false} />)),
          rasterizeSvg(wrapSvg(<ArtBands flagClusters={flagClusters} />)),
          rasterizeSvg(wrapSvg(<ArtBandShadows flagClusters={flagClusters} blend={false} />)),
        ])
        const [baseImg, inkImg, coastImg, decorImg] = statics
        const all = [...statics, flagsImg, shadeImg, bandsImg, bandShadowImg]
        if (cancelled) {
          all.forEach((i) => URL.revokeObjectURL(i.src))
          return
        }
        const W = Math.round(VB.w * ART_SCALE)
        const H = Math.round(VB.h * ART_SCALE)
        const canvas = document.createElement('canvas')
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(baseImg, 0, 0, W, H)
        ctx.drawImage(flagsImg, 0, 0, W, H)
        ctx.globalCompositeOperation = 'multiply'
        ctx.drawImage(shadeImg, 0, 0, W, H)
        ctx.globalCompositeOperation = 'source-over'
        ctx.drawImage(inkImg, 0, 0, W, H)
        ctx.drawImage(bandsImg, 0, 0, W, H)
        ctx.globalCompositeOperation = 'multiply'
        ctx.drawImage(bandShadowImg, 0, 0, W, H)
        ctx.drawImage(coastImg, 0, 0, W, H)
        // parchment tint (multiply at 0.2), then the pale veil (normal 0.12)
        ctx.fillStyle = '#e6d3aa'
        ctx.globalAlpha = 0.2
        ctx.fillRect(0, 0, W, H)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 0.12
        ctx.fillStyle = '#f0e6cd'
        ctx.fillRect(0, 0, W, H)
        ctx.globalAlpha = 1
        ctx.drawImage(decorImg, 0, 0, W, H)
        all.forEach((i) => URL.revokeObjectURL(i.src))
        canvas.toBlob((b) => {
          if (!b || cancelled) return
          const owners: Record<string, string> = {}
          for (const t of territories) owners[t.slug] = t.faction.name
          const previousOwners = bakedOwnersRef.current
          bakedOwnersRef.current = owners
          const changed = previousOwners
            ? territories.find((t) => previousOwners[t.slug] && previousOwners[t.slug] !== t.faction.name)
            : undefined
          const oldUrl = artUrlRef.current
          artUrlRef.current = URL.createObjectURL(b)
          setArtUrl(artUrlRef.current)
          if (oldUrl && changed) {
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
              if (prev) URL.revokeObjectURL(prev.prevUrl)
              return { prevUrl: oldUrl, origin: [dot.x, dot.y], radius }
            })
          } else if (oldUrl) {
            URL.revokeObjectURL(oldUrl)
          }
        })
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

  // drive the conquest reveal: grow the mask circle until its soft edge has
  // cleared the frame, then drop the old bitmap
  useEffect(() => {
    if (!reveal) return
    const c = revealCircleRef.current
    if (!c) return
    const Rmax = reveal.radius / 0.65 // gradient opaque to 65% — overshoot so the fade clears
    const t0 = performance.now()
    const DUR = 900
    let raf = 0
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / DUR)
      c.setAttribute('r', String(Rmax * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
      else {
        URL.revokeObjectURL(reveal.prevUrl)
        setReveal(null)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reveal])

  // the grain and blotch overlays never change — bake each once and keep its
  // element-level blend mode so the math against the map below is unchanged
  // (the vignette stays a live gradient rect: gradients are cheap)
  const [grainUrl, setGrainUrl] = useState<string | null>(null)
  const [blotchUrl, setBlotchUrl] = useState<string | null>(null)
  useEffect(() => {
    const bakeNoise = (filter: string, cb: (url: string) => void) =>
      bakeSvg(
        renderToStaticMarkup(
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="-400 -300 2360 1420"
            width={2360 * OVERLAY_SCALE}
            height={1420 * OVERLAY_SCALE}
          >
            <PaintDefs />
            <rect x={-400} y={-300} width={2360} height={1420} filter={`url(#${filter})`} />
          </svg>,
        ),
        2360 * OVERLAY_SCALE,
        1420 * OVERLAY_SCALE,
        cb,
      )
    bakeNoise('paper-grain', setGrainUrl)
    bakeNoise('wash-blotch', setBlotchUrl)
  }, [])

  // Do not uncover the game until its final bitmap stack is decoded and has
  // survived a browser paint. The live SVG fallback is useful while baking,
  // but it is not the finished map the intro should transition into.
  useEffect(() => {
    if (readyReported.current) return
    if (!editMode && (!artUrl || !grainUrl || !blotchUrl)) return

    let cancelled = false
    let firstFrame = 0
    let secondFrame = 0
    const urls = editMode ? [] : [artUrl!, grainUrl!, blotchUrl!]
    const decode = (url: string) =>
      new Promise<void>((resolve) => {
        const image = new Image()
        image.onload = () => resolve()
        image.onerror = () => resolve()
        image.src = url
        image.decode?.().then(resolve, () => undefined)
      })

    Promise.all(urls.map(decode)).then(() => {
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
  }, [artUrl, grainUrl, blotchUrl, editMode, onReady])

  return { artUrl, reveal, revealCircleRef, grainUrl, blotchUrl }
}
