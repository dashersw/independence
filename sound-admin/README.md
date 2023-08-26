# Independence Sound Admin

File-based admin tool for the game's generated audio, modeled on lalecg's art-admin:
the sound registry (every effect the game needs, with its prompt and parameters),
ElevenLabs generation one-by-one or in batch through a persistent job queue,
candidate audition in the browser, and one-click promotion to the live game assets.

No database. Everything is JSON + MP3 files on disk.

## Run

```bash
cd sound-admin
npm install
npm start        # http://localhost:4500
```

Requirements: Node 20+. Put your key in `sound-admin/.env`
(`ELEVENLABS_API_KEY=...`); the file is re-read on every job, so no restart is
needed.

## CLI (no server needed)

```bash
node server/generate.mjs battle-exchange conquest   # specific sounds
node server/generate.mjs --category endings         # one category
node server/generate.mjs --missing                  # everything without a take yet
node server/generate.mjs --all --count 3            # 3 takes of everything
```

## What it manages

| Thing | Where |
|---|---|
| Sound registry (prompts, params, chosen take) | `data/sounds.json` (tracked in git) |
| Generated takes ("candidates", never overwritten) | `<repo>/sounds/candidates/<id>/*.mp3` (gitignored) |
| Live files the game loads | `<repo>/src/assets/sounds/<id>.mp3` (tracked in git) |
| Job log | `data/jobs.json` (gitignored) |

Generation goes to ElevenLabs: `kind: "sfx"` sounds hit `/v1/sound-generation`
(duration, prompt influence, loop), `kind: "music"` sounds (the ending jingles)
hit `/v1/music` with `music_v2`, always instrumental. See
[docs/elevenlabs-audio-best-practices.md](../docs/elevenlabs-audio-best-practices.md)
for prompting guidance.

## HTTP API

All endpoints return `{ ok: true, data }` or `{ ok: false, error }`. Static:
`/files/candidates/*` → `sounds/candidates/*`, `/files/live/*` → `src/assets/sounds/*`.

- `GET /api/overview` — counts, remaining credits, queue state
- `GET /api/sounds` — registry with per-sound `candidates[]` and `live` file info
- `GET /api/sounds/:id`
- `PUT /api/sounds/:id` body `{ prompt?, params?, notes? }`
- `POST /api/generate` body `{ ids: [...], count?: 1-8, promptOverride? }` — enqueue jobs
  (prompt frozen at enqueue time)
- `POST /api/sounds/:id/choose` body `{ file }` — copy a candidate to the live file
- `GET /api/jobs` · `POST /api/jobs/:id/cancel` · `POST /api/jobs/:id/retry`

## Frontend

React SPA (source in `ui/`, built with Parcel into `public/`, which the server
serves — the built output is committed, so `npm start` alone is enough to use it).
Sounds grouped by category with filter chips (category / live-status / search,
persisted in the URL); click a row to edit the prompt/params, generate 1 or 3 takes
(the current box values are auto-saved first), audition candidates in the custom
player (total duration up front, click-to-seek, one-at-a-time playback), and make
one live. Pending generations show an animated placeholder row that swaps into the
real take when the job lands. Batch delete: selected / non-live / all — all deletes
are soft (moved to `sounds/candidates/.trash/`). The jobs overlay is a compact
2-row bar, expandable and drag-resizable.

After editing `ui/`:

```bash
npm run build     # one-off rebuild into public/
npm run watch     # rebuild on change while iterating
```
