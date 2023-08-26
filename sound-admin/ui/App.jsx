import React, { useEffect, useRef, useState } from 'react'
import { api, post, put, toast } from './api.js'
import Player from './Player.jsx'

const CATEGORIES = [
  ['combat', 'Combat'],
  ['turn', 'Turn economy'],
  ['cards', 'Event cards'],
  ['ui', 'Game frame & UI'],
  ['endings', 'Ending jingles'],
  ['ambient', 'Ambient']
]

const STATUS_FILTERS = [
  ['all', 'All'],
  ['live', '● Live'],
  ['nolive', '○ No live'],
  ['takes', 'Has takes'],
  ['notakes', 'No takes']
]

const isActive = j => j.status === 'queued' || j.status === 'running'

const readFiltersFromUrl = () => {
  const p = new URLSearchParams(location.hash.split('?')[1] ?? '')
  return {
    cat: CATEGORIES.some(([k]) => k === p.get('cat')) ? p.get('cat') : 'all',
    status: STATUS_FILTERS.some(([k]) => k === p.get('status')) ? p.get('status') : 'all',
    q: p.get('q') ?? ''
  }
}

const writeFiltersToUrl = f => {
  const p = new URLSearchParams()
  if (f.cat !== 'all') p.set('cat', f.cat)
  if (f.status !== 'all') p.set('status', f.status)
  if (f.q) p.set('q', f.q)
  const qs = p.toString()
  history.replaceState(null, '', qs ? `#?${qs}` : location.pathname)
}

const matchesFilters = (s, f) => {
  if (f.cat !== 'all' && s.category !== f.cat) return false
  if (f.status === 'live' && !s.live) return false
  if (f.status === 'nolive' && s.live) return false
  if (f.status === 'takes' && !s.candidates.length) return false
  if (f.status === 'notakes' && s.candidates.length) return false
  if (f.q) {
    const q = f.q.toLowerCase()
    if (![s.id, s.title, s.prompt, s.trigger].some(v => v?.toLowerCase().includes(q))) return false
  }
  return true
}

function Toasts() {
  const [toasts, setToasts] = useState([])
  useEffect(() => {
    const onToast = e => {
      const id = crypto.randomUUID()
      setToasts(t => [...t, { id, ...e.detail }])
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), e.detail.isError ? 6000 : 2500)
    }
    window.addEventListener('toast', onToast)
    return () => window.removeEventListener('toast', onToast)
  }, [])
  return (
    <>
      {toasts.map((t, i) => (
        <div key={t.id} className={`toast ${t.isError ? 'error' : ''}`} style={{ top: 54 + i * 44 }}>
          {t.message}
        </div>
      ))}
    </>
  )
}

/** Placeholder row shown while a generation job for this sound is in flight. */
const PendingRow = ({ job }) => (
  <div className="cand pending">
    <div className="loading-bar">
      <div className="loading-fill" />
    </div>
    <span className="meta">generating — {job.status === 'completed' ? 'finishing' : job.status}…</span>
  </div>
)

function CandidateRow({ sound, cand, checked, onCheck, onChoose, onDelete }) {
  return (
    <div className={`cand ${cand.current ? 'current' : ''}`}>
      <input type="checkbox" checked={checked} onChange={e => onCheck(cand.file, e.target.checked)} />
      <Player src={cand.url} />
      <span className="meta">
        {new Date(cand.mtime).toLocaleString()} · {(cand.size / 1024).toFixed(0)} KB
      </span>
      {cand.current ? (
        <span className="badge">live</span>
      ) : (
        <button onClick={() => onChoose(sound.id, cand.file)}>Make live</button>
      )}
      <button className="danger" onClick={() => onDelete(sound.id, [cand.file])}>
        Delete
      </button>
    </div>
  )
}

