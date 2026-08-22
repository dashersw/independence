// A transfer order is given in two clicks, and either one can be taken back.
// Resolving them here rather than inside the hook keeps the rule out of React:
// the map only reports which province was pressed, and this decides what the
// order looks like afterwards — which is also what makes it testable.
import type Game from '../../../game/game'

/** Where a transfer leaves from, and where it is headed. */
export interface FortifySelection {
  selected: string | null
  fortifyTarget: string | null
}

export const NO_FORTIFY_SELECTION: FortifySelection = { selected: null, fortifyTarget: null }

/**
 * Provinces `selected` may transfer into: the land neighbours the campaign
 * still lets a column through to, plus the sea lanes a navy can use.
 */
export const fortifyTargets = (game: Game, selected: string | null): string[] => {
  if (!selected || !game.turn.currentPlayer.isHuman || game.turn.phase !== 'fortify') return []
  const from = game.bySlug[selected]
  const faction = game.humanPlayer.faction
  return [
    ...from.adjacent
      .filter((territory) => territory.faction === faction && game.movement.transferCapacity(from, territory) > 0)
      .map((territory) => territory.slug),
    ...game.movement.seaTargets(selected),
  ]
}

/**
 * Where a click on `slug` leaves the order. Every branch either keeps the
 * destination that belongs to its route or clears it — a destination left
 * behind from an abandoned route would have the amount panel offering a
 * transfer nobody asked for. Returns `state` untouched when the click is not
 * an order at all, so the caller can stay silent on a no-op.
 */
export const resolveFortifyClick = (game: Game, state: FortifySelection, slug: string): FortifySelection => {
  const { selected, fortifyTarget } = state
  const territory = game.bySlug[slug]
  if (game.turn.fortifiesUsed >= game.campaign.fortifyLimit || territory.faction !== game.humanPlayer.faction)
    return state
  // Pressing the source calls the whole transfer off. Pressing the province it
  // was headed for only hands back the second half of the order, leaving the
  // source armed to pick somewhere else.
  if (slug === selected) return NO_FORTIFY_SELECTION
  if (slug === fortifyTarget) return { selected, fortifyTarget: null }
  if (fortifyTargets(game, selected).includes(slug)) return { selected, fortifyTarget: slug }
  // Anywhere else worth marching from becomes the new source, and the old
  // destination goes with it: it was never on this province's route.
  return territory.troops > 1 ? { selected: slug, fortifyTarget: null } : state
}
