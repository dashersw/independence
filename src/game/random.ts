export interface RandomSource {
  next(): number
  snapshot?(): unknown
  restore?(snapshot: unknown): void
}

/** Uses the current global source so tests and embedding hosts can replace it deliberately. */
export class SystemRandom implements RandomSource {
  next() {
    return Math.random()
  }
}

export class SeededRandom implements RandomSource {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0
    return this.state / 0x100000000
  }

  snapshot() {
    return this.state
  }

  restore(snapshot: unknown) {
    if (typeof snapshot !== 'number' || !Number.isInteger(snapshot)) throw new Error('Invalid random source snapshot')
    this.state = snapshot >>> 0
  }
}
