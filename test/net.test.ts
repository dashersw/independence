// The network itself, before any game is involved: does it actually learn?
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Net, evaluate } from '../src/ai/net'

describe('the value network', () => {
  test('is deterministic from its seed', () => {
    const a = new Net([3, 4, 1], 42).toJSON()
    const b = new Net([3, 4, 1], 42).toJSON()
    const c = new Net([3, 4, 1], 43).toJSON()
    assert.deepEqual(a.weights, b.weights, 'same seed, same net')
    assert.notDeepEqual(a.weights, c.weights, 'different seed, different net')
  })

  test('starts with sane weights and no bias', () => {
    const net = new Net([8, 6, 1], 7)
    assert.deepEqual(net.sizes, [8, 6, 1])
    assert.equal(net.weights.length, 2)
    assert.equal(net.weights[0].length, 6)
    assert.equal(net.weights[0][0].length, 8)
    assert.ok(net.biases.every((layer) => layer.every((b) => b === 0)))
    assert.ok(net.weights.flat(2).every((w) => Number.isFinite(w) && Math.abs(w) < 2))
  })

  test('its output stays in range whatever it is fed', () => {
    const net = new Net([4, 8, 1], 3)
    for (const input of [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [-50, 50, -50, 50],
      [1e6, -1e6, 0, 0],
    ]) {
      const v = net.run(input)
      assert.ok(Number.isFinite(v), `finite for ${input}`)
      assert.ok(v >= -1 && v <= 1, `in range for ${input}`)
    }
  })

  test('learns XOR — a problem no linear model can fit', () => {
    const net = new Net([2, 8, 8, 1], 5)
    const data: [number[], number][] = [
      [[0, 0], -1],
      [[0, 1], 1],
      [[1, 0], 1],
      [[1, 1], -1],
    ]
    for (let epoch = 0; epoch < 4000; epoch++) for (const [input, target] of data) net.train(input, target, 0.05)
    for (const [input, target] of data) {
      const out = net.run(input)
      assert.ok(out * target > 0, `${input} should sign-match ${target}, got ${out.toFixed(3)}`)
    }
  })

  test('error falls as it trains', () => {
    const net = new Net([3, 6, 1], 11)
    const input = [0.2, -0.4, 0.9]
    const first = net.train(input, 0.8, 0.05)
    let last = first
    for (let i = 0; i < 200; i++) last = net.train(input, 0.8, 0.05)
    assert.ok(last < first, `error ${last} should be under the first ${first}`)
    assert.ok(Math.abs(net.run(input) - 0.8) < 0.05, 'and it lands on the target')
  })

  test('survives a round trip through JSON', () => {
    const net = new Net([5, 7, 1], 9)
    for (let i = 0; i < 50; i++) net.train([0.1, 0.2, 0.3, 0.4, 0.5], 0.6, 0.05)
    const input = [0.3, 0.1, 0.4, 0.1, 0.5]
    const before = net.run(input)
    const after = Net.fromJSON(JSON.parse(JSON.stringify(net.toJSON()))).run(input)
    assert.equal(after, before)
  })

  test('the browser-side reader agrees with the trainer, exactly', () => {
    const net = new Net([6, 10, 6, 1], 13)
    for (let i = 0; i < 100; i++) net.train([1, 0, 1, 0, 1, 0], -0.4, 0.05)
    const json = JSON.parse(JSON.stringify(net.toJSON()))
    for (const input of [
      [1, 0, 1, 0, 1, 0],
      [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      [0, 0, 0, 0, 0, 0],
    ])
      assert.equal(evaluate(json, input), net.run(input), `same value for ${input}`)
  })
})

describe('batched scoring matches one-at-a-time scoring', () => {
  const net = new Net([12, 20, 10, 1], 99)
  const inputs = Array.from({ length: 37 }, (_, k) => Array.from({ length: 12 }, (_, i) => Math.sin(i * 1.7 + k)))

  test('every batched value equals its run() value to the bit', () => {
    const one = inputs.map((x) => net.run(x))
    const many = net.runBatch(inputs)
    assert.equal(many.length, inputs.length)
    for (let i = 0; i < inputs.length; i++) assert.equal(many[i], one[i], `candidate ${i}`)
  })

  test('a batch of one is just run', () => {
    assert.deepEqual(net.runBatch([inputs[0]]), [net.run(inputs[0])])
  })

  test('an empty batch is empty', () => {
    assert.deepEqual(net.runBatch([]), [])
  })

  test('the scratch grows to the largest batch and is reused', () => {
    const big = net.runBatch(inputs)
    const small = net.runBatch(inputs.slice(0, 3))
    // reusing wider scratch must not leak stale rows into a smaller batch
    for (let i = 0; i < 3; i++) assert.equal(small[i], big[i])
  })

  test('it holds for a net the shape training actually uses', () => {
    const real = new Net([51, 40, 24, 1], 7)
    const xs = Array.from({ length: 30 }, (_, k) => Array.from({ length: 51 }, (_, i) => Math.cos(i + k)))
    const one = xs.map((x) => real.run(x))
    const many = real.runBatch(xs)
    for (let i = 0; i < xs.length; i++) assert.equal(many[i], one[i])
  })
})
