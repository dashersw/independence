import { Fragment } from 'react'
import { Scene } from '../../../components/scene'
import { useLang } from '../../../useLang'
import type { LandingCopy } from '../copy'

const finalArtEn = new URL('../../../assets/intro-background-baked-en.jpg', import.meta.url).href
const finalArtTr = new URL('../../../assets/intro-background-baked-tr.jpg', import.meta.url).href

const Charge = ({ copy }: { copy: LandingCopy['charge'] }) => (
  <section className="charge" aria-label={copy.label}>
    <div className="reveal">
      <p className="charge-line">
        {copy.lines.map((line, index) => (
          <Fragment key={line}>
            {index > 0 && <br />}
            {line}
          </Fragment>
        ))}
      </p>
      <p className="charge-sub">{copy.sub}</p>
    </div>
  </section>
)

const Footer = ({ copy }: { copy: LandingCopy['footer'] }) => (
  <footer className="landing-footer">
    <a className="landing-brand" href="#top">
      <span className="brand-seal" aria-hidden="true">
        ★
      </span>
      <span>
        <b>{copy.brand}</b>
        <small>{copy.years}</small>
      </span>
    </a>
    <p>{copy.tagline}</p>
    <div>
      {copy.links.map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
    </div>
  </footer>
)

export const Finale = ({ copy }: { copy: LandingCopy }) => {
  const lang = useLang()
  const art = lang === 'tr' ? finalArtTr : finalArtEn

  return (
    <>
      <Charge copy={copy.charge} />

      <Scene variant="scene-final" label={copy.final.label} image={art} alt={copy.final.alt} />

      <Footer copy={copy.footer} />
    </>
  )
}
