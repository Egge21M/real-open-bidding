import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alteredBid,
  authorize,
  ledger,
  paymentChecks,
  publisherChecks,
  refund,
  settle,
} from '../src/protocol/model'
import {
  CLOSE,
  DEFAULT_CONFIG,
  makeRequest,
  sha256,
  spendFor,
  START,
  taggedDigest,
  validUnicode,
} from '../src/protocol/fixtures'
import { SCENARIOS, simulate } from '../src/protocol/simulation'
import type { BidFault, Config, OracleFault } from '../src/protocol/types'

const end = (simulation: Awaited<ReturnType<typeof simulate>>) =>
  simulation.events.at(-1)!.state
const rejected = (checks: ReturnType<typeof authorize>) =>
  checks.some((c) => !c.pass)

describe('end-to-end protocol outcomes', () => {
  test('normal lifecycle: first-price settlement, fees, and independent refunds', async () => {
    const run = await simulate()
    const final = end(run)
    assert.equal(final.selected, 'A1')
    assert.equal(final.binding?.bidId, 'A1')
    assert.equal(final.bids.A1.funds, 'settled')
    assert.equal(final.bids.A2.funds, 'refunded')
    assert.equal(final.bids.B1.funds, 'refunded')
    assert.deepEqual(ledger(final, run.bids), {
      funded: 36,
      locked: 0,
      publisher: 11,
      fees: 1,
      refunded: 24,
    })
    const authorized = run.events.find((e) => e.state.binding)!
    assert.equal(authorized.state.publisherReceived, 0)
    assert.equal(authorized.state.bids.A1.funds, 'unspent')
    const signed = run.events.find((e) => e.state.publisherSigned)!
    assert.equal(signed.state.publisherReceived, 0)
    assert.equal(new Set(run.bids.map((b) => b.refundKey)).size, 3)
    assert.equal(
      new Set(run.bids.flatMap((b) => b.proofs.map((p) => p.secret))).size,
      7,
    )
  })

  test('ranking is local; the selected amount remains first-price', async () => {
    for (const policy of ['gross', 'creative'] as const) {
      const run = await simulate({ policy })
      assert.equal(end(run).selected, 'B1')
      assert.equal(end(run).publisherReceived, 10)
      assert.equal(end(run).mintFees, 4)
      assert.equal(end(run).refunded, 22)
    }
  })

  test('early selection can ignore a timely independently funded bid', async () => {
    const run = await simulate({ early: true })
    const selection = run.events.find((e) => e.stage === 'select')!
    assert.ok(selection.time < CLOSE)
    assert.equal(end(run).bids.A2.lifecycle, 'unused')
    assert.equal(end(run).bids.A2.funds, 'refunded')
    assert.ok(
      run.events.find((e) => e.title.includes('Timely but unused'))!.time <
        CLOSE,
    )
  })

  test('receipt exactly at closes_at is late, independent of event timestamps', async () => {
    const run = await simulate({ bidFault: 'late' })
    assert.equal(end(run).bids.A1.lifecycle, 'rejected')
    assert.match(end(run).bids.A1.reason, /Timely publisher receipt/)
    assert.equal(end(run).bids.A1.funds, 'refunded')
  })

  test('unverified oracle prevents all funding and submission', async () => {
    const run = await simulate({ trustedOracle: false })
    assert.equal(ledger(end(run), run.bids).funded, 0)
    assert.ok(!run.events.some((e) => e.stage === 'fund' || e.stage === 'bid'))
  })

  test('optional seller policy neither invalidates a request nor authenticates an oracle', async () => {
    const permissive = await simulate({
      sellerListed: false,
      requireSeller: false,
    })
    assert.equal(ledger(end(permissive), permissive.bids).funded, 36)
    const declined = await simulate({
      sellerListed: false,
      requireSeller: true,
    })
    assert.equal(end(declined).requestValid, true)
    assert.equal(ledger(end(declined), declined.bids).funded, 0)
    const untrusted = await simulate({
      sellerListed: true,
      requireSeller: true,
      trustedOracle: false,
    })
    assert.equal(ledger(end(untrusted), untrusted.bids).funded, 0)
  })

  for (const fault of ['domain', 'ip', 'user'] as const)
    test(`invalid public request: ${fault}`, async () => {
      const run = await simulate({ requestFault: fault })
      assert.equal(end(run).requestValid, false)
      assert.equal(ledger(end(run), run.bids).funded, 0)
    })

  test('a late callback permits a retry; an absent one never binds', async () => {
    const delayed = await simulate({ callback: 'after' })
    const denied = delayed.events.find(
      (e) => e.title === 'Authorization withheld',
    )!
    assert.equal(denied.state.binding, null)
    assert.equal(end(delayed).publisherReceived, 11)
    const absent = await simulate({
      callback: 'missing',
      repair: true,
      oracleFault: 'html',
    })
    assert.equal(end(absent).binding, null)
    assert.equal(end(absent).refunded, 36)
    assert.equal(end(absent).rendered, 'A1')
  })

  test('the POC can authorize a direct publisher callback without rendering', async () => {
    const run = await simulate({ callback: 'direct' })
    assert.equal(end(run).rendered, null)
    assert.equal(end(run).publisherReceived, 11)
  })

  for (const fault of [
    'mint',
    'unit',
    'amount',
    'size',
    'identity',
    'refund',
    'signer',
    'reuse',
  ] satisfies BidFault[])
    test(`publisher rejects ${fault} and considers other bids`, async () => {
      const run = await simulate({ bidFault: fault })
      assert.equal(end(run).bids.A1.lifecycle, 'rejected')
      assert.equal(end(run).selected, 'B1')
      assert.equal(end(run).bids.A1.funds, 'refunded')
    })

  for (const fault of [
    'html',
    'token',
    'size',
    'inputs',
    'pixel',
    'identity',
    'tag',
  ] satisfies OracleFault[])
    test(`oracle rejects ${fault}; original-evidence retry can repair it`, async () => {
      const bad = await simulate({ oracleFault: fault })
      assert.equal(end(bad).binding, null)
      assert.equal(end(bad).refunded, 36)
      const repaired = await simulate({ oracleFault: fault, repair: true })
      assert.equal(end(repaired).publisherReceived, 11)
    })

  test('refund wins the expiry race; authorization survives recovery', async () => {
    const run = await simulate({ mint: 'refund-first' })
    const final = end(run)
    assert.equal(final.bids.A1.funds, 'refunded')
    assert.equal(final.binding?.bidId, 'A1')
    assert.equal(final.publisherReceived, 0)
    assert.ok(
      run.events.some(
        (e) =>
          e.title === 'Settlement did not complete' &&
          e.checks.some((c) => c.label === 'Proofs still unspent' && !c.pass),
      ),
    )
    assert.ok(
      run.events.some(
        (e) =>
          e.title === 'Switching to another bid is forbidden' &&
          e.outcome === 'blocked',
      ),
    )
  })

  test('payment path remains valid after expiry; refund loses', async () => {
    const run = await simulate({ mint: 'publisher-first' })
    const settled = run.events.find((e) => e.title.startsWith('Mint settled'))!
    assert.ok(settled.time > run.bids[0].locktime)
    assert.equal(end(run).publisherReceived, 11)
    assert.equal(end(run).bids.A1.funds, 'settled')
    assert.ok(run.events.some((e) => e.title === 'Refund cannot complete · A1'))
  })

  test('mint outage leaves proofs unspent through expiry and refund failure', async () => {
    const run = await simulate({ mint: 'outage' })
    const failedRefund = run.events.find(
      (e) =>
        e.stage === 'refund' &&
        e.checks.some((c) => c.label === 'Mint available' && !c.pass),
    )!
    assert.equal(failedRefund.state.bids.A1.funds, 'unspent')
    assert.equal(failedRefund.state.binding?.bidId, 'A1')
    assert.equal(end(run).bids.A1.funds, 'refunded')
  })
})

