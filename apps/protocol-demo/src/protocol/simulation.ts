import { alteredBid, authorize, publisherChecks, refund, settle } from './model'
import {
  bidPayload,
  CLOSE,
  DEFAULT_CONFIG,
  IMPRESSION,
  makeBids,
  makeRequest,
  spendFor,
  START,
} from './fixtures'
import type { Bid, Check, Config, Simulation, State, TraceEvent } from './types'

export const STAGES = [
  { id: 'request', label: 'Announce', description: 'A public opportunity' },
  {
    id: 'trust',
    label: 'Establish trust',
    description: 'Verify before funding',
  },
  {
    id: 'fund',
    label: 'Fund & commit',
    description: 'Independent locked ecash',
  },
  { id: 'bid', label: 'Deliver bids', description: 'Private Nostr gift wraps' },
  {
    id: 'select',
    label: 'Select',
    description: 'Publisher-controlled auction',
  },
  {
    id: 'render',
    label: 'Render & signal',
    description: 'An unchanged HTML banner',
  },
  {
    id: 'authorize',
    label: 'Authorize',
    description: 'One commitment per opportunity',
  },
  { id: 'settle', label: 'Settle', description: 'The mint completes payment' },
  {
    id: 'refund',
    label: 'Recover',
    description: 'Actively reclaim unspent funds',
  },
] as const

export const SCENARIOS: {
  id: string
  name: string
  description: string
  tag: string
  config: Partial<Config>
}[] = [
  {
    id: 'happy',
    name: 'The complete lifecycle',
    description:
      'Three bids. One authorization. A settled winner and two refunds.',
    tag: 'Start here',
    config: {},
  },
  {
    id: 'early',
    name: 'The publisher selects early',
    description:
      'A timely third bid arrives after selection. No outcome event tells its bidder.',
    tag: 'Auction',
    config: { early: true },
  },
  {
    id: 'delayed',
    name: 'The callback arrives later',
    description:
      'The first authorization attempt waits; a matching callback permits a retry.',
    tag: 'Delivery',
    config: { callback: 'after' },
  },
  {
    id: 'missing',
    name: 'The pixel never arrives',
    description:
      'The creative is rendered, but no callback means no payment authorization.',
    tag: 'Delivery',
    config: { callback: 'missing' },
  },
  {
    id: 'tamper',
    name: 'One extra character',
    description:
      'A newline changes the signed HTML. The oracle rejects the request.',
    tag: 'Integrity',
    config: { oracleFault: 'html' },
  },
  {
    id: 'inputs',
    name: 'The wrong transaction inputs',
    description:
      'A valid commitment cannot authorize a substituted or duplicated proof.',
    tag: 'Integrity',
    config: { oracleFault: 'inputs' },
  },
  {
    id: 'untrusted',
    name: 'An unverified oracle',
    description:
      'Bidders cannot trust the declaration alone. No funds are locked.',
    tag: 'Trust',
    config: { trustedOracle: false },
  },
  {
    id: 'refund-race',
    name: 'The refund wins the race',
    description:
      'Settlement is delayed beyond expiry. The bidder reaches the mint first.',
    tag: 'Recovery',
    config: { mint: 'refund-first' },
  },
  {
    id: 'payment-race',
    name: 'The publisher wins the race',
    description:
      'The original payment path still works after refund eligibility begins.',
    tag: 'Recovery',
    config: { mint: 'publisher-first' },
  },
  {
    id: 'outage',
    name: 'The mint is offline',
    description:
      'Authorization persists through failed settlement, expiry, and a recovery retry.',
    tag: 'Recovery',
    config: { mint: 'outage' },
  },
  {
    id: 'spoof',
    name: 'A callback without a viewer',
    description:
      'The publisher calls the pixel directly. Payment can pass without rendering.',
    tag: 'Trust boundary',
    config: { callback: 'direct' },
  },
  {
    id: 'invalid',
    name: 'An ineligible bid',
    description:
      'An identity-key commitment is rejected. Other independently funded bids remain eligible.',
    tag: 'Validation',
    config: { bidFault: 'signer' },
  },
]

type EventInput = Omit<
  TraceEvent,
  'id' | 'state' | 'time' | 'checks' | 'outcome' | 'data'
> & {
  checks?: Check[]
  outcome?: TraceEvent['outcome']
  data?: unknown
}

