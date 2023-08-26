// The trained faction models, bundled with the game.
//
// Produced by `npm run train-ai` from self-play; each faction learns from its
// own reward function, so these seven files are seven different players rather
// than one player copied seven times. Regenerating them replaces the AI's
// behaviour wholesale, which is why they are committed: the game as played
// should always be the game that was trained.
import type { NetJSON } from '../net'
import turkey from './turkey.json'
import greece from './greece.json'
import britain from './britain.json'
import france from './france.json'
import italy from './italy.json'
import armenia from './armenia.json'
import bulgaria from './bulgaria.json'

export const MODELS: Record<string, NetJSON> = {
  Turkey: turkey as NetJSON,
  Greece: greece as NetJSON,
  Britain: britain as NetJSON,
  France: france as NetJSON,
  Italy: italy as NetJSON,
  Armenia: armenia as NetJSON,
  Bulgaria: bulgaria as NetJSON,
}
