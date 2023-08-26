import type { ReactNode } from 'react'

type SceneProperties = {
  id?: string
  variant?: string
  label?: string
  labelledBy?: string
  image: string
  alt: string
  eager?: boolean
  children?: ReactNode
}

type SceneLabelProperties = {
  dateline: string
  heading: string
  copy: string
}

export const Scene = ({ id, variant, label, labelledBy, image, alt, eager, children }: SceneProperties) => (
  <section className={variant ? `scene ${variant}` : 'scene'} id={id} aria-label={label} aria-labelledby={labelledBy}>
    <div className="scene-art-wrap">
      <img className="scene-art" src={image} alt={alt} loading={eager ? 'eager' : 'lazy'} />
    </div>
    {children}
  </section>
)

export const SceneLabel = ({ dateline, heading, copy }: SceneLabelProperties) => (
  <div className="scene-label reveal">
    <span>{dateline}</span>
    <h3>{heading}</h3>
    <p>{copy}</p>
  </div>
)
