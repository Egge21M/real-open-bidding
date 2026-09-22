import {
  CLOSE,
  MINTS,
  ORACLE_KEY,
  PUBLISHER_KEY,
  SIZES,
  spendFor,
  validUnicode,
} from './fixtures'
import type { Bid, BidFault, Check, OracleFault, Spend, State } from './types'

const check = (label: string, pass: boolean, detail: string): Check => ({
  label,
  pass,
  detail,
})
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function sameProofInputs(a: Spend['inputs'], b: Spend['inputs']) {
  const identities = (inputs: Spend['inputs']) =>
    inputs.map((p) => JSON.stringify([p.amount, p.id, p.secret, p.C])).sort()
  return same(identities(a), identities(b))
}

export function alteredBid(original: Bid, fault: BidFault | OracleFault): Bid {
  const bid = structuredClone(original)
  switch (fault) {
    case 'mint':
      bid.mint = 'https://unlisted-mint.example'
      break
    case 'unit':
      bid.proofs[0].unit = 'msat'
      break
    case 'amount':
      bid.amount += 1
      break
    case 'size':
      bid.height = bid.height === 250 ? 600 : 250
      break
    case 'identity':
      bid.commitment.bidder_pubkey = 'cc'.repeat(32)
      break
    case 'refund':
      bid.proofs[0].refund = []
      break
    case 'signer':
      bid.commitment.signer = bid.identity
      break
    case 'html':
      bid.html += '\n'
      break
    case 'token':
      bid.payment += ' '
      break
    case 'pixel':
      bid.html = bid.html.replace(bid.pixel, `${bid.pixel}-other-bid`)
      bid.pixel += '-other-bid'
      break
    case 'tag':
      bid.commitment.digest = '00'.repeat(32)
      break
  }
  return bid
}

/** Semantic simulator. Issuance, key validity, Schnorr and NIP-44 are fixture facts, not cryptographic verification. */
export function paymentChecks(bid: Bid, committed: Bid): Check[] {
  const proofTotal = bid.proofs.reduce(
    (total, proof) => total + proof.amount,
    0,
  )
  return [
    check(
      'Single accepted mint',
      MINTS.includes(bid.mint) && bid.mint === committed.mint,
      'One bid uses one mint from the original request; all its proofs are issued there.',
    ),
    check(
      'Sat keysets and exact gross amount',
      Number.isSafeInteger(bid.amount) &&
        bid.amount > 0 &&
        bid.proofs.every(
          (p) =>
            p.unit === 'sat' && Number.isSafeInteger(p.amount) && p.amount > 0,
        ) &&
        proofTotal === bid.amount,
      `${proofTotal} sats in proofs must equal ${bid.amount} sats offered per impression. Keyset units, not just token metadata, must be sat.`,
    ),
    check(
      '2-of-2 P2PK · SIG_ALL',
      bid.proofs.every(
        (p) =>
          p.publisher === PUBLISHER_KEY &&
          p.oracle === ORACLE_KEY &&
          p.publisher.slice(2) !== p.oracle.slice(2) &&
          p.n_sigs === 2 &&
          p.sigflag === 'SIG_ALL',
      ),
      'Publisher and oracle sign the same whole transaction, including outputs.',
    ),
    check(
      'One shared refund key and deadline',
      bid.proofs.every(
        (p) =>
          p.refund.length === 1 &&
          p.refund[0] === bid.refundKey &&
          p.n_sigs_refund === 1 &&
          p.locktime === bid.locktime,
      ),
      'Every proof has the same single fresh refund key and bidder-chosen locktime. No refund key would make expiry anyone-can-spend.',
    ),
    check(
      'Original issued proofs',
      same(bid.proofs, committed.proofs),
      'Mint issuance is simulated. Editing issued secret conditions cannot produce a genuine proof.',
    ),
    check(
      'Exact original token',
      bid.payment === committed.payment,
      'SHA256 over the bare cashuB string. No trimming, URI wrapper, re-encoding, or original spending witnesses.',
    ),
    check(
      'Exact original HTML',
      validUnicode(bid.html) &&
        bid.html === committed.html &&
        bid.commitment.creative_hash === committed.commitment.creative_hash,
      'Even a whitespace change invalidates the commitment. External asset bytes and rendered pixels are not hashed.',
    ),
    check(
      'Explicit accepted dimensions',
      Number.isInteger(bid.width) &&
        Number.isInteger(bid.height) &&
        SIZES.some(([w, h]) => w === bid.width && h === bid.height),
      'One exact positive CSS-pixel pair from the original request, even if only one size was offered.',
    ),
    check(
      'Refund-key commitment',
      bid.commitment.signer === committed.refundKey &&
        same(bid.commitment, committed.commitment) &&
        bid.width === committed.width &&
        bid.height === committed.height,
      'Simulated BIP-340 check using the refund key extracted from proofs. Signed context includes dimensions, identity, and the ROB/commitment/v1 tag.',
    ),
    check(
      'Completed pixel URL',
      bid.pixel === committed.pixel && bid.html.includes(`src="${bid.pixel}"`),
      'The declared base plus URL-encoded bid_request_id / impression_id / bid_nonce must match the committed HTML.',
    ),
  ]
}