describe('authorization and spend invariants', () => {
  test('initial transaction can reorder the committed proof set, but signatures bind its chosen order', async () => {
    const run = await simulate()
    const state = structuredClone(
      run.events.find((e) => e.state.callbacks.length > 0)!.state,
    )
    const bid = run.bids[0]
    const reordered = spendFor(bid)
    reordered.inputs.reverse()
    assert.equal(rejected(authorize(state, bid, bid, reordered)), false)
    state.publisherSigned = true
    assert.equal(rejected(settle(state, bid, spendFor(bid), true)), true)
    assert.equal(rejected(settle(state, bid, reordered, true)), false)
  })

  test('spent proofs cannot obtain a new authorization; old exact authorizations cannot spend twice', async () => {
    const run = await simulate()
    const state = structuredClone(end(run))
    const bid = run.bids[0]
    assert.equal(rejected(authorize(state, bid, bid, spendFor(bid))), false)
    assert.equal(rejected(settle(state, bid, spendFor(bid), true)), true)
    state.binding = null
    assert.equal(rejected(authorize(state, bid, bid, spendFor(bid))), true)
    assert.equal(state.binding, null)
  })
  test('callback alone, invalid requests, and exact retries do not create extra authorizations', async () => {
    const run = await simulate()
    const callback = run.events.find((e) => e.state.callbacks.length > 0)!
    assert.equal(callback.state.binding, null)
    const state = structuredClone(callback.state)
    const [a, b] = run.bids
    assert.equal(
      rejected(authorize(state, alteredBid(a, 'html'), a, spendFor(a))),
      true,
    )
    assert.equal(state.binding, null)
    assert.equal(rejected(authorize(state, a, a, spendFor(a))), false)
    const binding = structuredClone(state.binding)
    assert.equal(rejected(authorize(state, a, a, spendFor(a))), false)
    assert.deepEqual(state.binding, binding)
    state.callbacks.push(b.id)
    assert.equal(rejected(authorize(state, b, b, spendFor(b))), true)
    assert.deepEqual(state.binding, binding)
  })

  test('competing authorization requests bind at most one commitment in either order', async () => {
    const run = await simulate()
    for (const order of [
      [run.bids[0], run.bids[1]],
      [run.bids[1], run.bids[0]],
    ]) {
      const state = structuredClone(
        run.events.find((e) => e.stage === 'select')!.state,
      )
      state.callbacks = order.map((b) => b.id)
      const checks = order.map((b) => authorize(state, b, b, spendFor(b)))
      assert.equal(checks.filter((c) => !rejected(c)).length, 1)
      assert.equal(state.binding?.bidId, order[0].id)
    }
  })

  test('transaction input substitution, omission, duplication, and addition are rejected', async () => {
    const run = await simulate()
    const bid = run.bids[0]
    for (const mutation of ['substitute', 'omit', 'duplicate', 'add']) {
      const state = structuredClone(
        run.events.find((e) => e.state.callbacks.length > 0)!.state,
      )
      const spend = spendFor(bid)
      if (mutation === 'substitute')
        spend.inputs[0] = spendFor(run.bids[1]).inputs[0]
      if (mutation === 'omit') spend.inputs.pop()
      if (mutation === 'duplicate') spend.inputs[1] = spend.inputs[0]
      if (mutation === 'add') spend.inputs.push(spendFor(run.bids[1]).inputs[0])
      assert.equal(rejected(authorize(state, bid, bid, spend)), true)
      assert.equal(state.binding, null)
    }
  })

  test('SIG_ALL output changes invalidate a signed transaction; signatures do not consume proofs', async () => {
    const run = await simulate()
    const state = structuredClone(
      run.events.find((e) => e.state.publisherSigned)!.state,
    )
    const bid = run.bids[0]
    const changed = spendFor(bid)
    changed.outputs[0].B_ = '<different recipient>'
    assert.equal(rejected(settle(state, bid, changed, true)), true)
    assert.equal(state.bids.A1.funds, 'unspent')
    assert.equal(rejected(settle(state, bid, spendFor(bid), true)), false)
    assert.equal(rejected(settle(state, bid, spendFor(bid), true)), true)
    assert.equal(state.publisherReceived, 11)
  })

  test('expiry alone does not move funds; closing or losing does not permit refunds', async () => {
    const run = await simulate()
    const state = structuredClone(
      run.events.find((e) => e.stage === 'select')!.state,
    )
    const bid = run.bids[1]
    assert.equal(rejected(refund(state, bid, true)), true)
    state.now = bid.locktime
    assert.equal(rejected(refund(state, bid, true)), true)
    state.now++
    assert.equal(state.bids.B1.funds, 'unspent')
    assert.equal(rejected(refund(state, bid, true)), false)
    assert.equal(rejected(refund(state, bid, true)), true)
  })

  test('missing, multiple, inconsistent refund keys and dimensions fail', async () => {
    const run = await simulate()
    for (const refundKeys of [[], ['one', 'two'], [run.bids[1].refundKey]]) {
      const bid = structuredClone(run.bids[0])
      bid.proofs[0].refund = refundKeys
      assert.ok(rejected(paymentChecks(bid, run.bids[0])))
    }
    for (const width of [0, -1, 1.5, 301, NaN]) {
      const bid = structuredClone(run.bids[0])
      bid.width = width
      assert.ok(rejected(paymentChecks(bid, run.bids[0])))
    }
    assert.ok(
      rejected(
        publisherChecks(
          alteredBid(run.bids[0], 'identity'),
          run.bids[0],
          START + 4,
        ),
      ),
    )
  })
})

