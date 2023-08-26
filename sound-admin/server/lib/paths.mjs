import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ADMIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const REPO_DIR = path.resolve(ADMIN_DIR, '..')

export const SOUNDS_FILE = path.join(ADMIN_DIR, 'data', 'sounds.json')
export const JOBS_FILE = path.join(ADMIN_DIR, 'data', 'jobs.json')
export const ENV_FILE = path.join(ADMIN_DIR, '.env')

// candidates are the generation takes (gitignored); live is what the game ships
export const CANDIDATES_DIR = path.join(REPO_DIR, 'sounds', 'candidates')
export const LIVE_DIR = path.join(REPO_DIR, 'src', 'assets', 'sounds')
