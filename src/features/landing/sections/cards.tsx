import { Interlude } from '../../../components/interlude'
import { useLang } from '../../../useLang'
import type { LandingCopy } from '../copy'

const erzurumEn = new URL('../../../../screenshots/2.jpg', import.meta.url).href
const erzurumTr = new URL('../../../../screenshots/2.tr.jpg', import.meta.url).href
const assemblyEn = new URL('../../../../screenshots/3.jpg', import.meta.url).href
const assemblyTr = new URL('../../../../screenshots/3.tr.jpg', import.meta.url).href
const sevresEn = new URL('../../../../screenshots/4.jpg', import.meta.url).href
const sevresTr = new URL('../../../../screenshots/4.tr.jpg', import.meta.url).href
const inonuEn = new URL('../../../../screenshots/5.jpg', import.meta.url).href
const inonuTr = new URL('../../../../screenshots/5.tr.jpg', import.meta.url).href

// The fourth card deliberately shows the other language: it is the one that
// exists to demonstrate the game is bilingual.
const englishShots = [erzurumEn, assemblyEn, sevresEn, inonuTr]
const turkishShots = [erzurumTr, assemblyTr, sevresTr, inonuEn]

export const Cards = ({ copy }: { copy: LandingCopy['cards'] }) => {
  const lang = useLang()
  const shots = lang === 'tr' ? turkishShots : englishShots

  return (
    <>
      <Interlude id="cards" kicker={copy.kicker} title={copy.title} copy={copy.copy} />

      <div className="gallery gallery-2">
        {copy.exhibits.map((exhibit, index) => (
          <figure key={exhibit.title} className="exhibit reveal">
            <img src={shots.at(index)} alt={exhibit.alt} loading="lazy" />
            <figcaption>
              <span>{exhibit.dateline}</span>
              <b>{exhibit.title}</b>
              <p>{exhibit.copy}</p>
            </figcaption>
          </figure>
        ))}
      </div>

      <p className="gallery-note reveal">{copy.note}</p>
    </>
  )
}
