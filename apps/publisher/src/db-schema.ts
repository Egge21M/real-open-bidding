import {
  integer,
  sqliteTable,
  text,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import type { SignedEvent } from "./schemas";
import type { SwapPlan, VerifiedBid, Input } from "./bids";

export const auctions = sqliteTable("auctions", {
  bidRequestId: text("bid_request_id").primaryKey(),
  request: text("request", { mode: "json" }).$type<SignedEvent>().notNull(),
  paymentKey: text("payment_key").notNull(),
  origin: text("origin").notNull(),
  placement: text("placement").notNull(),
  closesAt: integer("closes_at").notNull(),
  state: text("state", {
    enum: ["collecting", "no_fill", "selected", "failed"],
  }).notNull(),
  selected: text("selected", { mode: "json" }).$type<VerifiedBid>(),
  creativeToken: text("creative_token").unique(),
  plan: text("plan", { mode: "json" }).$type<SwapPlan>(),
  oracleSignature: text("oracle_signature"),
  phase: text("phase", {
    enum: ["pending", "authorized", "submitted", "settled", "failed"],
  })
    .notNull()
    .default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at").notNull().default(0),
  lastError: text("last_error"),
});
export const proofClaims = sqliteTable("proof_claims", {
  proofId: text("proof_id").primaryKey(),
  bidRequestId: text("bid_request_id").notNull(),
  bidNonce: text("bid_nonce").notNull(),
});
export const bidReceipts = sqliteTable(
  "bid_receipts",
  {
    bidRequestId: text("bid_request_id").notNull(),
    bidNonce: text("bid_nonce").notNull(),
    payloadHash: text("payload_hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.bidRequestId, t.bidNonce] })],
);
export const proceeds = sqliteTable("proceeds", {
  proofId: text("proof_id").primaryKey(),
  bidRequestId: text("bid_request_id").notNull(),
  mint: text("mint").notNull(),
  amount: integer("amount").notNull(),
  proof: text("proof", { mode: "json" }).$type<Input>().notNull(),
});
export type Auction = typeof auctions.$inferSelect;
