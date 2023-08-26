// A small multilayer perceptron: enough to learn a position evaluation, small
// enough to ship in the bundle and read without a library.
//
// The architecture follows the value-network approach used in the lalecg
// trainer — score a state rather than classify an action, then let the player
// pick the move whose resulting position scores highest. That keeps the output
// a single number no matter how large the action space is, which matters here:
// a Risk turn has hundreds of from→to pairs, and a policy head over them would
// need one output per pair.
//
// Written out rather than pulled in because inference has to run in the browser
// on a phone, and the whole of it is forty lines.

export interface NetJSON {
  sizes: number[]
  weights: number[][][] // [layer][out][in]
  biases: number[][] // [layer][out]
}

const leaky = (x: number) => (x > 0 ? x : 0.01 * x)
const dLeaky = (x: number) => (x > 0 ? 1 : 0.01)
// the output is a value estimate, squashed so a runaway reward cannot blow the
// weights up; rewards are scaled into the same range before training
const squash = (x: number) => Math.tanh(x)
const dSquash = (y: number) => 1 - y * y

export class Net {
  sizes: number[]
  weights: number[][][]
  biases: number[][]

  constructor(sizes: number[], seed = 1) {
    this.sizes = sizes
    this.weights = []
    this.biases = []
    // deterministic init: a training run has to be reproducible from its seed
    let s = seed >>> 0
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
    for (let l = 1; l < sizes.length; l++) {
      const fanIn = sizes[l - 1]
      // He initialisation, which is what leaky ReLU wants
      const scale = Math.sqrt(2 / fanIn)
      this.weights.push(
        Array.from({ length: sizes[l] }, () => Array.from({ length: fanIn }, () => (rand() * 2 - 1) * scale))
      )
      this.biases.push(new Array(sizes[l]).fill(0))
    }
  }

  /** Forward pass, keeping every layer's activations for backprop. */
  private forward(input: number[]) {
    const acts: number[][] = [input]
    const raws: number[][] = []
    for (let l = 0; l < this.weights.length; l++) {
      const w = this.weights[l]
      const b = this.biases[l]
      const prev = acts[l]
      const raw = new Array(w.length)
      const out = new Array(w.length)
      const last = l === this.weights.length - 1
      for (let i = 0; i < w.length; i++) {
        const row = w[i]
        let sum = b[i]
        for (let j = 0; j < row.length; j++) sum += row[j] * prev[j]
        raw[i] = sum
        out[i] = last ? squash(sum) : leaky(sum)
      }
      raws.push(raw)
      acts.push(out)
    }
    return { acts, raws }
  }

  // scratch buffers for run(): scoring is the hot loop of both training and
  // play — thousands of calls a turn — and allocating two arrays per call was
  // costing more than the arithmetic
  private scratch: number[][] = []

  /** The value this net puts on a position. Allocation-free. */
  run(input: number[]): number {
    if (!this.scratch.length) this.scratch = this.sizes.slice(1).map(n => new Array(n).fill(0))
    let prev = input
    for (let l = 0; l < this.weights.length; l++) {
      const w = this.weights[l]
      const b = this.biases[l]
      const out = this.scratch[l]
      const last = l === this.weights.length - 1
      for (let i = 0; i < w.length; i++) {
        const row = w[i]
        let sum = b[i]
        for (let j = 0; j < row.length; j++) sum += row[j] * prev[j]
        out[i] = last ? Math.tanh(sum) : sum > 0 ? sum : 0.01 * sum
      }
      prev = out
    }
    return prev[0]
  }

  // scratch for runBatch: one activation buffer per candidate per layer, grown
  // to the widest batch seen and reused. A decision scores tens of candidates,
  // so the allocation would otherwise dwarf the arithmetic here too.
  private batchScratch: number[][][] = []

  /**
   * Score many positions at once. Identical arithmetic to calling run() on each
   * — same result to the last bit — but with the candidate loop INSIDE the
   * weight-row loop, so each weight row is read once and applied across the
   * whole batch while it is hot in cache rather than reloaded per candidate.
   * Measured at ~2x the sequential cost for a typical shortlist, which is most
   * of the forward-pass cost of a turn.
   */
  runBatch(inputs: number[][]): number[] {
    const n = inputs.length
    if (n === 0) return []
    if (n === 1) return [this.run(inputs[0])]
    if (this.batchScratch.length < n)
      for (let c = this.batchScratch.length; c < n; c++) this.batchScratch.push(this.sizes.slice(1).map(s => new Array(s)))

    let prev: number[][] = inputs
    for (let l = 0; l < this.weights.length; l++) {
      const w = this.weights[l]
      const b = this.biases[l]
      const last = l === this.weights.length - 1
      const out: number[][] = []
      for (let c = 0; c < n; c++) out.push(this.batchScratch[c][l])
      for (let i = 0; i < w.length; i++) {
        const row = w[i]
        const bi = b[i]
        const width = row.length
        for (let c = 0; c < n; c++) {
          const p = prev[c]
          let sum = bi
          for (let j = 0; j < width; j++) sum += row[j] * p[j]
          out[c][i] = last ? Math.tanh(sum) : sum > 0 ? sum : 0.01 * sum
        }
      }
      prev = out
    }
    const result = new Array(n)
    for (let c = 0; c < n; c++) result[c] = prev[c][0]
    return result
  }

