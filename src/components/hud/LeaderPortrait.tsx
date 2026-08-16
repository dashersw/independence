import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const LEADER_PORTRAITS: Record<string, string> = {
  'Mustafa Kemal': new URL('../../assets/leaders/mustafa_kemal.png', import.meta.url).href,
  'Eleftherios Venizelos': new URL('../../assets/leaders/eleftherios_venizelos.png', import.meta.url).href,
  'Dimitrios Rallis': new URL('../../assets/leaders/dimitrios_rallis.png', import.meta.url).href,
  'Aleksandar Stamboliyski': new URL('../../assets/leaders/aleksandar_stamboliyski.png', import.meta.url).href,
  'Hovhannes Kajaznuni': new URL('../../assets/leaders/hovhannes_kajaznuni.png', import.meta.url).href,
  'Vittorio Emanuele Orlando': new URL('../../assets/leaders/vittorio_emanuele_orlando.png', import.meta.url).href,
  'David Lloyd George': new URL('../../assets/leaders/david_lloyd_george.png', import.meta.url).href,
  'Andrew Bonar Law': new URL('../../assets/leaders/andrew_bonar_law.png', import.meta.url).href,
  'Georges Clemenceau': new URL('../../assets/leaders/georges_clemenceau.png', import.meta.url).href,
}

export const LeaderPortrait = ({ name }: { name: string }) => {
  const [expanded, setExpanded] = useState(false)
  const src = LEADER_PORTRAITS[name]

  useEffect(() => {
    if (!expanded) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [expanded])

  if (!src) return null

  return (
    <>
      <figure className="leader-portrait" title={name}>
        <button
          type="button"
          className="leader-portrait-frame"
          aria-label={`Enlarge ${name} portrait`}
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
        >
          <div className="leader-portrait-mat">
            <img src={src} alt={`${name} portrait`} />
          </div>
        </button>
      </figure>
      {expanded &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="leader-portrait-overlay" role="presentation" onClick={() => setExpanded(false)}>
            <section
              className="leader-dossier"
              role="dialog"
              aria-modal="true"
              aria-label={`${name} portrait`}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="leader-dossier-close"
                aria-label="Close portrait"
                onClick={() => setExpanded(false)}
              >
                ×
              </button>
              <div className="leader-dossier-name">{name}</div>
              <div className="leader-dossier-frame">
                <img src={src} alt="" />
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  )
}
