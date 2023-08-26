import fs from 'node:fs'
import path from 'node:path'
import { SOUNDS_FILE, CANDIDATES_DIR, LIVE_DIR } from './paths.mjs'
import { readJson, writeJsonAtomic } from './store.mjs'

function registry() {
  return readJson(SOUNDS_FILE, { sounds: [] })
}

function fileInfo(file, url) {
  try {
    const stat = fs.statSync(file)
    return { url, mtime: stat.mtime.toISOString(), size: stat.size }
  } catch {
    return null
  }
}

function candidatesOf(id, chosenFile) {
  const dir = path.join(CANDIDATES_DIR, id)
  let names = []
  try {
    names = fs.readdirSync(dir).filter(f => f.endsWith('.mp3'))
  } catch {}
  return names
    .map(name => ({
      file: name,
      current: name === chosenFile,
      ...fileInfo(path.join(dir, name), `/files/candidates/${id}/${name}`)
    }))
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1))
}

function decorate(sound) {
  return {
    ...sound,
    candidates: candidatesOf(sound.id, sound.chosen?.file),
    live: fileInfo(path.join(LIVE_DIR, `${sound.id}.mp3`), `/files/live/${sound.id}.mp3`)
  }
}

export function listSounds() {
  return registry().sounds.map(decorate)
}

export function getSound(id) {
  const sound = registry().sounds.find(s => s.id === id)
  return sound ? decorate(sound) : null
}

export function updateSound(id, patch) {
  const data = registry()
  const sound = data.sounds.find(s => s.id === id)
  if (!sound) throw new Error(`unknown sound: ${id}`)
  if (patch.prompt !== undefined) sound.prompt = String(patch.prompt)
  if (patch.params !== undefined) sound.params = patch.params
  if (patch.notes !== undefined) sound.notes = String(patch.notes)
  writeJsonAtomic(SOUNDS_FILE, data)
  return decorate(sound)
}

/** Write a generated take into the candidates folder. Nothing is ever overwritten. */
export function saveCandidate(id, buffer, jobId) {
  const dir = path.join(CANDIDATES_DIR, id)
  fs.mkdirSync(dir, { recursive: true })
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${jobId}.mp3`
  fs.writeFileSync(path.join(dir, name), buffer)
  return { file: name, url: `/files/candidates/${id}/${name}` }
}

/** Soft-delete candidates: moved to sounds/candidates/.trash/<id>/, recoverable by hand. */
export function deleteCandidates(id, files) {
  const sound = registry().sounds.find(s => s.id === id)
  if (!sound) throw new Error(`unknown sound: ${id}`)
  const dir = path.join(CANDIDATES_DIR, id)
  const trash = path.join(CANDIDATES_DIR, '.trash', id)
  fs.mkdirSync(trash, { recursive: true })
  for (const file of files) {
    const name = path.basename(String(file))
    const source = path.join(dir, name)
    if (fs.existsSync(source)) fs.renameSync(source, path.join(trash, name))
  }
  return decorate(sound)
}

/** Promote a candidate to the live file the game loads. */
export function chooseCandidate(id, file) {
  const data = registry()
  const sound = data.sounds.find(s => s.id === id)
  if (!sound) throw new Error(`unknown sound: ${id}`)
  const source = path.join(CANDIDATES_DIR, id, path.basename(file))
  if (!fs.existsSync(source)) throw new Error(`no such candidate: ${file}`)
  fs.mkdirSync(LIVE_DIR, { recursive: true })
  fs.copyFileSync(source, path.join(LIVE_DIR, `${id}.mp3`))
  sound.chosen = { file: path.basename(file), ts: new Date().toISOString() }
  writeJsonAtomic(SOUNDS_FILE, data)
  return decorate(sound)
}