function Detail({ sound, pendingJobs, candChecked, setCandChecked, onGenerate, onSave, onChoose, onDelete }) {
  const isMusic = sound.kind === 'music'
  const [prompt, setPrompt] = useState(sound.prompt)
  const [duration, setDuration] = useState(sound.params?.duration_seconds ?? '')
  const [length, setLength] = useState((sound.params?.music_length_ms ?? 6000) / 1000)
  const [influence, setInfluence] = useState(sound.params?.prompt_influence ?? '')

  const draft = () => {
    const params = { ...sound.params }
    if (isMusic) {
      if (length) params.music_length_ms = Number(length) * 1000
    } else {
      if (duration) params.duration_seconds = Number(duration)
      if (influence !== '' && influence != null) params.prompt_influence = Number(influence)
      else delete params.prompt_influence
    }
    return { prompt, params }
  }

  // the enqueue must wait for the server save (the prompt is frozen there), but
  // the placeholder shouldn't — pass the save along as a gate
  const saveAndGenerate = count => onGenerate([sound.id], count, onSave(sound, draft()))

  const checkedFiles = sound.candidates.filter(c => candChecked.has(`${sound.id}::${c.file}`)).map(c => c.file)
  const nonLive = sound.candidates.filter(c => !c.current).map(c => c.file)

  const onCheck = (file, isChecked) => {
    const key = `${sound.id}::${file}`
    setCandChecked(prev => {
      const next = new Set(prev)
      isChecked ? next.add(key) : next.delete(key)
      return next
    })
  }

  const batchDelete = files => {
    onDelete(sound.id, files)
    setCandChecked(prev => {
      const next = new Set(prev)
      for (const f of files) next.delete(`${sound.id}::${f}`)
      return next
    })
  }

  return (
    <div className="detail">
      <div className="trigger">
        Trigger: {sound.trigger} — files land in <code>sounds/candidates/{sound.id}/</code>, live file is{' '}
        <code>src/assets/sounds/{sound.id}.mp3</code>
      </div>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} />
      <div className="params">
        {isMusic ? (
          <label>
            length (s){' '}
            <input type="number" step="0.5" min="3" max="30" value={length} onChange={e => setLength(e.target.value)} />
          </label>
        ) : (
          <>
            <label>
              duration (s){' '}
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="30"
                value={duration}
                onChange={e => setDuration(e.target.value)}
              />
            </label>
            <label>
              prompt influence{' '}
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                placeholder="auto"
                value={influence}
                onChange={e => setInfluence(e.target.value)}
              />
            </label>
            {sound.params?.loop && <label>loop: on</label>}
          </>
        )}
        <button onClick={() => onSave(sound, draft()).catch(() => {})}>Save prompt &amp; params</button>
        <button className="primary" onClick={() => saveAndGenerate(1)}>
          Generate 1
        </button>
        <button className="primary" onClick={() => saveAndGenerate(3)}>
          Generate 3
        </button>
      </div>
      {sound.candidates.length > 0 && (
        <div className="cand-toolbar">
          <button className="danger" disabled={!checkedFiles.length} onClick={() => batchDelete(checkedFiles)}>
            Delete selected ({checkedFiles.length})
          </button>
          <button className="danger" disabled={!nonLive.length} onClick={() => batchDelete(nonLive)}>
            Delete non-live ({nonLive.length})
          </button>
          <button className="danger" onClick={() => batchDelete(sound.candidates.map(c => c.file))}>
            Delete all ({sound.candidates.length})
          </button>
        </div>
      )}
      <div className="candidates">
        {pendingJobs.map(j => (
          <PendingRow key={j.id} job={j} />
        ))}
        {sound.candidates.map(c => (
          <CandidateRow
            key={c.file}
            sound={sound}
            cand={c}
            checked={candChecked.has(`${sound.id}::${c.file}`)}
            onCheck={onCheck}
            onChoose={onChoose}
            onDelete={onDelete}
          />
        ))}
        {!sound.candidates.length && !pendingJobs.length && <div className="empty">No takes yet — hit Generate.</div>}
      </div>
    </div>
  )
}

function SoundRow({ sound, open, checked, onToggleOpen, onCheck, ...detailProps }) {
  const takeCount = sound.candidates.length
  return (
    <>
      <div
        className={`row ${open ? 'open' : ''}`}
        onClick={e => {
          if (e.target.closest('button, input, .player, .detail')) return
          onToggleOpen(sound.id)
        }}
      >
        <input type="checkbox" checked={checked} onChange={e => onCheck(sound.id, e.target.checked)} />
        <span className="name">
          {sound.title}
          <span className="prio">{sound.priority}</span>
        </span>
        <span className={`kind ${sound.kind}`}>{sound.kind}</span>
        <span className="prompt-preview">{sound.prompt}</span>
        <span className="status">
          {sound.live ? <span className="live">● live</span> : <span>○ none</span>} · {takeCount} take
          {takeCount === 1 ? '' : 's'}
        </span>
        <span className="actions">
          {sound.live && <Player key={sound.live.url} src={`${sound.live.url}?t=${encodeURIComponent(sound.live.mtime)}`} small />}
        </span>
      </div>
      {open && <Detail sound={sound} {...detailProps} />}
    </>
  )
}