  /** One SGD step towards `target`. Returns the squared error before it. */
  train(input: number[], target: number, rate: number): number {
    const { acts, raws } = this.forward(input)
    const L = this.weights.length
    const out = acts[L][0]
    const error = out - target

    // output layer: value head, one unit
    let delta: number[] = [error * dSquash(out)]
    for (let l = L - 1; l >= 0; l--) {
      const prev = acts[l]
      const w = this.weights[l]
      const b = this.biases[l]
      const next: number[] = l > 0 ? new Array(prev.length).fill(0) : []
      for (let i = 0; i < w.length; i++) {
        const d = delta[i]
        if (d === 0) continue
        const row = w[i]
        for (let j = 0; j < row.length; j++) {
          if (l > 0) next[j] += row[j] * d
          row[j] -= rate * d * prev[j]
        }
        b[i] -= rate * d
      }
      if (l > 0) for (let j = 0; j < next.length; j++) next[j] *= dLeaky(raws[l - 1][j])
      delta = next
    }
    return error * error
  }

  toJSON(): NetJSON {
    return { sizes: this.sizes, weights: this.weights, biases: this.biases }
  }

  static fromJSON(json: NetJSON): Net {
    const net = new Net(json.sizes)
    net.weights = json.weights
    net.biases = json.biases
    return net
  }
}

/**
 * Inference only, for the browser: the same forward pass without the training
 * scaffolding, taking the JSON straight as it was saved.
 */
const scratchFor = new WeakMap<NetJSON, number[][]>()

export const evaluate = (json: NetJSON, input: number[]): number => {
  let scratch = scratchFor.get(json)
  if (!scratch) {
    scratch = json.sizes.slice(1).map(n => new Array(n).fill(0))
    scratchFor.set(json, scratch)
  }
  let acts = input
  for (let l = 0; l < json.weights.length; l++) {
    const w = json.weights[l]
    const b = json.biases[l]
    const last = l === json.weights.length - 1
    const out = scratch[l]
    for (let i = 0; i < w.length; i++) {
      const row = w[i]
      let sum = b[i]
      for (let j = 0; j < row.length; j++) sum += row[j] * acts[j]
      out[i] = last ? Math.tanh(sum) : sum > 0 ? sum : 0.01 * sum
    }
    acts = out
  }
  return acts[0]
}

// Batched inference for the shipped models, the counterpart of Net.runBatch:
// score a whole shortlist off one pass over the weights. Bit-identical to
// calling evaluate() on each input. The scratch is keyed on the JSON and grown
// to the widest batch, so a turn's scoring allocates nothing after the first.
const batchScratchFor = new WeakMap<NetJSON, number[][][]>()

export const evaluateBatch = (json: NetJSON, inputs: number[][]): number[] => {
  const n = inputs.length
  if (n === 0) return []
  if (n === 1) return [evaluate(json, inputs[0])]
  let scratch = batchScratchFor.get(json)
  if (!scratch) {
    scratch = []
    batchScratchFor.set(json, scratch)
  }
  for (let c = scratch.length; c < n; c++) scratch.push(json.sizes.slice(1).map(s => new Array(s)))

  let prev: number[][] = inputs
  for (let l = 0; l < json.weights.length; l++) {
    const w = json.weights[l]
    const b = json.biases[l]
    const last = l === json.weights.length - 1
    const out: number[][] = []
    for (let c = 0; c < n; c++) out.push(scratch[c][l])
    for (let i = 0; i < w.length; i++) {
      const row = w[i]
      const bi = b[i]
      const width = row.length
      for (let c = 0; c < n; c++) {
        const p = prev[c]
        let sum = bi
        for (let j = 0; j < width; j++) sum += row[j] * p[j]
        out[c][i] = last ? Math.tanh(sum) : sum > 0 ? sum : 0.01 * sum
      }
    }
    prev = out
  }
  const result = new Array(n)
  for (let c = 0; c < n; c++) result[c] = prev[c][0]
  return result
}
