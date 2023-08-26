# Training the faction AI

How the seven faction networks are trained, evaluated, and shipped — the
architecture, the reward design, the campaign mechanics that shape play, the
paths we tried and why, and the levers left for getting better results.

## The goal, stated plainly

A human playing Turkey beats the AI. That is the whole reason this pipeline
exists: we want **strong AI invaders** (the six occupiers) so a human game is
hard. Turkey-side strength matters too, but mostly as a means — a stronger
Turkey in self-play is a harder sparring partner, and that is the mechanism that
makes the occupiers better (see [Key insight](#key-insight)).

So when you read the eval numbers below, the headline metric is **how small the
invaders leave Turkey against a competent Turkey**, not whether the AI-Turkey
wins.

## Architecture

- **Seven value networks, one per faction** (`src/ai/net.ts`), shape
  `[INPUT_SIZE, 40, 24, 1]` — tiny on purpose; it ships in the web bundle. Each
  faction is a different player because each has its own reward function, not
  because the code branches on faction.
- **Scores `(position, move)` pairs, not a fixed action list.** A single turn
  offers hundreds of from→to pairs; one output per action would be mostly dead
  weights. `end` (stop) is always one of the moves, so a faction can learn that
  doing nothing beats every attack on offer. Features live in `src/ai/features.ts`.
- **Policy** (`src/ai/policy.ts`): epsilon-greedy over the value net, with a
  two-ply look-ahead and an optional **turn-level plan search** — it searches
  (reinforcement allocation × attack "axis" = which front to commit to), rolls
  each candidate forward deterministically, and scores the resulting position by
  the net's value of the `end` move. The same `ScoreMany` closure drives both
  the shipped JSON and the live training net, so search behaves identically in
  training and in play.
- **Reward** = the turn's own shaping **plus** the end-of-war terminal
  discounted back over the turns that led there (`DISCOUNT = 0.94`, applied per
  *turn*, not per decision — see the credit-assignment note in
  `scripts/train-worker.ts`).
- **Training loop** (`scripts/train-ai.ts` + `scripts/train-worker.ts`):
  self-play across worker processes; each round every worker plays its share,
  trains on a prioritised replay buffer, and hands weights back; the parent
  **averages the weights** (local SGD) and deals them out again. A **league** of
  past selves is mixed in so the seven don't co-evolve into a closed loop. A
  fraction of games are **anchored to a scripted aggressor** (below).

## The reward functions — where behaviour comes from

All in `src/ai/rewards/` (`objectives.ts`, `shaping.ts`, `terminal.ts`,
`metrics.ts`).

- **`AIMS` / `ULTIMATE` / `HOME`** (`objectives.ts`) define, per faction, the war
  it was sent to fight, the maximalist version of it, and the country it came
  from. Britain garrisons the Straits, Italy fought nobody, Bulgaria's quarrel is
  with Greece — none of that is hand-coded logic; it's the shape of these lists
  plus the reward weights.
- **Per-turn shaping** (`shaping.ts`): small numbers, so nothing learns to farm
  shaping instead of winning. Each occupier is paid for its own aim, penalised
  for casualties/wandering, and — crucially — **every occupier is paid a
  `COALITION_RATE` for each Pact province prised off Turkey**. That is the
  designed 6-on-1 dogpile.
- **Terminal** (`terminal.ts`):
  - **Occupiers** are scored on how much of their aim they held (and for how
    long), how small they left Turkey (`COALITION_BONUS = 0.6`), and whether they
    reached their maximum. None has to be *the* winner — a war that ends with
    Ankara holding eight provinces is a good war for all of them.
  - **Turkey** is scored on the ending it reached. This used to be a **flat
    staircase** — every outcome holding 0–14 of 30 Pact provinces scored an
    identical −0.5, which is exactly the band a losing Turkey lives in, so there
    was no gradient to climb. It is now a **continuous ramp**
    (`turkeyHeldReward`) pinned to the ladder's own thresholds (+0.1 at 15 held,
    +0.5 at 27): every province defended pays. This single change is the biggest
    lever we found on Turkey's strength — see the results log.
  - **Greece** carries a special weight (`TERMINAL_WEIGHT`): home defence
    (Macedonia) is worth ~3× its Anatolian aim, because Bulgaria's whole war aim
    names those same provinces and otherwise Greece sells Macedonia to buy Smyrna.

## Campaign mechanics that shape play

The neural nets choose moves, but the campaign engine
(`src/game/campaign-events.json` + `campaign-runtime.ts`) decides who *may*
attack whom and when factions settle. Two behaviours matter for training and for
play:

- **Settling out of the war.** Treaties/withdrawals set a faction *passive/at
  peace* (`faction.peaceStatus` rules): Italy evacuates, France signs the Ankara
  Agreement and pulls back to Aleppo, Armenia signs at Alexandropol/Gümrü,
  Britain stands down, Greece collapses. Passive ≠ eliminated — they keep their
  ground and stop attacking.
- **Breaking the peace is a tripwire.** Attacking a settled faction sets its
  `peaceBroken` flag, which voids the peace (every peace-status rule requires
  `peaceBroken: false`). For **Armenia specifically**, a Turkey attack after
  Alexandropol also **remobilises +20 troops** (`rule.alexandropol-breach`). So
  don't poke a settled faction unless you can finish it.
- **Peace is reciprocal (fixed 2026-07-25).** `peaceBroken` is one global flag,
  and it used to fall back to the blanket occupier→Turkey permission once set —
  so a third party (Britain) breaking France's peace dragged France back onto
  Turkey. `mayAttack` now gates a settled faction (`hasSettled`) to **only its
  grudges** — the factions that actually attacked it — so a broken peace with one
  party never reopens the war with the country it settled with.

## Training

```sh
# fresh run from the shipped models, plan search on, scripted anchor at 0.65
npm run train-ai -- --games 400000 --plan --script 0.65 --workers 14 \
    --from src/ai/models --out src/ai/models-peacefix --resume
```

Flags:

| flag | meaning |
|---|---|
| `--games N` | total self-play games (rounds are derived: ~`N / (workers·150)`) |
| `--workers K` | worker processes (default `cores − 4`) |
| `--plan` | play exploit turns with turn-level plan search (expert iteration) |
| `--scripted-opponents` | anchor 50% of games to the scripted aggressor |
| `--script <r>` | set the anchor rate explicitly (e.g. `0.65`) — overrides the above |
| `--from <dir>` | initial weights (with `--resume`) |
| `--out <dir>` | where to write (keep it out of `src/ai/models` until promoted) |
| `--resume` | warm-start from `--from` instead of random init |
| `--league <r>` | fraction of games played as an older self (default 0.3) |
| `--td <r>` | TD-blend (default 0 — on, it drags everything to zero here) |
| `--twoply <0/1>` | two-ply look-ahead (default on) |
| `--profile` | per-game timing breakdown |

Key config (`HYPER` / constants in `train-ai.ts`): exploration anneals
`0.6 → 0.06` across the run; `DISCOUNT 0.94`; `LEARNING_RATE 0.02`; plan budget
`{mass:2, axes:2, rolloutCap:10}` (smaller than eval's, because it runs every
exploit turn).

**Scripted anchoring** (`--scripted-opponents` / `--script`): a fraction of
games pin one side to a fixed hand-written aggressor (`src/ai/scripted.ts`).
Half of those script Turkey (occupiers learn to beat a good Turkey), half script
the occupiers (Turkey learns to beat good occupiers). This is what stops the nets
overfitting to their own weak selves.

**Continuation pattern.** To add games on top of a run, point `--from` at the
previous output and `--out` at a new dir. Exploration re-anneals from 0.6, which
shakes the policy up and lets it reconverge.

**Checkpointing.** Weights are written to `--out` every round, so a killed run
leaves the latest merged models behind — nothing is lost.

**Runtime.** With plan search, expect ~15–20 games/s across 14 workers; a 400k
run is ~6 hours. The bottleneck is the simulation, not the matrix maths, so more
cores help almost linearly.

## Evaluation

**Always use `eval-parallel`, not `eval-ai` directly, for plan-mode eval.**
`eval-ai` is single-threaded and plan-mode self-play runs at ~0.07 games/s — a
2000-game eval is ~8 hours. `eval-parallel` shards it across cores (`eval-ai
--json` emits raw counts it aggregates), ~12× faster.

```sh
# occupier strength: Turkey played by the scripted aggressor (a human proxy)
npm run eval-parallel -- --games 300 --shards 8 --plan --scripted --models src/ai/models-peacefix

# self-play: every seat driven by its net (measures AI-Turkey too)
npm run eval-parallel -- --games 300 --shards 8 --plan --models src/ai/models-peacefix
```

Reading the scorecard:

- **`--scripted` "Turkey Pact held" is the invader-strength metric — LOWER is
  better.** Turkey is fixed at a competent baseline, so a smaller number means
  the invaders squeezed harder. `their terms` % (invaders crushed Turkey) and
  `near miss` % (invaders nearly failed) are the supporting signals.
- **`--plan` (self-play) "Turkey Pact held" measures AI-Turkey.** Higher = a
  stronger solo opponent. Useful, but not the ship metric.
- The scripted Turkey is a *proxy* and weaker than a real human, so the real
  final check is a human playtest against the shipped occupiers.

## Promotion & release

The game imports `src/ai/models/` directly, so promoting = copying an experiment
dir over it:

```sh
cp src/ai/models-peacefix/*.json src/ai/models/
git add src/ai/models/*.json && git commit -m "Ship <run> models" && git push
```

The `.husky/pre-push` hook runs `format:check && lint && typecheck` and blocks
the push if any fail. Experiment dirs (`src/ai/models-*`) are gitignored and
prettier-ignored — they never need cleaning up before a commit, and can be
deleted freely.

## The paths we took, and why

Each of these was a real experiment dir; only the last was shipped.

1. **Un-anchored plan retrain (`models-plan`).** Plan search in the loop, pure
   self-play. Turkey **collapsed to −0.49** — with no strong opponent to learn
   against, the whole set went passive and the occupiers overfit to a limp
   Turkey. Lesson: self-play alone isn't enough here.
2. **Scripted anchor, 20k (`models-anchored`).** Adding the scripted aggressor
   stopped the collapse, but the first eval looked like a *regression* — until we
   realised we were measuring against the **weak net-Turkey**, where "stronger
   occupiers" reads as "Turkey collapsing." Measured against the scripted Turkey,
   the occupiers had actually improved. Lesson: pick the right yardstick — hold
   Turkey fixed to measure the invaders.
3. **Turkey continuous-terminal fix, 20k (`models-turkfix`).** Replacing the flat
   −0.5 dead-zone with a ramp. Net-Turkey jumped **10.7 → 13.5** Pact held. But
   the occupiers dipped slightly against the scripted Turkey — a short-run
   transient from chasing a moving target with too few games.
4. **200k + anchor 0.65 (`models-200k`).** Enough games for both sides to
   co-improve. Invaders held Turkey to **18.0** (from 20.0). Both goals met;
   shipped at the time.
5. **400k continuation (`models-400k`).** Marginal: invaders 17.5. Diminishing
   returns — the training curve had already flattened. Kept for the small
   invader gain.
6. **Reciprocal-peace fix + 400k (`models-peacefix`).** The peace bug fix, then a
   full retrain. **Strongest invaders yet:** 16.9 vs scripted Turkey, 12.9 in
   self-play. Shipped.

### Results log (300-game plan evals, lower = stronger invaders)

| models | vs scripted Turkey (held / 30) | self-play (Turkey held / 30) |
|---|---|---|
| baseline (pre-work) | 20.0 | 10.7 |
| `models-anchored` (20k) | 19.3 | 9.6 |
| `models-turkfix` (20k) | 20.5 | 13.5 |
| `models-200k` | 18.0 | 14.4 |
| `models-400k` | 17.5 | 13.5 |
| **`models-peacefix` (shipped)** | **16.9** | 12.9 |

## How to get better results

Game count is no longer the lever — the curve is flat. What's left:

- **Attack-play / value calibration.** The invaders still can't *finish* a
  defended Turkey (it holds ~13–17 provinces even losing). This is an
  attack-search and value-estimation gap, not a games gap — the highest-value
  lever.
- **A stronger scripted anchor.** The occupiers are only as good as the toughest
  Turkey they train against; the current hand-written aggressor caps their
  ceiling. A stronger scripted Turkey raises it.
- **A bigger network.** `[INPUT, 40, 24, 1]` is small; more capacity may be
  needed to represent sharper play. Watch the bundle-size trade-off.
- **Anchor rate and league.** Higher `--script` gives more reps against strong
  fixed play; the league width affects how much the set generalises.
- **Reward shaping.** The terminal ramp fixed Turkey's dead-zone; similar
  gradient audits on the occupier rewards may find more.
- **Human playtest.** The scripted proxy isn't a human — the real signal is
  playing a few games against the shipped occupiers and watching where they make
  mistakes.

## Key insight

**A stronger Turkey makes stronger invaders.** In self-play the occupiers only
get as good as the toughest Turkey they face, so fixing Turkey's reward (the
continuous terminal) lifted the whole league, not just Turkey. And **peace is
reciprocal** — a faction that settled with Turkey must not be dragged back into
the war because a third party attacked it. Both of those are as much about the
*rules and rewards* as about the training; the network only ever learns what the
reward and the legality checks let it.
