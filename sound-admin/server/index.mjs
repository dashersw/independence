import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANDIDATES_DIR, LIVE_DIR } from './lib/paths.mjs'
import { listSounds, getSound, updateSound, chooseCandidate, deleteCandidates } from './lib/sounds.mjs'
import { queue } from './lib/queue.mjs'
import { credits } from './lib/eleven.mjs'

const PORT = Number(process.env.PORT) || 4500
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public')

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use('/', express.static(PUBLIC_DIR))
app.use('/files/candidates', express.static(CANDIDATES_DIR))
app.use('/files/live', express.static(LIVE_DIR))

const ok = (res, data) => res.json({ ok: true, data })
const fail = (res, status, error) => res.status(status).json({ ok: false, error })
const wrap = fn => async (req, res) => {
  try {
    await fn(req, res)
  } catch (err) {
    fail(res, 400, err.message)
  }
}

app.get(
  '/api/overview',
  wrap(async (req, res) => {
    const sounds = listSounds()
    ok(res, {
      total: sounds.length,
      withCandidates: sounds.filter(s => s.candidates.length).length,
      live: sounds.filter(s => s.live).length,
      credits: await credits(),
      queue: queue.counts()
    })
  })
)

app.get('/api/sounds', wrap((req, res) => ok(res, listSounds())))

app.get(
  '/api/sounds/:id',
  wrap((req, res) => {
    const sound = getSound(req.params.id)
    if (!sound) return fail(res, 404, `unknown sound: ${req.params.id}`)
    ok(res, sound)
  })
)

app.put('/api/sounds/:id', wrap((req, res) => ok(res, updateSound(req.params.id, req.body ?? {}))))

// { ids: [...], count?: 1..8, promptOverride? (single id only) }
app.post(
  '/api/generate',
  wrap((req, res) => {
    const { ids, count = 1, promptOverride } = req.body ?? {}
    if (!Array.isArray(ids) || !ids.length) throw new Error('ids required')
    if (promptOverride && ids.length > 1) throw new Error('promptOverride is single-target only')
    const n = Math.max(1, Math.min(8, Number(count) || 1))
    const specs = []
    for (const id of ids) {
      const sound = getSound(id)
      if (!sound) throw new Error(`unknown sound: ${id}`)
      for (let i = 0; i < n; i++)
        specs.push({
          soundId: id,
          title: sound.title,
          kind: sound.kind,
          prompt: promptOverride || sound.prompt,
          params: sound.params ?? {}
        })
    }
    ok(res, queue.enqueue(specs))
  })
)

app.post(
  '/api/sounds/:id/choose',
  wrap((req, res) => {
    const { file } = req.body ?? {}
    if (!file) throw new Error('file required')
    ok(res, chooseCandidate(req.params.id, file))
  })
)

// { files: [...] } — soft-delete: moved to sounds/candidates/.trash/<id>/
app.post(
  '/api/sounds/:id/candidates/delete',
  wrap((req, res) => {
    const { files } = req.body ?? {}
    if (!Array.isArray(files) || !files.length) throw new Error('files required')
    ok(res, deleteCandidates(req.params.id, files))
  })
)

app.get('/api/jobs', wrap((req, res) => ok(res, queue.list())))
app.post('/api/jobs/:id/cancel', wrap((req, res) => ok(res, queue.cancel(req.params.id))))
app.post('/api/jobs/:id/retry', wrap((req, res) => ok(res, queue.retry(req.params.id))))

app.listen(PORT, () => console.log(`sound-admin: http://localhost:${PORT}`))
