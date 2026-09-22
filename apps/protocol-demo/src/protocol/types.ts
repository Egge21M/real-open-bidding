export type Actor =
  'bidder' | 'relay' | 'publisher' | 'browser' | 'oracle' | 'mint'
export type Stage =
  | 'request'
  | 'trust'
  | 'fund'
  | 'bid'
  | 'select'
  | 'render'
  | 'authorize'
  | 'settle'
  | 'refund'
export type Outcome = 'ok' | 'blocked' | 'info'
export type BidFault =
  | 'none'
  | 'mint'
  | 'unit'
  | 'amount'
  | 'size'
  | 'identity'
  | 'refund'
  | 'signer'
  | 'reuse'
  | 'late'
export type OracleFault =
  'none' | 'html' | 'token' | 'size' | 'inputs' | 'pixel' | 'identity' | 'tag'
export interface Config {
  policy: 'net' | 'gross' | 'creative'
  early: boolean
  trustedOracle: boolean
  requireSeller: boolean
  sellerListed: boolean
  requestFault: 'none' | 'domain' | 'ip' | 'user'
  bidFault: BidFault
  oracleFault: OracleFault
  callback: 'before' | 'after' | 'missing' | 'direct'
  mint: 'online' | 'outage' | 'refund-first' | 'publisher-first'
  lockSeconds: number
  repair: boolean
}
export interface Check {
  label: string
  pass: boolean
  detail: string
}
export interface Proof {
  amount: number
  id: string
  secret: string
  C: string
  unit: string
  refund: string[]
  locktime: number
  publisher: string
  oracle: string
  n_sigs: number
  n_sigs_refund: number
  sigflag: string
}
export interface Bid {
  id: string
  bidder: string
  identity: string
  nonce: string
  amount: number
  fee: number
  mint: string
  width: number
  height: number
  locktime: number
  refundKey: string
  payment: string
  html: string
  pixel: string
  proofs: Proof[]
  commitment: {
    bidder_pubkey: string
    creative_hash: string
    payment_hash: string
    context_hash: string
    digest: string
    sig: string
    signer: string
  }
  receivedAt: number
}
export interface BidState {
  lifecycle:
    'draft' | 'funded' | 'submitted' | 'eligible' | 'rejected' | 'unused'
  funds: 'unfunded' | 'unspent' | 'settled' | 'refunded'
  deliveries: number
  reason: string
}
export interface Spend {
  mint: string
  inputs: Pick<Proof, 'amount' | 'id' | 'secret' | 'C'>[]
  outputs: { amount: number; B_: string }[]
}
export interface Binding {
  bidId: string
  digest: string
  spend: Spend
}
export interface State {
  now: number
  requestPublished: boolean
  requestValid: boolean
  oracleTrusted: boolean
  bids: Record<string, BidState>
  selected: string | null
  rendered: string | null
  callbacks: string[]
  binding: Binding | null
  publisherSigned: boolean
  publisherReceived: number
  mintFees: number
  refunded: number
}
export interface TraceEvent {
  id: number
  time: number
  title: string
  body: string
  stage: Stage
  from: Actor
  to: Actor
  outcome: Outcome
  data: unknown
  checks: Check[]
  source: string
  state: State
}
export interface Simulation {
  config: Config
  request: {
    id: string
    pubkey: string
    kind: number
    created_at: number
    tags: string[][]
    content: string
    sig: string
  }
  bids: Bid[]
  events: TraceEvent[]
}
