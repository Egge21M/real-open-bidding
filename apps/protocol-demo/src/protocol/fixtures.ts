import type { Bid, Config, Proof, Spend } from './types'

export const START = 1_800_000_000
export const CLOSE = START + 12
export const IMPRESSION = 'sidebar-1'
export const PUBLISHER_KEY = `02${'11'.repeat(32)}`
export const ORACLE_KEY = `03${'22'.repeat(32)}`
export const PIXEL_BASE = 'https://oracle.example/pixel'
export const MINTS = ['https://mint-a.example', 'https://mint-b.example']
export const SIZES = [
  [300, 250],
  [300, 600],
]
export const DEFAULT_CONFIG: Config = {
  policy: 'net',
  early: false,
  trustedOracle: true,
  requireSeller: false,
  sellerListed: false,
  requestFault: 'none',
  bidFault: 'none',
  oracleFault: 'none',
  callback: 'before',
  mint: 'online',
  lockSeconds: 45,
  repair: false,
}

export function validUnicode(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
    } else if (code >= 0xdc00 && code <= 0xdfff) return false
  }
  return true
}

export async function sha256(value: string | Uint8Array): Promise<string> {
  if (typeof value === 'string' && !validUnicode(value))
    throw new Error(
      'Invalid Unicode: unpaired surrogate. The original string must be rejected, not normalized.',
    )
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}

function fromHex(value: string) {
  return Uint8Array.from(value.match(/../g)!.map((b) => Number.parseInt(b, 16)))
}

export async function taggedDigest(
  payment: string,
  creative: string,
  identity: string,
  context: string,
) {
  if (
    ![payment, creative, identity, context].every((value) =>
      /^[0-9a-f]{64}$/.test(value),
    )
  ) {
    throw new Error(
      'Each commitment component must be 32 bytes of lowercase hexadecimal',
    )
  }
  const tag = await sha256('ROB/commitment/v1')
  return sha256(fromHex(tag + tag + payment + creative + identity + context))
}

export async function makeRequest(config: Config) {
  const content = JSON.stringify({
    site: {
      domain: config.requestFault === 'domain' ? '' : 'fieldnotes.example',
      name: 'Fieldnotes',
      page: 'https://fieldnotes.example/stories',
    },
    device: {
      language: 'en',
      w: 2560,
      h: 1600,
      ...(config.requestFault === 'ip' ? { ip: '192.0.2.1' } : {}),
    },
    ...(config.requestFault === 'user'
      ? { user: { id: 'excluded-example' } }
      : {}),
    impression_id: IMPRESSION,
    accepted_sizes: SIZES.map(([width, height]) => ({ width, height })),
    closes_at: CLOSE,
    mints: MINTS,
    publisher_payment_pubkey: PUBLISHER_KEY,
    oracle: {
      identity: 'oracle.example',
      payment_pubkey: ORACLE_KEY,
      oracle_pixel_base: PIXEL_BASE,
    },
  })
  const pubkey = '33'.repeat(32)
  // NIP-01 event ID hashing is real; key validity and signatures are deliberately simulated.
  const id = await sha256(
    JSON.stringify([0, pubkey, START, 28300, [], content]),
  )
  return {
    id,
    pubkey,
    kind: 28300,
    created_at: START,
    tags: [],
    content,
    sig: '<simulated publisher signature>',
  }
}