const JOBS_COMPACT = 96 // title bar + ~2 job rows

function JobsPanel({ jobs, visible, onClose, onJobsChanged }) {
  const panelRef = useRef(null)
  const storedHeight = () => Number(localStorage.getItem('jobsHeight')) || Math.round(window.innerHeight * 0.4)
  const [height, setHeight] = useState(JOBS_COMPACT)
  const expanded = height > JOBS_COMPACT + 20

  const startDrag = e => {
    e.preventDefault()
    const startY = e.clientY
    const startH = panelRef.current.offsetHeight
    const onMove = ev =>
      setHeight(Math.min(window.innerHeight * 0.85, Math.max(60, startH + startY - ev.clientY)))
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const h = panelRef.current.offsetHeight
      if (h > JOBS_COMPACT + 20) localStorage.setItem('jobsHeight', String(h))
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const act = (id, action) =>
    post(`/jobs/${id}/${action}`).then(onJobsChanged, err => toast(err.message, true))

  if (!visible) return null
  return (
    <div id="jobs-panel" className="visible" ref={panelRef} style={{ height }}>
      <div className="jobs-handle" title="Drag to resize" onMouseDown={startDrag} />
      <div className="jobs-head">
        <h3>Jobs</h3>
        <button onClick={() => setHeight(expanded ? JOBS_COMPACT : storedHeight())}>
          {expanded ? '▼ Collapse' : '▲ Expand'}
        </button>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="jobs-body">
        {jobs.slice(0, 40).map(j => (
          <div className="job" key={j.id}>
            <span className="jid">{j.id}</span>
            <span>{j.title}</span>
            <span className={`jstatus ${j.status}`}>{j.status}</span>
            {j.resultUrl && <Player key={j.resultUrl} src={j.resultUrl} small />}
            {j.error && <span className="jerr">{j.error}</span>}
            {isActive(j) && <button onClick={() => act(j.id, 'cancel')}>Cancel</button>}
            {['failed', 'interrupted', 'canceled'].includes(j.status) && (
              <button onClick={() => act(j.id, 'retry')}>Retry</button>
            )}
          </div>
        ))}
        {!jobs.length && <div className="empty">No jobs yet.</div>}
      </div>
    </div>
  )
}

export default function App() {
  const [sounds, setSounds] = useState([])
  const [overview, setOverview] = useState(null)
  const [jobs, setJobs] = useState([])
  const [filters, setFilters] = useState(readFiltersFromUrl)
  const [open, setOpen] = useState(() => new Set())
  const [checked, setChecked] = useState(() => new Set())
  const [candChecked, setCandChecked] = useState(() => new Set())
  const [jobsVisible, setJobsVisible] = useState(false)

  // latest sounds, for optimistic snapshots taken inside event handlers
  const soundsRef = useRef([])
  useEffect(() => {
    soundsRef.current = sounds
  }, [sounds])

  // Bumped by every optimistic mutation. A refresh that started before the bump
  // carries pre-mutation server state — applying it would undo what the user
  // just saw happen, so it re-fetches instead.
  const epoch = useRef(0)
  // a lookup can transiently fail server-side — never replace known credits with n/a
  const mergeOverview = o => setOverview(prev => (o.credits ? o : { ...o, credits: prev?.credits ?? null }))

  const refreshSounds = async () => {
    const at = epoch.current
    const [s, o] = await Promise.all([api('/sounds'), api('/overview')])
    mergeOverview(o)
    if (epoch.current === at) setSounds(s)
    else return refreshSounds()
  }
  // polls replace the job list wholesale — keep optimistic tmp jobs alive
  const refreshJobs = async () => {
    const server = await api('/jobs')
    setJobs(prev => [...prev.filter(p => p.tmp), ...server])
  }

  /** Optimistic mutation: apply to local state now, run the request in the
   *  background, revert to the snapshot (with an error toast) if it fails. */
  const optimistic = (mutate, request, okMessage) => {
    const snap = soundsRef.current
    epoch.current++
    setSounds(prev => prev.map(mutate))
    return request()
      .then(result => {
        if (okMessage) toast(okMessage)
        refreshSounds().catch(() => {}) // true-up with the server in the background
        return result
      })
      .catch(err => {
        epoch.current++
        setSounds(snap)
        refreshSounds().catch(() => {}) // the server is the truth after a failure
        toast(err.message, true)
        throw err
      })
  }

  const chooseTake = (soundId, file) =>
    optimistic(
      s =>
        s.id !== soundId
          ? s
          : {
              ...s,
              live: {
                url: `/files/live/${s.id}.mp3`,
                mtime: new Date().toISOString(),
                size: s.candidates.find(c => c.file === file)?.size ?? 0
              },
              candidates: s.candidates.map(c => ({ ...c, current: c.file === file }))
            },
      () => post(`/sounds/${soundId}/choose`, { file }),
      'made live'
    ).catch(() => {})

  const deleteTakes = (soundId, files) =>
    optimistic(
      s => (s.id !== soundId ? s : { ...s, candidates: s.candidates.filter(c => !files.includes(c.file)) }),
      () => post(`/sounds/${soundId}/candidates/delete`, { files }),
      `${files.length} take(s) moved to trash`
    ).catch(() => {})

  const saveSound = (sound, { prompt, params }) =>
    optimistic(
      s => (s.id !== sound.id ? s : { ...s, prompt, params }),
      () => put(`/sounds/${sound.id}`, { prompt, params }),
      'saved'
    )

  useEffect(() => {
    Promise.all([refreshSounds(), refreshJobs()]).catch(err => toast(err.message, true))
  }, [])

  useEffect(() => writeFiltersToUrl(filters), [filters])

  // poll while anything is queued or running
  const anyActive = jobs.some(isActive)
  useEffect(() => {
    if (!anyActive) return
    const iv = setInterval(async () => {
      try {
        const [j, o] = await Promise.all([api('/jobs'), api('/overview')])
        setJobs(prev => [...prev.filter(p => p.tmp), ...j])
        mergeOverview(o)
      } catch {}
    }, 1500)
    return () => clearInterval(iv)
  }, [anyActive])

  // when a job completes, new takes exist on disk — refetch the registry.
  const completedCount = jobs.filter(j => j.status === 'completed').length
  const prevCompleted = useRef(-1)
  useEffect(() => {
    if (prevCompleted.current !== -1 && completedCount !== prevCompleted.current) {
      refreshSounds().catch(() => {})
    }
    prevCompleted.current = completedCount
  }, [completedCount])

  // Jobs whose placeholder we're responsible for: everything seen active this
  // session. A completed job stays "pending" until its take shows up in the
  // registry, so the placeholder is swapped for the real row in one render —
  // no flash of neither. Pruned once the take lands (or the job fails), which
  // also keeps stale completed jobs from ever resurrecting a placeholder.
  const watched = useRef(new Set())
  useEffect(() => {
    for (const j of jobs) {
      if (isActive(j)) watched.current.add(j.id)
      else if (j.status === 'completed') {
        const s = sounds.find(x => x.id === j.soundId)
        if (s?.candidates.some(c => c.file === j.resultFile)) watched.current.delete(j.id)
      } else watched.current.delete(j.id)
    }
  }, [jobs, sounds])

  const pendingFor = sound =>
    jobs.filter(
      j =>
        j.soundId === sound.id &&
        watched.current.has(j.id) &&
        (isActive(j) || (j.status === 'completed' && !sound.candidates.some(c => c.file === j.resultFile)))
    )

  // Optimistic: placeholder jobs appear on click, swapped for the server's real
  // jobs when the enqueue returns, removed (with the error) if it fails.
  // `gate` is an optional promise (the prompt save) that must land before the
  // enqueue — the placeholders don't wait for it, only the request does.
  const generateSounds = async (ids, count, gate) => {
    const tmps = ids.flatMap(id => {
      const s = soundsRef.current.find(x => x.id === id)
      return Array.from({ length: count }, () => ({
        id: `tmp-${crypto.randomUUID().slice(0, 8)}`,
        tmp: true,
        soundId: id,
        title: s?.title ?? id,
        kind: s?.kind,
        status: 'queued',
        createdAt: new Date().toISOString()
      }))
    })
    for (const t of tmps) watched.current.add(t.id)
    setJobs(prev => [...tmps, ...prev])
    setJobsVisible(true)
    try {
      if (gate) await gate
      const created = await post('/generate', { ids, count })
      for (const j of created) watched.current.add(j.id)
      setJobs(prev => [
        ...created.filter(c => !prev.some(p => p.id === c.id)),
        ...prev.filter(p => !tmps.some(t => t.id === p.id))
      ])
      toast(`${created.length} job(s) queued`)
    } catch (err) {
      setJobs(prev => prev.filter(p => !tmps.some(t => t.id === p.id)))
      toast(err.message, true)
    } finally {
      for (const t of tmps) watched.current.delete(t.id)
    }
  }

  const creditsLabel = overview?.credits
    ? `${(overview.credits.limit - overview.credits.used).toLocaleString()} credits left`
    : 'credits: n/a'
  const activeCount = jobs.filter(isActive).length

  const toggleOpen = id =>
    setOpen(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const checkRow = (id, isChecked) =>
    setChecked(prev => {
      const next = new Set(prev)
      isChecked ? next.add(id) : next.delete(id)
      return next
    })

  const shownCategories = CATEGORIES.map(([key, label]) => ({
    key,
    label,
    sounds: sounds.filter(s => s.category === key && matchesFilters(s, filters))
  })).filter(c => c.sounds.length)

  return (
    <>
      <header>
        <h1>Independence · Sound Admin</h1>
        <span className="stat">
          <b>{overview?.live ?? 0}</b>/{overview?.total ?? 0} live
        </span>
        <span className="stat">
          <b>{overview?.withCandidates ?? 0}</b> with takes
        </span>
        <span className="stat">{creditsLabel}</span>
        <span className="spacer" />
        <button disabled={!checked.size} onClick={() => generateSounds([...checked], 1)}>
          Generate selected ({checked.size})
        </button>
        <button
          onClick={() => {
            const ids = sounds.filter(s => !s.candidates.length).map(s => s.id)
            if (!ids.length) return toast('nothing missing — every sound has at least one take')
            generateSounds(ids, 1)
          }}
        >
          Generate all missing
        </button>
        <button onClick={() => setJobsVisible(v => !v)}>Jobs ({activeCount} active)</button>
      </header>
      <div className="filterbar">
        <button
          className={`chip ${filters.cat === 'all' ? 'active' : ''}`}
          onClick={() => setFilters(f => ({ ...f, cat: 'all' }))}
        >
          All
        </button>
        {CATEGORIES.map(([key, label]) => (
          <button
            key={key}
            className={`chip ${filters.cat === key ? 'active' : ''}`}
            onClick={() => setFilters(f => ({ ...f, cat: key }))}
          >
            {label} ({sounds.filter(s => s.category === key).length})
          </button>
        ))}
        <span className="sep" />
        {STATUS_FILTERS.map(([key, label]) => (
          <button
            key={key}
            className={`chip ${filters.status === key ? 'active' : ''}`}
            onClick={() => setFilters(f => ({ ...f, status: key }))}
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          placeholder="Search…"
          value={filters.q}
          onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
        />
      </div>
      <main>
        {shownCategories.map(({ key, label, sounds: catSounds }) => (
          <React.Fragment key={key}>
            <h2 className="cat">{label}</h2>
            {catSounds.map(s => (
              <SoundRow
                key={s.id}
                sound={s}
                open={open.has(s.id)}
                checked={checked.has(s.id)}
                onToggleOpen={toggleOpen}
                onCheck={checkRow}
                pendingJobs={pendingFor(s)}
                candChecked={candChecked}
                setCandChecked={setCandChecked}
                onGenerate={generateSounds}
                onSave={saveSound}
                onChoose={chooseTake}
                onDelete={deleteTakes}
              />
            ))}
          </React.Fragment>
        ))}
        {!shownCategories.length && <div className="empty">Nothing matches the current filters.</div>}
      </main>
      <JobsPanel jobs={jobs} visible={jobsVisible} onClose={() => setJobsVisible(false)} onJobsChanged={refreshJobs} />
      <Toasts />
    </>
  )
}
