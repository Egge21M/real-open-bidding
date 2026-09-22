import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const callbacks = sqliteTable(
  "callbacks",
  {
    requestId: text("request_id").notNull(),
    impressionId: text("impression_id").notNull(),
    bidNonce: text("bid_nonce").notNull(),
    observedAt: integer("observed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.impressionId, t.bidNonce] })],
);

export const authorizations = sqliteTable(
  "authorizations",
  {
    requestId: text("request_id").notNull(),
    impressionId: text("impression_id").notNull(),
    bidNonce: text("bid_nonce").notNull(),
    commitment: text("commitment").notNull(),
    payment: text("payment").notNull(),
    outputs: text("outputs").notNull(),
    oraclePubkey: text("oracle_pubkey").notNull(),
    signature: text("signature").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.impressionId] })],
);
