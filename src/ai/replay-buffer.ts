/** Fixed-capacity replay storage with O(1) insertion and uniform sampling. */
export class ReplayBuffer<T> {
  readonly #values: T[] = []
  #next = 0

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('Replay buffer capacity must be positive')
  }

  get length() {
    return this.#values.length
  }

  add(value: T) {
    if (this.#values.length < this.capacity) {
      this.#values.push(value)
      return
    }
    this.#values[this.#next] = value
    this.#next = (this.#next + 1) % this.capacity
  }

  sample(random: () => number): T | undefined {
    if (!this.#values.length) return undefined
    const index = Math.min(this.#values.length - 1, Math.floor(random() * this.#values.length))
    return this.#values[index]
  }

  /** A copy for diagnostics and focused tests; training never walks the buffer. */
  values() {
    return [...this.#values]
  }
}
