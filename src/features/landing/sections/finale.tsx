import { Fragment } from 'react'
import { Scene } from '../../../components/scene'
import { useLang } from '../../../useLang'
import { GITHUB_URL, IMPRINT_URL, KUNYE_URL, TEAM } from '../constants'
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

const GithubMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.335-1.725-1.335-1.725-1.087-.731.084-.716.084-.716 1.205.082 1.838 1.215 1.838 1.215 1.07 1.803 2.809 1.282 3.495.981.108-.763.417-1.282.76-1.577-2.665-.295-5.466-1.309-5.466-5.827 0-1.287.465-2.339 1.235-3.164-.135-.298-.54-1.497.105-3.121 0 0 1.005-.316 3.3 1.209.96-.262 1.98-.392 3-.398 1.02.006 2.04.136 3 .398 2.28-1.525 3.285-1.209 3.285-1.209.645 1.624.24 2.823.12 3.121.765.825 1.23 1.877 1.23 3.164 0 4.53-2.805 5.527-5.475 5.817.42.354.81 1.077.81 2.182 0 1.578-.015 2.846-.015 3.229 0 .309.21.678.825.56C20.565 21.917 24 17.499 24 12.292 24 5.78 18.627.5 12 .5z" />
  </svg>
)

const Footer = ({ copy, imprintUrl }: { copy: LandingCopy['footer']; imprintUrl: string }) => (
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
    <div className="landing-footer-about">
      <p>{copy.tagline}</p>
      <a className="landing-source" href={GITHUB_URL} target="_blank" rel="noreferrer">
        <GithubMark />
        {copy.openSource}
      </a>
    </div>
    <div>
      {copy.links.map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
    </div>
    <div className="landing-footer-meta">
      <span className="landing-team">
        {copy.team}
        {TEAM.map((member) => (
          <a key={member.handle} href={member.url} target="_blank" rel="noreferrer">
            <GithubMark />
            {member.handle}
          </a>
        ))}
      </span>
      <a className="landing-imprint" href={imprintUrl}>
        {copy.imprint}
      </a>
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

      <Footer copy={copy.footer} imprintUrl={lang === 'tr' ? KUNYE_URL : IMPRINT_URL} />
    </>
  )
}