export function publisherChecks(
  bid: Bid,
  committed: Bid,
  now: number,
  proofReused = false,
): Check[] {
  return [
    ...paymentChecks(bid, committed),
    check(
      'Authenticated Nostr sender',
      bid.identity === bid.commitment.bidder_pubkey,
      'The seal signer, unsigned rumor pubkey, and signed bidder identity must match. The refund key is a different key.',
    ),
    check(
      'Timely publisher receipt',
      now < CLOSE,
      'Receipt at or after closes_at is late. Relay acceptance and wrapped event timestamps do not establish timely receipt.',
    ),
    check(
      'Settlement margin',
      bid.locktime - now >= 5,
      'Demo publisher policy: require five seconds remaining at validation and selection. ROB specifies no minimum lock duration.',
    ),
    check(
      'Independent funding',
      !proofReused,
      'Independent bids cannot reuse decoded proofs. A different token encoding or hash cannot make reused proofs independent.',
    ),
  ]
}

export function authorize(
  state: State,
  bid: Bid,
  committed: Bid,
  spend: Spend,
): Check[] {
  const checks = [
    ...paymentChecks(bid, committed),
    check(
      'Unspent funding or existing exact authorization',
      state.bids[bid.id].funds === 'unspent' ||
        (state.binding?.bidId === bid.id &&
          state.binding.digest === committed.commitment.digest &&
          same(state.binding.spend, spend)),
      'New authorization requires unspent funding in this model. Returning an existing authorization cannot resurrect consumed proofs; the mint still rejects a second spend.',
    ),
    check(
      'Exact committed transaction inputs',
      spend.mint === committed.mint &&
        sameProofInputs(spend.inputs, spendFor(committed).inputs),
      'Compare decoded amount, resolved keyset ID, original secret and C. No added, omitted, duplicated or substituted inputs. The initial transaction may order those proofs differently; SIG_ALL then binds that exact transaction order.',
    ),
    check(
      'Matching recorded callback',
      state.callbacks.includes(bid.id),
      'Callback and authorization request may arrive in either order. A callback alone never assigns the opportunity.',
    ),
    check(
      'One authorized commitment',
      !state.binding ||
        (state.binding.bidId === bid.id &&
          state.binding.digest === committed.commitment.digest),
      'Atomically persist one commitment and its original proofs before releasing a signature. Failure or expiry never releases this binding.',
    ),
    check(
      'Exact authorization retry',
      !state.binding ||
        state.binding.bidId !== bid.id ||
        same(state.binding.spend, spend),
      'This demo reuses only the exact transaction. More general transaction retry/output rules remain open.',
    ),
  ]
  if (checks.every((c) => c.pass) && !state.binding)
    state.binding = {
      bidId: bid.id,
      digest: committed.commitment.digest,
      spend: structuredClone(spend),
    }
  return checks
}

export function settle(
  state: State,
  bid: Bid,
  spend: Spend,
  mintOnline: boolean,
): Check[] {
  const checks = [
    check(
      'Mint available',
      mintOnline,
      'An outage neither consumes the proofs nor releases the oracle binding.',
    ),
    check(
      'Both transaction signatures',
      state.binding?.bidId === bid.id && state.publisherSigned,
      'The standalone commitment signature is neither a settlement signer nor a refund-spend signature.',
    ),
    check(
      'Same signed transaction',
      !!state.binding && same(state.binding.spend, spend),
      'SIG_ALL commits ordered inputs and outputs. Adding a publisher signature must not modify them.',
    ),
    check(
      'Proofs still unspent',
      state.bids[bid.id].funds === 'unspent',
      'Mint processing wins a post-expiry race. Signatures do not reserve funds; spent proofs cannot fund the other path.',
    ),
    check(
      'Outputs account for fees',
      spend.outputs.reduce((sum, output) => sum + output.amount, 0) +
        bid.fee ===
        bid.amount,
      'First-price: the full gross bid is consumed. The publisher absorbs redemption fees; the bidder supplies no top-up.',
    ),
  ]
  if (checks.every((c) => c.pass)) {
    state.bids[bid.id].funds = 'settled'
    state.publisherReceived += bid.amount - bid.fee
    state.mintFees += bid.fee
  }
  return checks
}

export function refund(state: State, bid: Bid, mintOnline: boolean): Check[] {
  const checks = [
    check(
      'Mint available',
      mintOnline,
      'Recovery may need retrying after an outage.',
    ),
    check(
      'Mint considers locktime expired',
      state.now > bid.locktime,
      'The simulation mint uses now > locktime. Losing, closes_at, or a failed callback do not permit an early refund.',
    ),
    check(
      'Proofs remain unspent',
      state.bids[bid.id].funds === 'unspent',
      'Eligibility alone never moves funds. The bidder must submit retained proofs in a valid refund spend.',
    ),
    check(
      'Fresh refund-key spend signature',
      bid.proofs.every(
        (p) => p.refund.length === 1 && p.refund[0] === bid.refundKey,
      ),
      'A simulated new SIG_ALL signature from the retained refund private key; no publisher or oracle signature. Refund fees are set to zero for this demo.',
    ),
  ]
  if (checks.every((c) => c.pass)) {
    state.bids[bid.id].funds = 'refunded'
    state.refunded += bid.amount
  }
  return checks
}

export function ledger(state: State, bids: Bid[]) {
  const funded = bids
    .filter((b) => state.bids[b.id].funds !== 'unfunded')
    .reduce((sum, b) => sum + b.amount, 0)
  const locked = bids
    .filter((b) => state.bids[b.id].funds === 'unspent')
    .reduce((sum, b) => sum + b.amount, 0)
  return {
    funded,
    locked,
    publisher: state.publisherReceived,
    fees: state.mintFees,
    refunded: state.refunded,
  }
}
