import { Interlude } from '../../../components/interlude'
import { Scene } from '../../../components/scene'
import { useLang } from '../../../useLang'
import type { LandingCopy } from '../copy'

const handsImage = new URL('../../../assets/landing-hands.jpg', import.meta.url).href
const boardShotEn = new URL('../../../../screenshots/1.jpg', import.meta.url).href
const boardShotTr = new URL('../../../../screenshots/1.tr.jpg', import.meta.url).href

const PACT_HELD_WIDTH = '53%'

const BoardWindow = ({ copy, shot }: { copy: LandingCopy['board']; shot: string }) => (
  <div className="board-window reveal">
    <div className="board-window-top">
      <span className="hud-chip">{copy.chip}</span>
      <b>{copy.caption}</b>
    </div>
    <img src={shot} alt={copy.alt} loading="lazy" />
    <div className="board-objective">
      <span>{copy.objectiveLabel}</span>
      <b>{copy.objectiveValue}</b>
      <div className="pact-bar" role="img" aria-label={copy.objectiveBar}>
        <i style={{ width: PACT_HELD_WIDTH }} />
      </div>
      <p>{copy.objectiveCopy}</p>
    </div>
  </div>
)

export const Board = ({ copy }: { copy: LandingCopy }) => {
  const lang = useLang()
  const shot = lang === 'tr' ? boardShotTr : boardShotEn

  return (
    <>
      <Interlude id="moments" kicker={copy.moments.kicker} title={copy.moments.title} copy={copy.moments.copy} />

      <Scene variant="scene-hands" label={copy.hands.label} image={handsImage} alt={copy.hands.alt} />

      <Interlude id="board" kicker={copy.board.kicker} title={copy.board.title} copy={copy.board.copy} />

      <div className="case-shell">
        <BoardWindow copy={copy.board} shot={shot} />
      </div>
    </>
  )
}