export async function simulate(
  overrides: Partial<Config> = {},
): Promise<Simulation> {
  const config = { ...DEFAULT_CONFIG, ...overrides }
  const request = await makeRequest(config)
  const bids = await makeBids(config, request.id)
  const events: TraceEvent[] = []
  const state: State = {
    now: START,
    requestPublished: false,
    requestValid: false,
    oracleTrusted: false,
    bids: Object.fromEntries(
      bids.map((b) => [
        b.id,
        { lifecycle: 'draft', funds: 'unfunded', deliveries: 0, reason: '' },
      ]),
    ),
    selected: null,
    rendered: null,
    callbacks: [],
    binding: null,
    publisherSigned: false,
    publisherReceived: 0,
    mintFees: 0,
    refunded: 0,
  }
  function emit(event: EventInput) {
    const checks = event.checks ?? []
    events.push({
      ...event,
      data: event.data ?? {},
      checks,
      outcome:
        event.outcome ?? (checks.some((c) => !c.pass) ? 'blocked' : 'ok'),
      id: events.length,
      time: state.now,
      state: structuredClone(state),
    })
  }
  const result = () => ({ config, request, bids, events })
  const failed = (checks: Check[]) => checks.some((c) => !c.pass)
  const failureReason = (checks: Check[]) =>
    checks
      .filter((c) => !c.pass)
      .map((c) => c.label)
      .join('; ')
  function recordCallback(bid: Bid, direct = false) {
    if (!state.callbacks.includes(bid.id)) state.callbacks.push(bid.id)
    emit({
      stage: 'render',
      from: direct ? 'publisher' : 'browser',
      to: 'oracle',
      title: `Pixel callback recorded · ${bid.id}`,
      body: `${direct ? 'The publisher calls the pixel itself. No viewer or rendering is required for this signal.' : 'The browser requests the bidder-inserted URL. The oracle records its three-part bid context.'} This does not prove display or viewability and does not assign authorization.`,
      data: {
        method: 'GET (simulated)',
        url: bid.pixel,
        bid_request_id: request.id,
        impression_id: IMPRESSION,
        bid_nonce: bid.nonce,
      },
      source: 'FLOW.md#pixel-url',
    })
  }
  function authorizeBid(bid: Bid, fault = config.oracleFault, retry = false) {
    const presented = alteredBid(bid, fault)
    const spend = spendFor(bid)
    if (fault === 'inputs') spend.inputs.push(structuredClone(spend.inputs[0]))
    const checks = authorize(state, presented, bid, spend)
    emit({
      stage: 'authorize',
      from: 'publisher',
      to: 'oracle',
      checks,
      title: failed(checks)
        ? 'Authorization withheld'
        : retry
          ? 'Exact authorization returned again'
          : `One authorization persisted · ${bid.id}`,
      body: failed(checks)
        ? `No oracle signature is released. ${failureReason(checks)}. An invalid request or missing callback cannot assign an unbound opportunity.`
        : retry
          ? 'The exact commitment, original proofs and proposed transaction reuse the existing authorization. This creates no second payment and cannot switch the winning bid.'
          : 'All semantic checks pass. Before releasing a signature, the oracle atomically and durably binds this opportunity to this commitment and its original proofs. Funds are still unspent.',
      data: {
        original_request: request,
        bid: bidPayload(presented, request.id),
        proposed_spend: spend,
        verification_key_source:
          'The same single refund key extracted from every proof',
        oracle_signature: failed(checks)
          ? null
          : '<simulated SIG_ALL signature on the proposed transaction>',
        transport:
          'Illustrative HTTPS; endpoint and authentication remain open',
      },
      source: 'FLOW.md#6-publisher-requests-oracle-authorization',
    })
    return !failed(checks)
  }
  function processSettlement(bid: Bid, online: boolean) {
    const checks = settle(state, bid, spendFor(bid), online)
    emit({
      stage: 'settle',
      from: 'publisher',
      to: 'mint',
      checks,
      title: failed(checks)
        ? 'Settlement did not complete'
        : `Mint settled ${bid.amount} sats gross`,
      body: failed(checks)
        ? `${failureReason(checks)}. Authorization remains bound to ${state.binding?.bidId}; the publisher cannot switch to another bid.`
        : `${bid.amount} sats of original proofs are consumed. ${bid.amount - bid.fee} sats go to the publisher and ${bid.fee} sats pay the redemption fee. Mint issuance signatures are separate from the two spending signatures.`,
      data: {
        illustrative_operation:
          'swap (operation is not standardized by ROB yet)',
        ...spendFor(bid),
        first_input_witness: [
          '<oracle SIG_ALL signature>',
          '<publisher SIG_ALL signature>',
        ],
        original_token_unchanged: bid.payment,
        mint_receives:
          'Cashu transaction only; no ROB commitment, stable bidder identity or DLEQ r value',
      },
      source: 'FLOW.md#7-publisher-completes-settlement',
    })
  }
  function processRefund(bid: Bid, online = true) {
    const checks = refund(state, bid, online)
    emit({
      stage: 'refund',
      from: 'bidder',
      to: 'mint',
      checks,
      title: failed(checks)
        ? `Refund cannot complete · ${bid.id}`
        : `Unspent funds recovered · ${bid.id}`,
      body: failed(checks)
        ? `${failureReason(checks)}. Eligibility is a condition for an attempt, not an automatic transfer.`
        : `${bid.bidder} actively spends its retained proofs using a new SIG_ALL signature from this bid's refund key. ${bid.amount} sats are recovered; the demo assumes zero refund fees. No outcome notice or publisher/oracle approval is needed.`,
      data: {
        bid: bid.id,
        mint: bid.mint,
        locktime: bid.locktime,
        mint_clock: state.now,
        refund_key: bid.refundKey,
        transaction: {
          inputs: spendFor(bid).inputs,
          outputs: [
            {
              amount: bid.amount,
              B_: '<bidder recovery output; demo fee = 0>',
            },
          ],
        },
        first_input_witness: '<new simulated refund-key SIG_ALL signature>',
      },
      source: 'FLOW.md#8-bidder-recovers-unspent-funds',
    })
  }

  emit({
    stage: 'request',
    from: 'bidder',
    to: 'relay',
    title: 'Listening for an opportunity',
    body: 'Atlas and Bloom subscribe to public requests. The publisher also listens for gift wraps addressed to its Nostr identity. Subscribing does not commit funds; relay history is not assumed.',
    data: {
      bidder_subscription: { kinds: [28300] },
      publisher_subscription: { kinds: [21059], '#p': [request.pubkey] },
      note: 'Subscription details are illustrative discovery policy.',
    },
    source: 'NOSTR.md#2-auction-request',
  })
  state.requestPublished = true
  emit({
    stage: 'request',
    from: 'publisher',
    to: 'relay',
    title: 'One opportunity, publicly announced',
    body: 'Fieldnotes publishes a signed, ephemeral kind 28300 event for one website banner. The two accepted sizes are alternatives for this same impression. The event ID is bid_request_id; it is not inside its own content.',
    data: request,
    source: 'FLOW.md#1-publisher-publishes-a-bid-request',
  })
  state.now = START + 1
  const requestChecks: Check[] = [
    {
      label: 'Nonempty site.domain',
      pass: config.requestFault !== 'domain',
      detail: 'Required website context. Device context is optional.',
    },
    {
      label: 'Public data exclusions',
      pass: config.requestFault !== 'ip',
      detail:
        'No IPs, precise coordinates or persistent device IDs, including through extensions or renamed fields.',
    },
    {
      label: 'No user object',
      pass: config.requestFault !== 'user',
      detail:
        'OpenRTB user is outside v1. Device w/h remain physical screen pixels; banner dimensions are CSS pixels.',
    },
  ]
  state.requestValid = !failed(requestChecks)
  emit({
    stage: 'request',
    from: 'relay',
    to: 'bidder',
    title: state.requestValid
      ? 'The request reaches both bidders'
      : 'The signed request is invalid',
    body: state.requestValid
      ? 'Both bidders inspect the exact signed request, its publisher, deadline, mint allowlist, and context. Ephemeral delivery does not guarantee deletion or historical retrieval.'
      : 'Receivers reject this request. Stripping prohibited data or repairing the domain would change the signed content and require a new event ID.',
    checks: requestChecks,
    data: JSON.parse(request.content),
    source: 'FLOW.md#advertising-context',
  })
  if (!state.requestValid) return result()
  emit({
    stage: 'trust',
    from: 'bidder',
    to: 'bidder',
    title:
      config.requireSeller && !config.sellerListed
        ? 'Bidder policy declines this seller'
        : 'Seller authorization is a local choice',
    outcome: config.requireSeller && !config.sellerListed ? 'blocked' : 'info',
    body: config.sellerListed
      ? 'The simulation supplies a verified listing for this request signer and site.domain. That establishes permission to offer inventory, not rendering or oracle trust.'
      : config.requireSeller
        ? 'These bidders require a verified ads.txt listing. Its absence makes them decline by local policy; it does not invalidate the ROB request.'
        : 'No verified listing is available. These bidders choose to participate anyway. This is permitted, but it supplies no affirmative seller authorization.',
    data: {
      site_domain: 'fieldnotes.example',
      request_signer: request.pubkey,
      verified_listing: config.sellerListed,
      bidder_requires_listing: config.requireSeller,
      draft_boundary:
        'Entry syntax, domain scope, retrieval and caching are not standardized yet.',
    },
    source: 'FLOW.md#optional-seller-authorization',
  })
  if (config.requireSeller && !config.sellerListed) return result()
  state.oracleTrusted = config.trustedOracle
  emit({
    stage: 'trust',
    from: 'bidder',
    to: 'bidder',
    title: config.trustedOracle
      ? 'Independently verify the oracle binding'
      : 'Stop before locking any funds',
    checks: [
      {
        label: 'Trusted identity + payment key + pixel endpoint',
        pass: config.trustedOracle,
        detail:
          'Authenticated independent of the publisher. Trusted local configuration is sufficient; no shared discovery protocol is required.',
      },
    ],
    body: config.trustedOracle
      ? 'The bidders match the oracle identity, payment key and pixel base URL to trusted local configuration. The publisher signature alone would not establish this binding.'
      : 'The declared identity, payment key and pixel endpoint cannot be independently bound to a trusted oracle. Funding and submission are forbidden. Distinct keys alone do not prove distinct controllers.',
    data: {
      mechanism: 'Simulated trusted local configuration',
      verified: config.trustedOracle,
    },
    source: 'FLOW.md#required-oracle-verification',
  })
  if (!config.trustedOracle) return result()
  state.now = START + 2
  for (const bid of bids) {
    state.bids[bid.id].lifecycle = 'funded'
    state.bids[bid.id].funds = 'unspent'
    emit({
      stage: 'fund',
      from: 'bidder',
      to: 'mint',
      title: `Lock ${bid.amount} sats for ${bid.bidder} · ${bid.id}`,
      body: `A fresh nonce, refund key and independent proofs fund this offer at ${bid.mint}. Every proof locks to publisher + oracle (2-of-2, SIG_ALL) and the same one-key refund path at t+${bid.locktime - START}s. ${bid.id === 'A2' ? 'Atlas’s second offer does not replace or withdraw A1.' : 'Conditions are encoded before issuance, never added to issued proofs.'}`,
      data: {
        payment: bid.payment,
        decoded_simulation: { mint: bid.mint, unit: 'sat', proofs: bid.proofs },
        retained_by_bidder: [
          'original token',
          'proofs',
          'fresh refund private key (not transmitted)',
        ],
      },
      source: 'FLOW.md#lock-and-refund-path',
    })
  }
  state.now = START + 3
  emit({
    stage: 'fund',
    from: 'bidder',
    to: 'bidder',
    title: 'Insert the pixel. Hash. Commit.',
    body: 'Each bidder finishes its HTML before signing. SHA-256 binds the exact token and exact UTF-8 HTML. A tagged BIP-340 commitment from the fresh refund key binds those hashes, the Nostr identity and bid context including size. That identity is signed data, not the commitment verification key.',
    data: {
      example_bid: bidPayload(bids[0], request.id),
      tag: 'ROB/commitment/v1',
      components: bids[0].commitment,
      context: [
        request.id,
        IMPRESSION,
        bids[0].nonce,
        'html',
        bids[0].width,
        bids[0].height,
      ],
      demo_boundary:
        'SHA-256 is real. JSON-array context encoding is demo-only; Encode(...) is unspecified. Signatures and tokens are simulated.',
    },
    source: 'FLOW.md#commitment-digest-and-signature',
  })

  const selectBid = () => {
    const eligible = bids.filter(
      (b) =>
        state.bids[b.id].lifecycle === 'eligible' &&
        b.locktime - state.now >= 5,
    )
    eligible.sort((a, b) => {
      const score = (bid: Bid) =>
        config.policy === 'gross'
          ? bid.amount
          : config.policy === 'creative'
            ? (bid.height === 600 ? 100 : 0) + bid.amount
            : bid.amount - bid.fee
      return score(b) - score(a) || a.id.localeCompare(b.id)
    })
    state.selected = eligible[0]?.id ?? null
    emit({
      stage: 'select',
      from: 'publisher',
      to: 'publisher',
      title: state.selected
        ? `Publisher selects ${state.selected} · ${config.policy === 'net' ? 'net proceeds' : config.policy === 'gross' ? 'gross amount' : 'tall creative preference'}`
        : 'No eligible bid can be selected',
      outcome: state.selected ? 'ok' : 'blocked',
      body: `${config.early ? 'Selection occurs before closes_at. No ROB early-closure announcement is sent.' : 'The upper receipt deadline has arrived.'} Ranking and ties belong to the publisher; this demo breaks ties by bid ID and requires a five-second settlement margin. First-price means paying the selected bid’s full amount. Selection alone unlocks nothing.`,
      data: {
        demo_policy: config.policy,
        selected: state.selected,
        eligible: eligible.map((b) => ({
          bid: b.id,
          gross: b.amount,
          fees: b.fee,
          net: b.amount - b.fee,
        })),
        closes_at: CLOSE,
        publisher_clock: state.now,
      },
      source: 'FLOW.md#4-publisher-runs-the-auction',
    })
  }
  for (const bid of [...bids].sort((a, b) => a.receivedAt - b.receivedAt)) {
    if (config.early && !state.selected && bid.receivedAt > START + 6) {
      state.now = START + 6
      selectBid()
    }
    state.now = bid.receivedAt
    const fault = bid.id === 'A1' ? config.bidFault : 'none'
    const presented = alteredBid(bid, fault)
    if (fault === 'reuse') presented.proofs = structuredClone(bids[1].proofs)
    state.bids[bid.id].lifecycle = 'submitted'
    state.bids[bid.id].deliveries++
    emit({
      stage: 'bid',
      from: 'bidder',
      to: 'relay',
      title: `Gift-wrap the funded offer · ${bid.id}`,
      body: 'Only kind 21059 is published: a one-use key signs the outer wrap, whose p tag exposes the recipient. NIP-44 protects the kind 13 bidder-signed seal and the unsigned kind 28301 rumor. Inner bid metadata is encrypted; this is not traffic-analysis anonymity.',
      data: {
        published_wrap: {
          kind: 21059,
          pubkey: '<fresh one-use key>',
          tags: [['p', request.pubkey]],
          content: '<NIP-44 encrypted seal>',
          sig: '<one-use signature>',
        },
        decrypted_seal: {
          kind: 13,
          pubkey: bid.identity,
          tags: [],
          content: '<NIP-44 encrypted rumor>',
          sig: '<bidder identity signature>',
        },
        decrypted_unsigned_rumor: {
          kind: 28301,
          pubkey: bid.identity,
          tags: [
            ['p', request.pubkey],
            ['e', request.id],
          ],
          content: JSON.stringify(bidPayload(presented, request.id)),
        },
      },
      source: 'NOSTR.md#gift-wrapped-transport',
    })
    const checks = publisherChecks(presented, bid, state.now, fault === 'reuse')
    const unused = !!state.selected
    state.bids[bid.id].lifecycle = failed(checks)
      ? 'rejected'
      : unused
        ? 'unused'
        : 'eligible'
    state.bids[bid.id].reason = failed(checks)
      ? failureReason(checks)
      : unused
        ? 'Arrived after early selection'
        : 'Eligible under demo publisher policy'
    emit({
      stage: 'bid',
      from: 'relay',
      to: 'publisher',
      checks,
      title: `${failed(checks) ? 'Ineligible' : unused ? 'Timely but unused' : 'Validated'} offer · ${bid.id}`,
      body: `${state.bids[bid.id].reason}. The publisher unwraps and authenticates the transport, then separately verifies the refund-key commitment. No ROB acceptance, rejection, receipt or outcome message is sent to the bidder.`,
      data: {
        bid: bid.id,
        publisher_receipt_time: state.now,
        closes_at: CLOSE,
        result: state.bids[bid.id].lifecycle,
        relay_OK_means:
          'Relay acceptance only, not publisher receipt or selection',
      },
      source: 'NOSTR.md#4-delivery-without-status-messages',
    })
  }
  const retransmit = bids.find((b) => state.bids[b.id].lifecycle === 'eligible')
  if (retransmit) {
    state.bids[retransmit.id].deliveries++
    emit({
      stage: 'bid',
      from: 'relay',
      to: 'publisher',
      title: `Retransmission, not another offer · ${retransmit.id}`,
      body: 'A new outer gift-wrap ID can carry the same logical bid. The offer, nonce, refund key, original token and commitment stay unchanged. This demo deduplicates by original bid identity; exact interoperable deduplication and nonce-conflict rules remain open.',
      data: {
        unchanged_payload: bidPayload(retransmit, request.id),
        deliveries: 2,
        additional_funding: 0,
      },
      source: 'FLOW.md#3-bidder-sends-a-prepaid-response',
    })
  }
  if (!state.selected) {
    state.now = Math.max(state.now, config.early ? START + 8 : CLOSE)
    selectBid()
  }
  const winner = bids.find((b) => b.id === state.selected)
  if (winner) {
    state.now++
    if (config.callback !== 'direct') state.rendered = winner.id
    emit({
      stage: 'render',
      from: 'publisher',
      to: 'browser',
      title:
        config.callback === 'direct'
          ? 'No creative is rendered in this scenario'
          : `Render the original ${winner.width} × ${winner.height} HTML`,
      outcome: config.callback === 'direct' ? 'info' : 'ok',
      body:
        config.callback === 'direct'
          ? 'This deliberately demonstrates the POC trust boundary: the publisher skips rendering but can still call the pixel URL itself.'
          : 'The publisher preserves the exact submitted HTML, including its completed pixel. It must reject incompatible content rather than rewriting or sanitizing the signed payload. Rendering-profile capabilities and isolation remain open.',
      data: {
        creative: winner.html,
        declared_size_css_pixels: [winner.width, winner.height],
        creative_hash: winner.commitment.creative_hash,
        asset_contents_hashed: false,
      },
      source: 'FLOW.md#5-publisher-renders-the-winning-creative',
    })
    state.now++
    if (config.callback === 'before' || config.callback === 'direct')
      recordCallback(winner, config.callback === 'direct')
    if (config.callback === 'missing')
      emit({
        stage: 'render',
        from: 'browser',
        to: 'oracle',
        outcome: 'blocked',
        title: 'The pixel request never arrives',
        body: 'An absent callback prevents authorization even if the creative was displayed. The oracle has no matching delivery signal.',
        data: { recorded_callbacks: [] },
        source: 'FLOW.md#6-publisher-requests-oracle-authorization',
      })
    state.now++
    let authorized = authorizeBid(winner)
    if (config.callback === 'after') {
      state.now++
      recordCallback(winner)
      authorized = authorizeBid(winner)
    }
    if (!authorized && config.repair && config.oracleFault !== 'none') {
      emit({
        stage: 'authorize',
        from: 'publisher',
        to: 'publisher',
        title: 'Retry with the original evidence',
        body: 'The publisher restores the exact bidder-supplied HTML, token, context and committed proofs. It does not create a replacement commitment or add a callback.',
        source: 'FLOW.md#6-publisher-requests-oracle-authorization',
      })
      authorized = authorizeBid(winner, 'none')
    }
    if (authorized) {
      emit({
        stage: 'authorize',
        from: 'oracle',
        to: 'publisher',
        title: 'A signature is authorization, not payment',
        body: 'The oracle returns a partial signature on the whole proposed spend. Its durable binding survives a restart. The proofs remain unspent and no value has reached the publisher.',
        data: {
          durable_binding: state.binding,
          publisher_balance: state.publisherReceived,
        },
        source: 'FLOW.md#one-authorized-bid-per-impression',
      })
      authorizeBid(winner, 'none', true)
      emit({
        stage: 'authorize',
        from: 'oracle',
        to: 'oracle',
        title: 'Repeated callbacks create no extra impression',
        body: 'Another callback for this same URL reuses the recorded signal. It does not create another authorization or payable impression.',
        data: { repeated_url: winner.pixel, durable_binding: state.binding },
        source: 'FLOW.md#one-authorized-bid-per-impression',
      })
      state.publisherSigned = true
      state.now++
      emit({
        stage: 'settle',
        from: 'publisher',
        to: 'publisher',
        title: 'Complete the same SIG_ALL spend',
        body: 'The publisher adds its signature without changing inputs or outputs. For the illustrative swap, SIG_ALL covers ordered input secrets and C values, then output amounts and B_ values. Both witnesses are on the first input, outside the unchanged original token.',
        data: {
          spend: spendFor(winner),
          witnesses: ['oracle', 'publisher'],
          refund_commitment_is_a_spend_signature: false,
        },
        source: 'FLOW.md#sig_all-settlement',
      })
      state.now++
      if (config.mint === 'online') processSettlement(winner, true)
      else if (config.mint === 'outage') processSettlement(winner, false)
      else
        emit({
          stage: 'settle',
          from: 'publisher',
          to: 'mint',
          outcome: 'info',
          title: 'A signed payment is delayed',
          body: 'No mint processing completes before expiry. Two signatures do not reserve funds or extend the bidder’s deadline.',
          data: { pending_spend: spendFor(winner) },
          source: 'FLOW.md#7-publisher-completes-settlement',
        })
    }
  }

  const unspent = bids.filter((b) => state.bids[b.id].funds === 'unspent')
  if (unspent[0] && state.now <= unspent[0].locktime) processRefund(unspent[0])
  for (const bid of [...bids].sort((a, b) => a.locktime - b.locktime)) {
    if (state.bids[bid.id].funds !== 'unspent') continue
    state.now = Math.max(state.now, bid.locktime + 1)
    emit({
      stage: 'refund',
      from: 'mint',
      to: 'mint',
      outcome: 'info',
      title: `Refund eligibility begins · ${bid.id}`,
      body: `The simulated mint clock is now past ${bid.id}'s bidder-chosen locktime. No funds move. The original publisher/oracle path remains valid, and any oracle binding remains in force.`,
      data: {
        locktime: bid.locktime,
        mint_clock: state.now,
        unspent: true,
        original_payment_path: 'still available if jointly signed',
      },
      source: 'FLOW.md#8-bidder-recovers-unspent-funds',
    })
    if (state.binding?.bidId === bid.id) {
      const alternative = bids.find((other) => other.id !== bid.id)!
      if (!state.callbacks.includes(alternative.id))
        state.callbacks.push(alternative.id)
      const checks = authorize(
        state,
        alternative,
        alternative,
        spendFor(alternative),
      )
      emit({
        stage: 'authorize',
        from: 'publisher',
        to: 'oracle',
        title: 'Switching to another bid is forbidden',
        checks,
        body: `Even with a simulated direct callback for ${alternative.id}, failed settlement and refund eligibility cannot release ${bid.id}'s binding. No second commitment is signed.`,
        data: {
          attempted_bid: alternative.id,
          existing_binding: state.binding,
          alternative_callback: alternative.pixel,
        },
        source: 'FLOW.md#one-authorized-bid-per-impression',
      })
      if (config.mint === 'publisher-first') {
        processSettlement(bid, true)
        processRefund(bid)
        continue
      }
      if (config.mint === 'outage') {
        processRefund(bid, false)
        emit({
          stage: 'refund',
          from: 'mint',
          to: 'mint',
          title: 'The simulated mint comes back online',
          body: 'Availability is restored for recovery retries. Funds remained unspent throughout the outage; the authorization binding was not released.',
          source: 'FLOW.md#8-bidder-recovers-unspent-funds',
        })
      }
      processRefund(bid)
      processSettlement(bid, true)
    } else processRefund(bid)
  }
  emit({
    stage: 'refund',
    from: 'bidder',
    to: 'bidder',
    title: 'The lifecycle is accounted for',
    body: 'Every funded sat is either still locked, recovered, paid to the publisher, or paid as a mint fee. The bidders receive no ROB outcome messages. This inspector is an omniscient teaching view, not information available to every participant.',
    data: {
      state,
      demo_boundary:
        'No relay, oracle, mint, seller lookup or pixel HTTP calls occurred.',
    },
    source: 'FLOW.md#trust-model-and-poc-limits',
  })
  return result()
}
