import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, eq, inArray, lte, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import {
  auctions,
  bidReceipts,
  proofClaims,
  proceeds,
  type Auction,
} from "./db-schema";
import type { Input, SwapPlan, VerifiedBid } from "./bids";
import { hashHex } from "./crypto";
import { requireCondition } from "./errors";

export function openStore(path: string) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path, { create: true, strict: true });
  try {
    if (path !== ":memory:") chmodSync(path, 0o600);
    sqlite.exec(
      "PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
    );
    const db = drizzle(sqlite);
    migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
    const get = (id: string) =>
      db.select().from(auctions).where(eq(auctions.bidRequestId, id)).get();
    return {
      create(value: typeof auctions.$inferInsert) {
        db.insert(auctions).values(value).run();
      },
      get,
      recoverCollecting() {
        db.update(auctions)
          .set({ state: "failed", lastError: "interrupted_auction" })
          .where(eq(auctions.state, "collecting"))
          .run();
      },
      claim(bid: VerifiedBid): boolean {
        return db.transaction(
          (tx) => {
            const prior = tx
              .select()
              .from(bidReceipts)
              .where(
                and(
                  eq(bidReceipts.bidRequestId, bid.bid.bid_request_id),
                  eq(bidReceipts.bidNonce, bid.bid.bid_nonce),
                ),
              )
              .get();
            const payloadHash = hashHex(JSON.stringify(bid.bid));
            if (prior) {
              requireCondition(
                prior.payloadHash === payloadHash,
                "bid_nonce_conflict",
              );
              return false;
            }
            const used = tx
              .select()
              .from(proofClaims)
              .where(inArray(proofClaims.proofId, bid.proofIds))
              .get();
            requireCondition(!used, "proof_reuse");
            tx.insert(bidReceipts)
              .values({
                bidRequestId: bid.bid.bid_request_id,
                bidNonce: bid.bid.bid_nonce,
                payloadHash,
              })
              .run();
            tx.insert(proofClaims)
              .values(
                bid.proofIds.map((proofId) => ({
                  proofId,
                  bidRequestId: bid.bid.bid_request_id,
                  bidNonce: bid.bid.bid_nonce,
                })),
              )
              .run();
            return true;
          },
          { behavior: "immediate" },
        );
      },
      finish(
        id: string,
        selection?: { bid: VerifiedBid; plan: SwapPlan; token: string },
      ) {
        const result = db
          .update(auctions)
          .set(
            selection
              ? {
                  state: "selected",
                  selected: selection.bid,
                  plan: selection.plan,
                  creativeToken: selection.token,
                }
              : { state: "no_fill" },
          )
          .where(
            and(
              eq(auctions.bidRequestId, id),
              eq(auctions.state, "collecting"),
            ),
          )
          .returning()
          .get();
        requireCondition(result, "auction_already_finished", 409);
        return result;
      },
      fail(id: string, code: string) {
        db.update(auctions)
          .set({ state: "failed", lastError: code })
          .where(
            and(
              eq(auctions.bidRequestId, id),
              eq(auctions.state, "collecting"),
            ),
          )
          .run();
      },
      creative(token: string) {
        return db
          .select()
          .from(auctions)
          .where(
            and(
              eq(auctions.creativeToken, token),
              eq(auctions.state, "selected"),
            ),
          )
          .get();
      },
      pending(
        now: number,
        options: {
          phases?: Auction["phase"][];
          exclude?: string[];
          limit?: number;
        } = {},
      ) {
        return db
          .select()
          .from(auctions)
          .where(
            and(
              eq(auctions.state, "selected"),
              inArray(
                auctions.phase,
                options.phases ?? ["pending", "authorized", "submitted"],
              ),
              lte(auctions.nextAttemptAt, now),
              options.exclude?.length
                ? notInArray(auctions.bidRequestId, options.exclude)
                : undefined,
            ),
          )
          .orderBy(
            asc(auctions.nextAttemptAt),
            asc(auctions.closesAt),
            asc(auctions.bidRequestId),
          )
          .limit(options.limit ?? 50)
          .all();
      },
      update(
        id: string,
        changes: Partial<
          Pick<
            Auction,
            "phase" | "oracleSignature" | "lastError" | "nextAttemptAt"
          >
        >,
      ) {
        db.update(auctions)
          .set({ ...changes, attempts: sql`${auctions.attempts} + 1` })
          .where(eq(auctions.bidRequestId, id))
          .run();
      },
      settle(id: string, proofs: Input[]) {
        db.transaction(
          (tx) => {
            const auction = tx
              .select()
              .from(auctions)
              .where(eq(auctions.bidRequestId, id))
              .get();
            requireCondition(
              auction?.selected && auction.plan,
              "unknown_auction",
            );
            if (auction.phase === "settled") return;
            requireCondition(
              proofs.reduce((n, p) => n + p.amount, 0) === auction.selected.net,
              "settlement_amount_mismatch",
            );
            for (const proof of proofs)
              tx.insert(proceeds)
                .values({
                  proofId: hashHex(auction.selected.mint + "\0" + proof.secret),
                  bidRequestId: id,
                  mint: auction.selected.mint,
                  amount: proof.amount,
                  proof,
                })
                .run();
            tx.update(auctions)
              .set({ phase: "settled", lastError: null })
              .where(eq(auctions.bidRequestId, id))
              .run();
          },
          { behavior: "immediate" },
        );
      },
      balance() {
        return db
          .select({
            mint: proceeds.mint,
            amount: sql<number>`sum(${proceeds.amount})`.mapWith(Number),
          })
          .from(proceeds)
          .groupBy(proceeds.mint)
          .all();
      },
      paymentStatus() {
        return db
          .select({
            bidRequestId: auctions.bidRequestId,
            phase: auctions.phase,
            lastError: auctions.lastError,
            nextAttemptAt: auctions.nextAttemptAt,
          })
          .from(auctions)
          .where(eq(auctions.state, "selected"))
          .all();
      },
      exportProofs() {
        return db.select().from(proceeds).all();
      },
      close() {
        sqlite.close();
      },
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
export type PublisherStore = ReturnType<typeof openStore>;
