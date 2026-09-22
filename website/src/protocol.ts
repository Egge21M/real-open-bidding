import { Eye, Globe2, Radio, Wallet } from "lucide-react"

export const steps = [
  {
    name: "Publish",
    actor: "Publisher → Nostr relays",
    title: "An opportunity, out in the open.",
    description:
      "The publisher broadcasts one website HTML banner opportunity with its domain, accepted fixed sizes, Cashu mints, payment key, and its chosen oracle’s identity, key, and pixel base URL.",
    state: "Awaiting bids",
    detail:
      "Each request sets a bid collection deadline. Any listening bidder can evaluate it.",
    from: 0,
    to: 1,
  },
  {
    name: "Discover",
    actor: "Nostr relays → Bidders",
    title: "Bidders choose where to participate.",
    description:
      "Bidders evaluate the opportunity and publisher. Before locking funds, they independently verify that the declared oracle identity, payment key, and pixel endpoint belong to an oracle they trust.",
    state: "Awaiting bids",
    detail:
      "Bidders may also check the website’s optional ads.txt declaration of authorized publisher Nostr keys.",
    from: 1,
    to: 2,
  },
  {
    name: "Commit",
    actor: "Bidder → Publisher",
    title: "Every offer arrives with its payment.",
    description:
      "The bidder chooses an accepted mint, one advertised banner size, and a refund deadline, then prepares locked ecash with a fresh refund key. That key signs a commitment to the complete HTML with its pixel, exact token, bidder identity, and bid context including the chosen dimensions.",
    state: "Payment locked",
    detail:
      "Gross integer sats per impression. Attached proofs from the selected mint must total exactly the bid amount.",
    from: 2,
    to: 0,
  },
  {
    name: "Select",
    actor: "Publisher",
    title: "The publisher runs the auction.",
    description:
      "The publisher checks the mint, sat keysets, proof total, locks, and settlement window before selecting a winner using its own ranking and tie-breaking policy. ROB uses first-price pricing: the winner pays its full bid amount before redemption fees.",
    state: "Payment locked",
    detail:
      "The deadline is an upper bound: selection may happen earlier. ROB sends no timeout or early-closure notices.",
    from: 0,
    to: 0,
  },
  {
    name: "Render",
    actor: "Publisher → Viewer → Oracle",
    title: "The original creative goes to the viewer.",
    description:
      "The publisher renders the winning HTML banner unchanged. In the intended flow, the browser requests its embedded pixel and the oracle records the callback.",
    state: "Payment locked",
    detail:
      "A callback is a delivery signal, not proof of rendering or viewability.",
    from: 0,
    to: 3,
  },
  {
    name: "Verify",
    actor: "Publisher ↔ Oracle",
    title: "The oracle checks before it signs.",
    description:
      "The oracle verifies the refund-key commitment, creative, signed dimensions and context, pixel URL, and callback. Before signing, it durably binds the opportunity to this commitment and its original payment proofs.",
    state: "1 of 2 signatures",
    detail:
      "At most one bid may be authorized per opportunity. Exact retries reuse that authorization; another bid cannot replace it.",
    from: 0,
    to: 4,
  },
  {
    name: "Settle",
    actor: "Publisher → Cashu mint",
    title: "Two signatures. One authorized spend.",
    description:
      "The publisher adds its signature to the same transaction and submits it to the mint. Payment is received only after the mint validates and completes the spend.",
    state: "Mint completes payment",
    detail:
      "Settle before the bidder’s refund deadline to avoid a competing refund. Signatures do not reserve funds.",
    from: 0,
    to: 5,
  },
]