export async function makeBids(
  config: Config,
  requestId: string,
): Promise<Bid[]> {
  const specs = [
    {
      id: 'A1',
      bidder: 'Atlas',
      amount: 12,
      fee: 1,
      mint: MINTS[0],
      height: 250,
      offset: 0,
      received: 4,
      identity: 'aa',
    },
    {
      id: 'B1',
      bidder: 'Bloom',
      amount: 14,
      fee: 4,
      mint: MINTS[1],
      height: 600,
      offset: 5,
      received: 5,
      identity: 'bb',
    },
    {
      id: 'A2',
      bidder: 'Atlas',
      amount: 10,
      fee: 1,
      mint: MINTS[0],
      height: 600,
      offset: 10,
      received: 7,
      identity: 'aa',
    },
  ]
  const bids: Bid[] = []
  for (const spec of specs) {
    const nonce = `bid-${spec.id.toLowerCase()}`
    const refundKey = `02${await sha256(`simulated refund key ${spec.id}`)}`
    const locktime = START + config.lockSeconds + spec.offset
    const pixel = `${PIXEL_BASE}/${[requestId, IMPRESSION, nonce].map(encodeURIComponent).join('/')}`
    const html = `<article style="width:300px;height:${spec.height}px;background:#e7efc7;color:#253628;font:18px sans-serif"><h1>${spec.bidder}</h1><p>A little more outside.</p></article><img src="${pixel}" width="1" height="1" alt="">`
    const amounts =
      spec.amount === 12 ? [8, 4] : spec.amount === 14 ? [8, 4, 2] : [8, 2]
    const proofs: Proof[] = amounts.map((amount, i) => ({
      amount,
      id: `${spec.mint}/sat-keyset`,
      unit: 'sat',
      secret: JSON.stringify([
        'P2PK',
        {
          nonce: `proof-${spec.id}-${i}`,
          data: PUBLISHER_KEY,
          tags: [
            ['pubkeys', ORACLE_KEY],
            ['n_sigs', '2'],
            ['sigflag', 'SIG_ALL'],
            ['locktime', String(locktime)],
            ['refund', refundKey],
            ['n_sigs_refund', '1'],
          ],
        },
      ]),
      C: `<simulated mint signature ${spec.id}-${i}>`,
      refund: [refundKey],
      locktime,
      publisher: PUBLISHER_KEY,
      oracle: ORACLE_KEY,
      n_sigs: 2,
      n_sigs_refund: 1,
      sigflag: 'SIG_ALL',
    }))
    // Deliberately not a spendable token. Inspectors label this as a simulation placeholder.
    const payment = `cashuB<SIMULATED-${spec.id}-${await sha256(JSON.stringify(proofs))}>`
    const creative_hash = await sha256(html)
    const payment_hash = await sha256(payment)
    const identity = spec.identity.repeat(32)
    // Demo encoding only. ROB has NOT specified Encode(...).
    const context_hash = await sha256(
      JSON.stringify([requestId, IMPRESSION, nonce, 'html', 300, spec.height]),
    )
    const digest = await taggedDigest(
      payment_hash,
      creative_hash,
      identity,
      context_hash,
    )
    bids.push({
      ...spec,
      identity,
      nonce,
      width: 300,
      locktime,
      refundKey,
      payment,
      html,
      pixel,
      proofs,
      receivedAt:
        START +
        (spec.id === 'A1' && config.bidFault === 'late' ? 12 : spec.received),
      commitment: {
        bidder_pubkey: identity,
        creative_hash,
        payment_hash,
        context_hash,
        digest,
        sig: `<simulated BIP-340 signature ${spec.id}>`,
        signer: refundKey,
      },
    })
  }
  return bids
}

export function spendFor(bid: Bid): Spend {
  return {
    mint: bid.mint,
    inputs: bid.proofs.map(({ amount, id, secret, C }) => ({
      amount,
      id,
      secret,
      C,
    })),
    outputs: [
      {
        amount: bid.amount - bid.fee,
        B_: `<publisher blinded output for ${bid.id}>`,
      },
    ],
  }
}

export function bidPayload(bid: Bid, requestId: string) {
  const { bidder_pubkey, creative_hash, payment_hash, sig } = bid.commitment
  return {
    bid_request_id: requestId,
    impression_id: IMPRESSION,
    bid_nonce: bid.nonce,
    amount_sat: bid.amount,
    creative: {
      type: 'html',
      width: bid.width,
      height: bid.height,
      content: bid.html,
    },
    payment: bid.payment,
    commitment: { bidder_pubkey, creative_hash, payment_hash, sig },
  }
}
