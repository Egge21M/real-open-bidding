import { secp256k1 } from "@noble/curves/secp256k1.js";
import { decodePayment, verifyPayment } from "./payment";
import {
  commitmentDigest,
  hashHex,
  hex,
  randomHex,
  unhex,
  verifySignature,
  verifyProofDleq,
  blind,
} from "./crypto";
import {
  bidSchema,
  bidRequestSchema,
  type Bid,
  type Keyset,
  type SignedEvent,
} from "./schemas";
import type { PublisherConfig } from "./config";
import { requireCondition } from "./errors";
import { validateCreative } from "./creative";
import { parseJson } from "./json";

export interface Input {
  id: string;
  amount: number;
  secret: string;
  C: string;
}
export interface VerifiedBid {
  bid: Bid;
  mint: string;
  inputs: Input[];
  net: number;
  refundAt: number;
  proofIds: string[];
  outputKeyset: Keyset;
}
export interface RecoveryOutput {
  amount: number;
  id: string;
  B_: string;
  secret: string;
  r: string;
  mintKey: string;
}
export interface SwapPlan {
  inputs: Input[];
  outputs: RecoveryOutput[];
}

export function resolveKeyset(id: string, keysets: Keyset[]) {
  const matches = keysets.filter(
    (k) => k.id === id || (id.length === 16 && k.id.startsWith(id)),
  );
  requireCondition(matches.length === 1, "unknown_or_ambiguous_keyset");
  return matches[0]!;
}

export function denominations(amount: number, keyset: Keyset): number[] {
  let remaining = BigInt(amount);
  const result: number[] = [];
  for (const key of Object.keys(keyset.keys).sort(
    (a, b) => Number(b) - Number(a),
  )) {
    const value = BigInt(key);
    while (remaining >= value) {
      requireCondition(result.length < 128, "too_many_outputs");
      result.push(Number(value));
      remaining -= value;
    }
  }
  requireCondition(remaining === 0n, "unsupported_output_amount");
  return result;
}

export function validateBid(
  value: unknown,
  sender: string,
  request: SignedEvent,
  config: PublisherConfig,
  now: number,
): VerifiedBid {
  const bid = bidSchema.parse(value);
  const terms = bidRequestSchema.parse(parseJson(request.content));
  requireCondition(
    bid.bid_request_id === request.id &&
      bid.impression_id === terms.impression_id,
    "wrong_opportunity",
  );
  requireCondition(bid.commitment.bidder_pubkey === sender, "bidder_mismatch");
  requireCondition(
    terms.banner_sizes.some(
      (s) => s.width === bid.creative.width && s.height === bid.creative.height,
    ),
    "creative_size_mismatch",
  );
  requireCondition(
    hashHex(bid.payment) === bid.commitment.payment_hash &&
      hashHex(bid.creative.content) === bid.commitment.creative_hash,
    "commitment_mismatch",
  );
  const payment = verifyPayment(bid.payment, terms, sender);
  requireCondition(
    payment.grossAmount === BigInt(bid.amount_sat),
    "amount_mismatch",
  );
  const auth = {
    request,
    payment: bid.payment,
    bid_nonce: bid.bid_nonce,
    creative: bid.creative,
    commitment: bid.commitment,
    outputs: [],
  };
  requireCondition(
    verifySignature(
      bid.commitment.sig,
      commitmentDigest(auth, terms.impression_id),
      payment.refundKey,
    ),
    "invalid_commitment",
  );
  const pixel = `${terms.oracle.pixel_base}/${request.id}/${terms.impression_id}/${bid.bid_nonce}`;
  validateCreative(bid.creative.content, pixel);
  const token = decodePayment(bid.payment);
  const mint = config.mints.find((m) => m.url === token.m);
  requireCondition(mint, "mint_not_accepted");
  let fees = 0n;
  let refundAt = Number.MAX_SAFE_INTEGER;
  const inputs = token.t.flatMap((group) => {
    const keys = resolveKeyset(hex(group.i), mint.keysets);
    requireCondition(
      !keys.final_expiry || keys.final_expiry > now,
      "expired_keyset",
    );
    return group.p.map((p) => {
      const amount = Number(p.a);
      requireCondition(Number.isSafeInteger(amount), "invalid_amount");
      const key = keys.keys[String(amount)];
      requireCondition(key && p.d, "missing_dleq_or_mint_key");
      requireCondition(
        verifyProofDleq(p.s, hex(p.c), key, {
          e: hex(p.d.e),
          s: hex(p.d.s),
          r: hex(p.d.r),
        }),
        "invalid_dleq",
      );
      const condition = parseJson(p.s) as [string, { tags: string[][] }];
      const locktime = Number(
        condition[1].tags.find((t) => t[0] === "locktime")![1],
      );
      requireCondition(
        Number.isSafeInteger(locktime) && locktime > now,
        "refund_eligible",
      );
      refundAt = Math.min(refundAt, locktime);
      fees += BigInt(keys.input_fee_ppk);
      return { id: keys.id, amount, secret: p.s, C: hex(p.c) };
    });
  });
  const net = Number(payment.grossAmount - (fees + 999n) / 1000n);
  requireCondition(
    Number.isSafeInteger(net) && net > 0,
    "nonpositive_proceeds",
  );
  const outputKeyset = mint.keysets.find(
    (k) => k.active && (!k.final_expiry || k.final_expiry > now),
  );
  requireCondition(outputKeyset, "no_output_keyset");
  denominations(net, outputKeyset);
  return {
    bid,
    mint: mint.url,
    inputs,
    net,
    refundAt,
    outputKeyset,
    proofIds: inputs.map((p) => hashHex(mint.url + "\0" + p.secret)),
  };
}

export function createPlan(bid: VerifiedBid): SwapPlan {
  return {
    inputs: bid.inputs,
    outputs: denominations(bid.net, bid.outputKeyset).map((amount) => {
      const secret = randomHex();
      const r = hex(secp256k1.utils.randomSecretKey());
      return {
        amount,
        id: bid.outputKeyset.id,
        B_: blind(secret, r),
        secret,
        r,
        mintKey: bid.outputKeyset.keys[String(amount)]!,
      };
    }),
  };
}
