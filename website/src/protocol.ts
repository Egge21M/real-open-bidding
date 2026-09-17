import { Eye, Globe2, Radio, Wallet } from "lucide-react"

export const steps = [
  {
    name: "Publish",
    actor: "Publisher → Nostr relays",
    title: "An opportunity, out in the open.",
    description:
      "The publisher broadcasts an HTML banner opportunity, accepted Cashu mints, payment key, and its chosen oracle’s identity, key, and pixel base URL. V1 supports HTML banners only.",
    state: "Awaiting bids",
    detail: "One published request. Any listening bidder can evaluate it.",
    from: 0,
    to: 1,
  },
  {
    name: "Discover",
    actor: "Nostr relays → Bidders",
    title: "Bidders choose where to participate.",
    description:
      "Bidders subscribe to requests on Nostr and evaluate the opportunity, publisher, and declared oracle. Listening does not commit them to a bid.",
    state: "Awaiting bids",
    detail: "Relays distribute requests. They do not choose the winner.",
    from: 1,
    to: 2,
  },
  {
    name: "Commit",
    actor: "Bidder → Publisher",
    title: "Every offer arrives with its payment.",
    description:
      "The bidder chooses an accepted mint and a refund deadline, then prepares locked ecash with a fresh refund key. It includes the complete HTML banner with its pixel, then uses that key to commit to the creative, exact token, bidder identity, and bid context.",
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
      "The publisher checks the mint, sat keysets, proof total, locks, and settlement window before selecting a winner. ROB uses first-price pricing: the winner pays its full bid amount before redemption fees. Selection and tie-breaking rules remain to be specified.",
    state: "Payment locked",
    detail: "Winning the auction does not unlock the payment.",
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
      "The oracle verifies the commitment using the refund key embedded in every payment proof. It checks the creative, signed bid context, pixel URL, and callback, and requires the proposed spend to use exactly those proofs.",
    state: "1 of 2 signatures",
    detail: "No matching callback or failed checks means no oracle signature.",
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
    copy: "Discover opportunities, choose your refund deadline, and attach locked ecash. Use a fresh refund key to sign the creative/payment commitment, keeping it separate from your Nostr identity key. Retain that key and your proofs to reclaim unspent funds after expiry.",
    responsibility: "Commits the creative and payment",
    boundary:
      "ROB prescribes no lock duration. The publisher decides whether your settlement window is sufficient.",
  },
  {
    name: "Oracle",
    icon: Eye,
    subtitle: "Check the commitment. Co-sign the spend.",
    copy: "Record pixel callbacks and verify the commitment against the refund key in the payment proofs. Check the creative, ecash, bid context, and pixel URL before authorizing the spend.",
    responsibility: "Authorizes the proposed spend",
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
    "The bidder’s fresh refund key signs one commitment covering the original creative hash, exact payment token, bidder identity, and bid context. The oracle verifies it using the refund key embedded in the proofs. This authenticates the refund-key holder’s approval, but does not establish what was displayed.",
  ],
  [
    "dependencies",
    "Where does trust remain?",
    "The oracle must follow its checks, and the mint must enforce spending conditions and honor its ecash. Publisher–oracle collusion can bypass checks. Auction fairness is not independently verified by this design.",
  ],
  [
    "recovery",
    "What happens to unsuccessful bids?",
    "After the bidder-chosen locktime expires according to the mint’s clock, the bidder can actively reclaim unspent proofs using its refund key. No publisher or oracle signature is needed. Refunds are not automatic: the publisher’s path remains valid, and late settlement can race with a refund. Mint outages can delay recovery.",
  ],
]
