import { GameSnapshot, SAVE_VERSION } from './game/game'

// Named save slots in localStorage. Each slot keeps its own key so one huge
// save can't blow the quota for the whole index, and the index itself stays
// small enough to read on every menu open.
const INDEX_KEY = 'independence.saves'
const SLOT_KEY = (id: string) => `independence.save.${id}`
export const MAX_SAVES = 12

export interface SaveMeta {
  id: string
  name: string
  savedAt: number
  round: number
  date: string // in-game date, e.g. "May 1919"
  pact: number // Misak-ı Millî progress at save time
  auto?: boolean
}

const readIndex = (): SaveMeta[] => {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const writeIndex = (list: SaveMeta[]) => {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list))
  } catch {
    // quota or private mode — the slot write below will surface the failure
  }
}

// newest first
export const listSaves = (): SaveMeta[] => readIndex().sort((a, b) => b.savedAt - a.savedAt)

export const saveGame = (meta: Omit<SaveMeta, 'id' | 'savedAt'>, snapshot: GameSnapshot, id?: string): SaveMeta => {
  const slot: SaveMeta = {
    ...meta,
    id: id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: Date.now()
  }
  localStorage.setItem(SLOT_KEY(slot.id), JSON.stringify(snapshot))
  const list = readIndex().filter(s => s.id !== slot.id)
  list.push(slot)
  // trim the oldest beyond the cap so localStorage can't grow without bound
  const sorted = list.sort((a, b) => b.savedAt - a.savedAt)
  for (const stale of sorted.slice(MAX_SAVES)) localStorage.removeItem(SLOT_KEY(stale.id))
  writeIndex(sorted.slice(0, MAX_SAVES))
  return slot
}

export const loadSnapshot = (id: string): GameSnapshot | null => {
  try {
    const raw = localStorage.getItem(SLOT_KEY(id))
    if (!raw) return null
    const snap = JSON.parse(raw) as GameSnapshot
    return snap && snap.v === SAVE_VERSION ? snap : null
  } catch {
    return null
  }
}

export const deleteSave = (id: string) => {
  localStorage.removeItem(SLOT_KEY(id))
  writeIndex(readIndex().filter(s => s.id !== id))
}