describe('hashing and event identity', () => {
  test('exact UTF-8 strings: no whitespace, newline or Unicode normalization', async () => {
    assert.equal(
      await sha256('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    assert.notEqual(await sha256('<p>Hi</p>'), await sha256('<p>Hi</p>\n'))
    assert.notEqual(await sha256('\n'), await sha256('\r\n'))
    assert.notEqual(await sha256('é'), await sha256('e\u0301'))
    assert.equal(
      await sha256(JSON.parse('"\\u003Cp>Hi</p>"')),
      await sha256('<p>Hi</p>'),
    )
    assert.notEqual(
      await sha256('cashuB<example>'),
      await sha256('cashuB<example> '),
    )
    assert.equal(validUnicode('🌱'), true)
    await assert.rejects(sha256('\ud800'), /Invalid Unicode/)
    await assert.rejects(sha256('\udc00'), /Invalid Unicode/)
  })

  test('tagged digest uses raw 32-byte components in the agreed order', async () => {
    const { createHash } = await import('node:crypto')
    const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest()
    const tag = hash(Buffer.from('ROB/commitment/v1'))
    const values = ['11', '22', '33', '44'].map((s) => s.repeat(32))
    const expected = hash(
      Buffer.concat([tag, tag, ...values.map((s) => Buffer.from(s, 'hex'))]),
    ).toString('hex')
    assert.equal(
      await taggedDigest(values[0], values[1], values[2], values[3]),
      expected,
    )
    await assert.rejects(
      taggedDigest('ff', values[1], values[2], values[3]),
      /32 bytes/,
    )
    await assert.rejects(
      taggedDigest('zz'.repeat(32), values[1], values[2], values[3]),
      /32 bytes/,
    )
  })

  test('request ID is the event envelope hash, stable on retransmit and changed by signed content', async () => {
    const a = await makeRequest(DEFAULT_CONFIG)
    const repeat = await makeRequest(DEFAULT_CONFIG)
    const changed = await makeRequest({
      ...DEFAULT_CONFIG,
      requestFault: 'domain',
    })
    assert.equal(a.id, repeat.id)
    assert.notEqual(a.id, changed.id)
    assert.equal('bid_request_id' in JSON.parse(a.content), false)
    assert.equal(
      a.id,
      await sha256(
        JSON.stringify([0, a.pubkey, a.created_at, a.kind, a.tags, a.content]),
      ),
    )
  })
})

describe('trace audit across configurable branches', () => {
  const configs: Partial<Config>[] = [
    ...SCENARIOS.map((s) => s.config),
    ...(['net', 'gross', 'creative'] as const).flatMap((policy) =>
      (['before', 'after', 'missing', 'direct'] as const).flatMap((callback) =>
        (
          ['online', 'outage', 'refund-first', 'publisher-first'] as const
        ).flatMap((mint) =>
          [false, true].map((early) => ({
            policy,
            callback,
            mint,
            early,
            lockSeconds: 20,
          })),
        ),
      ),
    ),
    { early: true, bidFault: 'late' },
    { early: true, bidFault: 'signer', callback: 'after', lockSeconds: 20 },
  ]
  test(`${configs.length} traces conserve funds, keep clocks monotonic, retain bindings, and never double-spend`, async () => {
    for (const config of configs) {
      const run = await simulate(config)
      let lastTime = START
      let bound: string | undefined
      const spent = new Map<string, string>()
      for (const event of run.events) {
        const balances = ledger(event.state, run.bids)
        assert.equal(
          balances.funded,
          balances.locked +
            balances.publisher +
            balances.refunded +
            balances.fees,
          JSON.stringify(config),
        )
        assert.ok(
          event.time >= lastTime,
          `Clock went backwards at ${event.title}: ${JSON.stringify(config)}`,
        )
        lastTime = event.time
        if (bound) assert.equal(event.state.binding?.bidId, bound)
        bound = event.state.binding?.bidId
        for (const [id, bid] of Object.entries(event.state.bids)) {
          if (spent.has(id)) assert.equal(bid.funds, spent.get(id))
          if (bid.funds === 'settled' || bid.funds === 'refunded')
            spent.set(id, bid.funds)
        }
      }
      assert.ok(
        Object.values(end(run).bids).every((b) => b.funds !== 'unspent'),
      )
    }
  })
})
