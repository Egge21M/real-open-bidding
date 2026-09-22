import { ExternalLink, X } from 'lucide-react'
import { sourceUrl } from '../protocol/sources'

const rules = [
  [
    'One opportunity, multiple size alternatives',
    'A signed 28300 event offers exactly one website HTML banner impression. Its event ID is bid_request_id. Changing signed content creates a new auction. Each bid explicitly commits to one accepted CSS-pixel pair.',
    'FLOW.md#1-publisher-publishes-a-bid-request',
  ],
  [
    'Two ROB message types',
    'Public requests use ephemeral 28300. Private bids are unsigned 28301 rumors inside signed 13 seals inside published 21059 wraps. Only the outer wrap is published. NIP-44 encryption and signature verification are simulated here. Inner routing tags and discovery rules are proposals.',
    'NOSTR.md#gift-wrapped-transport',
  ],
  [
    'Trust before funding',
    'Independently verify the oracle identity, payment key and pixel endpoint as a trusted binding. A publisher declaration is insufficient. Seller authorization through ads.txt is optional to publish and to enforce; its absence supplies no affirmative authorization.',
    'FLOW.md#2-bidders-evaluate-the-opportunity',
  ],
  [
    'Independent, immutable offers',
    'Each offer gets a fresh bid_nonce, refund key and separate funding. A later offer does not replace an earlier one. A retransmission preserves the offer and adds no funding. No amendment or withdrawal operation exists in v1.',
    'docs/adr/0002-independent-immutable-bids.md',
  ],
  [
    'First-price is a payment rule',
    'The selected bid pays its full gross amount in integer sats per impression. Ranking, ties and early stopping belong to the publisher. These are not OpenRTB CPM prices. Redemption fees reduce publisher proceeds, with no bidder top-up.',
    'FLOW.md#amount-and-redemption-fees',
  ],
  [
    'The receipt deadline is not the refund deadline',
    'Bids received at or after closes_at are late. The publisher may select earlier. No ROB receipt, outcome, rejection, timeout or early-closure message is sent. Relay OK is not a publisher decision. Refund locktimes are chosen independently by each bidder.',
    'NOSTR.md#4-delivery-without-status-messages',
  ],
  [
    'Exact strings, distinct signatures',
    'The fresh refund key signs the tagged ROB commitment. The Nostr identity key signs the seal. The publisher and oracle sign the Cashu spend. A later refund needs a new refund-key spend signature. The original bare cashuB token and decoded HTML string are hashed without re-encoding or normalization. Invalid Unicode must be rejected.',
    'FLOW.md#creativepayment-commitment',
  ],
  [
    'One durable authorization',
    'Only after every check and a matching callback pass may the oracle atomically persist a commitment and original proofs for the opportunity and release its signature. Exact retries reuse it. Concurrent requests cannot bind another bid, and settlement failure or refund eligibility never releases it.',
    'FLOW.md#one-authorized-bid-per-impression',
  ],
  [
    'Expiry enables competition',
    'Eligibility does not move money or disable the publisher/oracle payment path. After locktime, a refund and an authorized payment can race. The first valid spend processed by the mint consumes the proofs; the other fails. Mint outages can delay both.',
    'FLOW.md#8-bidder-recovers-unspent-funds',
  ],
  [
    'A pixel is a limited delivery signal',
    'The publisher can call the URL without displaying anything. A callback cannot prove rendering, viewability or auction fairness. A missing callback blocks payment even if the ad displayed. Hashing the HTML does not freeze its referenced assets.',
    'FLOW.md#trust-model-and-poc-limits',
  ],
]

export default function Notes({ onClose }: { onClose: () => void }) {
  return (
    <div className="notes-content">
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">READING THE MODEL</span>
          <h2>Agreed rules. Visible boundaries.</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close protocol notes"
        >
          <X size={20} />
        </button>
      </div>
      <p className="dialog-intro">
        Based on this repository’s FLOW.md, NOSTR.md, CONTEXT.md and accepted
        ADRs, including the September 22, 2026 decisions. OpenRTB and Prebid
        research only applies where ROB explicitly adopts it.
      </p>
      <div className="boundary-callout">
        <strong>This is a semantic simulation.</strong>
        <p>
          No mint calls, relay connections, pixel requests, ads.txt retrieval,
          key generation or signature verification. Tokens and signatures are
          placeholders. Every actor’s internal state is visible to you; actual
          bidders do not receive publisher outcome notices.
        </p>
      </div>
      {rules.map(([title, body, source], i) => (
        <article className="note-rule" key={title}>
          <span>{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h3>{title}</h3>
            <p>{body}</p>
            <a href={sourceUrl(source)} target="_blank" rel="noreferrer">
              Specification <ExternalLink size={11} />
            </a>
          </div>
        </article>
      ))}
      <div className="open-questions">
        <span className="eyebrow">DELIBERATELY NOT STANDARDIZED HERE</span>
        <h3>The draft still has open decisions.</h3>
        <p>
          Complete wire schemas and versioning; context Encode(...); domain
          normalization; relay discovery and inner tags; recipient keys and
          publisher identity-to-payment binding; publisher–oracle transport and
          authentication; oracle retention and transaction retry details; exact
          swap/melt operation and output-control checks; proof and DLEQ
          validation profile; refund scheduling; and precise rendering
          capabilities and isolation.
        </p>
        <p>
          One shared rendering profile and common request/bid size ceilings are
          agreed. Their numeric budgets, byte-counting boundaries, lower
          publisher limits and exact fields remain open. This demo does not
          invent normative limits or sandbox flags. The creative preview is a
          diagram, not execution of signed HTML.
        </p>
        <p>
          The demo uses JSON-array context encoding only to illustrate the
          agreed tagged hash; it is not an interoperable commitment encoding.
          Local selection policies, five-second acceptance margin, three sample
          bid amounts, fee values, timings, serial event ordering, and
          exact-transaction retry policy are example choices. The mint model
          uses now &gt; locktime and zero refund fees.
        </p>
        <a
          href={sourceUrl('FLOW.md#details-still-to-specify')}
          target="_blank"
          rel="noreferrer"
        >
          All remaining specification work <ExternalLink size={12} />
        </a>
      </div>
    </div>
  )
}
