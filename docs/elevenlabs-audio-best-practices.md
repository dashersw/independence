# ElevenLabs Audio Generation — Best Practices

Working notes for generating the game's sound effects and ending jingles, distilled
from the ElevenLabs docs (July 2026). Two separate APIs matter to us: **Sound
Effects** for the short gameplay SFX and card stingers, and **Music** for the 5–6s
ending jingles (and the optional menu ambient).

Auth for both: `xi-api-key: $ELEVENLABS_API_KEY` header.

---

## 1. Sound Effects API

**Endpoint:** `POST https://api.elevenlabs.io/v1/sound-generation`

| Parameter | Type | Notes |
|-----------|------|-------|
| `text` | string | The prompt (see prompting section below) |
| `duration_seconds` | float, optional | 0.5–30s (verified: 0.2 → HTTP 400 `invalid_generation_settings`). Omit to let the model pick a natural length |
| `prompt_influence` | float, optional | High = literal adherence to the prompt, low = creative variation |
| `loop` | bool, optional | Seamless looping for ambiences (MP3 only) |

- **Output:** MP3 (44.1 kHz) for everything; WAV at 48 kHz available for
  non-looping effects.
- **Cost:** 40 credits per second when `duration_seconds` is given; auto-length
  prompts are billed by resulting length.
- **Max 30 seconds** per generation — use `loop` for longer atmospheres instead of
  chasing length.

### Prompting sound effects

- **Simple effects — simple prompts:** "Glass shattering on concrete." State the
  source and the surface/space; don't over-write.
- **Sequential sounds work:** "Footsteps on gravel, then a metallic door opens."
  Good for our compound cues (telegraph clatter *then* paper unfurl).
- **Use audio-industry terminology** — the model knows it: *braam* (big cinematic
  brass hit), *whoosh*, *impact*, *drone*, *ambience*, *one-shot*, *stem*, *glitch*.
  "Cinematic braam, horror" is a canonical example.
- **Musical elements are allowed** in SFX: "90s hip-hop drum loop, 90 BPM". Useful
  for our davul-based stingers without invoking the full Music API.
- **Mood adjectives carry weight:** pairing the effect with a tone word ("somber",
  "triumphant", "urgent") steers the render meaningfully.
- Set `duration_seconds` explicitly for UI sounds (we need tight, consistent
  lengths); leave it unset for organic one-shots where natural decay matters.
- Generate **2–4 candidates per effect** and cherry-pick; variation between runs is
  significant at low `prompt_influence`.

---

## 2. Music API

**Endpoint:** `POST https://api.elevenlabs.io/v1/music`

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `prompt` | string | — | Text prompt. Mutually exclusive with `composition_plan` |
| `composition_plan` | object | — | Section-by-section plan (see below) |
| `music_length_ms` | int | auto | 3,000–600,000 ms. Only valid with `prompt` |
| `model_id` | string | `music_v1` | Use **`music_v2`** — better prompt adherence, required for chunk-based plans |
| `force_instrumental` | bool | false | Set **true** for all our jingles (no vocals) |
| `output_format` | string | auto | v2 auto = `mp3_48000_192`; PCM/Opus variants available |
| `seed` | int | — | Reproducibility; cannot combine with `prompt` |

- **Duration:** 3 seconds minimum — our 5–6s jingles are in range.
- Response is the binary audio file directly.

### Prompting music

- **Purpose beats precision.** The model responds well to use-case framing
  ("victory jingle for a historical strategy game") rather than exhaustive musical
  description. Prompt length does **not** correlate with quality.
- **Simple, evocative keywords** often out-perform detailed musical language; save
  detail for when you need precision.
- **Genre/mood direction:** abstract descriptors ("eerie", "foreboding",
  "triumphant") and concrete ones ("dissonant violin over pulsing sub-bass") both
  work — pick one register and don't mix ten of them.
- **Tempo and key are respected:** "130 BPM", "in A minor" — the model follows BPM
  accurately and usually lands the key. Give both when jingles must feel related
  (our graded ending families share key/tempo).
- **Isolation:** prefix "solo" to an instrument ("solo ney") to keep it exposed;
  "a cappella" isolates vocals.
- **Say "instrumental only"** in the prompt *and* set `force_instrumental: true`.
- **Timing cues work in prose:** "ends on a resolved major cadence",
  "lyrics begin at 15 seconds" — usable for shaping a 6-second arc
  ("swells for 4 seconds, resolves and decays by 6").
- Expressive texture adjectives are understood: "raw", "live", "breathy",
  "aggressive".

### Composition plans (fine control)

For jingles that must hit a structure ("2s davul buildup → 3s brass peak → 1s
decay"), skip the free prompt and send a plan. **Requires `music_v2`.**

```json
{
  "chunks": [
    {
      "text": "[Buildup]",
      "duration_ms": 3000,
      "positive_styles": ["davul drums", "rising tension", "in D minor", "cinematic"],
      "negative_styles": ["vocals", "electronic"],
      "context_adherence": "high"
    },
    {
      "text": "[Resolution]",
      "duration_ms": 3000,
      "positive_styles": ["triumphant brass fanfare", "zurna", "resolved major cadence"],
      "negative_styles": ["vocals"],
      "context_adherence": "high"
    }
  ]
}
```

- Up to 30 chunks; each chunk 3–120s; total 3s–10min. **A chunk's floor is 3s**,
  so a 5–6s jingle is at most a two-chunk plan.
- **The first chunk sets the tone and genre for the whole piece** — front-load the
  defining styles there.
- `positive_styles` / `negative_styles`: up to 50 entries each; styles must be in
  English.
- Section labels go in `text` as `[Name]`; `{curly braces}` for performance cues,
  parentheses for phonetic sounds.
- You can have the API draft a plan from a prompt first
  (`music.composition_plan.create`), tweak it, then compose from it — good
  workflow for iterating on one section without re-rolling the whole jingle.

---

## 3. Project conventions (ours, not ElevenLabs')

- All generated candidates land in `sounds/candidates/<name>-<n>.mp3`; the chosen
  take is copied to `src/assets/sounds/<name>.mp3`.
- Keep a `sounds/prompts.json` recording the exact prompt/plan, endpoint,
  parameters, and seed (music) that produced each shipped file, so any sound can
  be regenerated or iterated later.
- SFX: request WAV 48 kHz where offered, transcode/normalize ourselves; UI sounds
  get explicit `duration_seconds`, organic one-shots don't.
- Jingle families (victory tiers E1–E3, Lausanne tiers E4–E6) share key and tempo
  across the family so the grading is audible: same musical DNA, more/fewer forces.
- Loudness-normalize everything to a common target before shipping; rapid-fire
  gameplay sounds (dice, reinforce) sit several dB below the stingers.

## Sources

- https://elevenlabs.io/docs/overview/capabilities/sound-effects.md
- https://elevenlabs.io/docs/overview/capabilities/music.md
- https://elevenlabs.io/docs/overview/capabilities/music/best-practices
- https://elevenlabs.io/docs/api-reference/music/compose
- https://elevenlabs.io/docs/eleven-api/guides/how-to/music/composition-plans
- https://elevenlabs.io/docs/eleven-api/guides/cookbooks/sound-effects.md
