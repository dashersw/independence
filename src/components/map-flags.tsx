import React from 'react'

interface FlagStyle {
  fill: string // solid base color painted under the flag art (hides clip seams)
  stroke: string // representative dark color for badges/outlines
  border?: string // faction border band + border shadow, when darker than stroke
  swatch: string // CSS background for HUD swatches
}

export const FLAG_STYLES: Record<string, FlagStyle> = {
  Turkey: {
    fill: '#d8353c',
    stroke: '#8f1d1d',
    border: '#701212',
    swatch: '#d8353c',
  },
  Greece: {
    fill: '#2f74c0',
    stroke: '#0D5EAF',
    swatch: 'repeating-linear-gradient(180deg, #2f74c0 0 4px, #f4f6f8 4px 8px)',
  },
  Bulgaria: {
    fill: '#00966E',
    stroke: '#00966E',
    swatch: 'linear-gradient(180deg, #f4f6f8 0 33%, #00966E 33% 66%, #D62612 66% 100%)',
  },
  Armenia: {
    fill: '#0033A0',
    stroke: '#0033A0',
    swatch: 'linear-gradient(180deg, #D90012 0 33%, #0033A0 33% 66%, #F2A800 66% 100%)',
  },
  Italy: {
    fill: '#ece8dc',
    stroke: '#009246',
    swatch: 'linear-gradient(90deg, #009246 0 33%, #f4f6f8 33% 66%, #CE2B37 66% 100%)',
  },
  Britain: {
    fill: '#1d3f94',
    stroke: '#012169',
    swatch: 'linear-gradient(135deg, #1d3f94 0 55%, #f4f6f8 55% 70%, #C8102E 70% 100%)',
  },
  France: {
    fill: '#ece8dc',
    stroke: '#0055A4',
    swatch: 'linear-gradient(90deg, #0055A4 0 33%, #f4f6f8 33% 66%, #EF4135 66% 100%)',
  },
  // Iraq is out of the war, not in it: no flag art, so it paints as plain
  // unclaimed land like the neutral countries around the edge of the map.
  // The entry itself has to exist — FLAG_STYLES is indexed without a fallback.
  Iraq: {
    fill: '#ded3b6',
    stroke: '#a99a78',
    swatch: 'linear-gradient(135deg, #ded3b6 0 100%)',
  },
}

// Risk-style army denominations: cannonball = 10, cavalry = 5, infantry = 1.
export const unitBreakdown = (troops: number) => ({
  cannonballs: Math.floor(troops / 10),
  cavalry: Math.floor((troops % 10) / 5),
  infantry: troops % 5,
})

export const unitGlyphs = (troops: number) => {
  const { cannonballs, cavalry, infantry } = unitBreakdown(troops)
  const balls = cannonballs > 4 ? `●×${cannonballs}` : '●'.repeat(cannonballs)
  return `${balls}${'♞'.repeat(cavalry)}${'♟'.repeat(infantry)}`
}

// A little caravel, drawn rather than typed: the unit counters are chess
// glyphs — ● ♞ ♟ — and an emoji sailboat sits in that company like a sticker
// on an engraving. Hull, mast, mainsail, jib, centred on the origin.
export const SHIP =
  'M -9 2 Q 0 10.5 9 2 Z M -0.7 -10.5 L 0.7 -10.5 L 0.7 2 L -0.7 2 Z ' +
  'M 1.6 -9.5 Q 8.5 -3.5 1.6 1 Z M -1.6 -6.5 Q -6.5 -2.5 -1.6 1 Z'

export const FLAG_ART: Record<string, React.ReactElement> = {
  Turkey: (
    <>
      <rect width="36" height="24" fill="#E30A17" />
      <circle cx="13.5" cy="12" r="6" fill="#f4f6f8" />
      <circle cx="15" cy="12" r="4.8" fill="#E30A17" />
      <polygon
        fill="#f4f6f8"
        points="24,12 22.31,12.59 22.27,14.38 21.19,12.95 19.48,13.47 20.5,12 19.48,10.53 21.19,11.05 22.27,9.62 22.31,11.41"
      />
    </>
  ),
  Greece: (
    <>
      <rect width="36" height="24" fill="#f4f6f8" />
      {[0, 2, 4, 6, 8].map((i) => (
        <rect key={i} y={(i * 24) / 9} width="36" height={24 / 9} fill="#2f74c0" />
      ))}
      <rect width="13.33" height="13.33" fill="#2f74c0" />
      <rect x="5.33" width="2.67" height="13.33" fill="#f4f6f8" />
      <rect y="5.33" width="13.33" height="2.67" fill="#f4f6f8" />
    </>
  ),
  Bulgaria: (
    <>
      <rect width="36" height="8" fill="#f4f6f8" />
      <rect y="8" width="36" height="8" fill="#00966E" />
      <rect y="16" width="36" height="8" fill="#D62612" />
    </>
  ),
  Armenia: (
    <>
      <rect width="36" height="8" fill="#D90012" />
      <rect y="8" width="36" height="8" fill="#0033A0" />
      <rect y="16" width="36" height="8" fill="#F2A800" />
    </>
  ),
  Italy: (
    <>
      <rect width="12" height="24" fill="#009246" />
      <rect x="12" width="12" height="24" fill="#f4f6f8" />
      <rect x="24" width="12" height="24" fill="#CE2B37" />
    </>
  ),
  France: (
    <>
      <rect width="12" height="24" fill="#0055A4" />
      <rect x="12" width="12" height="24" fill="#f4f6f8" />
      <rect x="24" width="12" height="24" fill="#EF4135" />
    </>
  ),
  Britain: (
    <>
      <rect width="36" height="24" fill="#012169" />
      <path d="M0,0 L36,24 M36,0 L0,24" stroke="#f4f6f8" strokeWidth="4.8" />
      <path d="M0,0 L36,24 M36,0 L0,24" stroke="#C8102E" strokeWidth="1.9" />
      <rect x="14" width="8" height="24" fill="#f4f6f8" />
      <rect y="8" width="36" height="8" fill="#f4f6f8" />
      <rect x="15.6" width="4.8" height="24" fill="#C8102E" />
      <rect y="9.6" width="36" height="4.8" fill="#C8102E" />
    </>
  ),
}

// Small standalone flag icon for HTML UI (HUD chips, log, cards).
export const FlagIcon = ({ faction, className = 'swatch' }: { faction: string; className?: string }) =>
  FLAG_ART[faction] ? (
    <svg className={className} viewBox="0 0 36 24" preserveAspectRatio="none">
      {FLAG_ART[faction]}
    </svg>
  ) : (
    <span className={`${className} swatch-neutral`} />
  )

export const FlagDefs = () => (
  <defs>
    {Object.entries(FLAG_ART).map(([name, art]) => (
      <symbol key={name} id={`flag-def-${name}`} viewBox="0 0 36 24" preserveAspectRatio="none">
        {art}
      </symbol>
    ))}
  </defs>
)
