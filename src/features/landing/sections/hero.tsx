import { GAME_URL } from '../constants'
import type { LandingCopy } from '../copy'

const heroImage = new URL('../../../assets/landing-hero.jpg', import.meta.url).href

export const Hero = ({ copy }: { copy: LandingCopy['hero'] }) => (
  <section className="scene scene-hero" id="top" aria-labelledby="hero-title">
    <div className="scene-art-wrap">
      <img className="scene-art" src={heroImage} alt={copy.alt} />
    </div>
    <div className="hero-content">
      <p className="hero-date">{copy.dateline}</p>
      <h1 id="hero-title">{copy.title}</h1>
      <div className="hero-mark" aria-hidden="true">
        <span />
        <i>★</i>
        <span />
      </div>
      <p className="hero-sub">{copy.tagline}</p>
    </div>
    <div className="hero-actions">
      <a className="action-primary" href={GAME_URL}>
        {copy.cta} <span aria-hidden="true">→</span>
      </a>
      <p className="hero-meta">{copy.meta}</p>
    </div>
  </section>
)