export const participants = [
  {
    name: "Publisher",
    icon: Globe2,
    subtitle: "Your inventory. Your auction.",
    copy: "Publish the opportunity, choose accepted mints and the oracle, and check each bid’s settlement window. Render the winner and jointly authorize its payment. You bear the selected mint’s redemption fees; bidders do not top up the bid to cover them.",
    responsibility: "Controls auction selection",
    boundary: "Cannot claim through the agreed payment path alone.",
  },
  {
    name: "Bidder",
    icon: Radio,
    subtitle: "Discover openly. Commit upfront.",
    copy: "Discover opportunities and independently verify the declared oracle before funding. Choose your refund deadline and attach locked ecash. Use a fresh refund key to sign the creative/payment commitment. Retain that key and your proofs to reclaim unspent funds after expiry.",
    responsibility: "Commits the creative and payment",
    boundary:
      "ROB prescribes no lock duration. The publisher decides whether your settlement window is sufficient.",
  },
  {
    name: "Oracle",
    icon: Eye,
    subtitle: "Check the commitment. Co-sign the spend.",
    copy: "Record pixel callbacks and verify the commitment against the refund key in the payment proofs. Check the creative, chosen size, ecash, bid context, and pixel URL. Durably bind the opportunity to one commitment and its original proofs before releasing a signature.",
    responsibility: "Authorizes at most one bid per opportunity",
    boundary:
      "A pixel callback does not establish what was actually displayed.",
  },
  {
    name: "Nostr relays",
    icon: Radio,
    subtitle: "A shared network for opportunity.",
    copy: "Carry published requests to subscribed bidders. Open distribution lets bidders discover opportunities without a separate request from the publisher to each bidder.",
    responsibility: "Distributes bid requests",
    boundary: "Does not run the auction or select the winner.",
  },
  {
    name: "Cashu mint",
    icon: Wallet,
    subtitle: "Enforce the conditions. Complete the payment.",
    copy: "Issue ecash and enforce the conditions for publisher settlement or bidder refunds. The mint’s clock determines expiry; successful processing determines which competing spend completes.",
    responsibility: "Enforces ecash spending conditions",
    boundary: "The mint remains a trust dependency and must honor its ecash.",
  },
]

export const trustQuestions = [
  [
    "pixel",
    "What does the pixel actually prove?",
    "Only that the oracle’s endpoint was requested. It does not prove that the creative was rendered or viewable. A publisher could request the pixel directly; stronger verification is outside this proof of concept.",
  ],
  [
    "commitment",
    "What protects the original creative?",
    "The bidder’s fresh refund key signs one commitment covering the exact HTML hash, payment token, bidder identity, and bid context including the chosen CSS-pixel dimensions. The oracle verifies it using the refund key embedded in the proofs. This authenticates the refund-key holder’s approval, but does not establish what was displayed.",
  ],
  [
    "seller",
    "Must bidders verify the website’s seller authorization?",
    "Bidders may require the website’s ads.txt declaration to authorize the Nostr key that signed the request. Publication and enforcement are optional, and the extension’s exact syntax and lookup rules remain draft. Oracle verification is a separate mandatory step: bidders must independently verify the trusted oracle’s identity, payment key, and pixel endpoint before funding.",
  ],
  [
    "context",
    "What context is published with an opportunity?",
    "Every request includes OpenRTB site context with a nonempty site.domain. Device context is optional; the user object is outside v1. Public requests exclude viewer IPs, precise coordinates, and persistent device identifiers, including data hidden in extensions. Other supplied metadata is publisher-declared and is not necessarily anonymous.",
  ],
  [
    "offers",
    "Can a bidder submit another offer?",
    "Yes. Each additional bid is an independent immutable offer with a fresh nonce, refund key, and separate funding. It does not replace an earlier bid. The oracle can authorize at most one commitment per opportunity and cannot switch to another bid after signing, even if settlement fails.",
  ],
  [
    "dependencies",
    "Where does trust remain?",
    "The oracle must follow its checks, and the mint must enforce spending conditions and honor its ecash. Publisher–oracle collusion can bypass checks. Auction fairness is not independently verified by this design.",
  ],
  [
    "recovery",
    "What happens to unsuccessful bids?",
    "ROB sends no bidder receipts, outcome notices, or rejection messages. After the bidder-chosen locktime expires according to the mint’s clock, the bidder can actively reclaim unspent proofs using its refund key. The auction deadline or early selection does not unlock a refund. Refunds need no publisher or oracle signature and are not automatic: the publisher’s path remains valid, so late settlement can race with recovery. Mint outages can delay recovery.",
  ],
]
