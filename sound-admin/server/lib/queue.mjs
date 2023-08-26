import crypto from 'node:crypto'
import { JOBS_FILE } from './paths.mjs'
import { readJson, writeJsonAtomic } from './store.mjs'
import { generate } from './eleven.mjs'
import { getSound, saveCandidate } from './sounds.mjs'

const MAX_JOBS_KEPT = 500
// SFX renders take a few seconds, music runs longer; the API tolerates a few in flight
const CONCURRENCY = 3

class JobQueue {
  constructor() {
    this.jobs = readJson(JOBS_FILE, [])
    this.controllers = new Map()
    let changed = false
    for (const job of this.jobs) {
      if (job.status === 'queued' || job.status === 'running') {
        job.status = 'interrupted'
        job.error = 'server restarted while job was pending'
        job.finishedAt = new Date().toISOString()
        changed = true
      }
    }
    if (changed) this.persist()
  }

  persist() {
    let excess = this.jobs.length - MAX_JOBS_KEPT
    if (excess > 0) {
      this.jobs = this.jobs.filter(job => {
        if (excess > 0 && job.status !== 'queued' && job.status !== 'running') {
          excess--
          return false
        }
        return true
      })
    }
    writeJsonAtomic(JOBS_FILE, this.jobs)
  }

  list() {
    return [...this.jobs].reverse()
  }

  get(id) {
    return this.jobs.find(j => j.id === id) ?? null
  }

  counts() {
    let queued = 0
    let running = 0
    for (const job of this.jobs) {
      if (job.status === 'queued') queued++
      else if (job.status === 'running') running++
    }
    return { queued, running }
  }

  /** specs: [{ soundId, title, kind, prompt, params }] — prompt and params frozen at enqueue. */
  enqueue(specs) {
    const created = specs.map(spec => ({
      id: crypto.randomUUID().slice(0, 8),
      soundId: spec.soundId,
      title: spec.title,
      kind: spec.kind,
      prompt: spec.prompt,
      params: spec.params,
      status: 'queued',
      createdAt: new Date().toISOString()
    }))
    this.jobs.push(...created)
    this.persist()
    this.pump()
    return created
  }

  pump() {
    while (this.counts().running < CONCURRENCY) {
      const next = this.jobs.find(j => j.status === 'queued')
      if (!next) break
      this.run(next)
    }
  }

  async run(job) {
    job.status = 'running'
    job.startedAt = new Date().toISOString()
    this.persist()
    const controller = new AbortController()
    this.controllers.set(job.id, controller)
    try {
      if (!getSound(job.soundId)) throw new Error(`target disappeared: ${job.soundId}`)
      const buffer = await generate(job.kind, job.prompt, job.params, { signal: controller.signal })
      const saved = saveCandidate(job.soundId, buffer, job.id)
      job.resultFile = saved.file
      job.resultUrl = saved.url
      job.status = 'completed'
    } catch (err) {
      job.status = controller.signal.aborted ? 'canceled' : 'failed'
      job.error = err.message
    } finally {
      job.finishedAt = new Date().toISOString()
      this.controllers.delete(job.id)
      this.persist()
      this.pump()
    }
  }

  cancel(id) {
    const job = this.get(id)
    if (!job) throw new Error(`unknown job: ${id}`)
    if (job.status === 'queued') {
      job.status = 'canceled'
      job.finishedAt = new Date().toISOString()
      this.persist()
      return job
    }
    if (job.status === 'running') {
      this.controllers.get(id)?.abort()
      return job
    }
    throw new Error(`job is ${job.status}; only queued or running jobs can be canceled`)
  }

  retry(id) {
    const job = this.get(id)
    if (!job) throw new Error(`unknown job: ${id}`)
    if (!['failed', 'interrupted', 'canceled'].includes(job.status)) {
      throw new Error(`job is ${job.status}; only failed, interrupted or canceled jobs can be retried`)
    }
    return this.enqueue([
      { soundId: job.soundId, title: job.title, kind: job.kind, prompt: job.prompt, params: job.params }
    ])[0]
  }
}

export const queue = new JobQueue()
