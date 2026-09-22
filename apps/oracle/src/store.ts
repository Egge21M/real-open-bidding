import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { callbacks, authorizations } from "./db-schema";
import { requireCondition } from "./errors";
import type { AuthorizationRequest } from "./schemas";

export function openStore(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true, strict: true });
  try {
    sqlite.exec(
      "PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
    );
    const db = drizzle(sqlite);
    migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
    return {
      observe(
        requestId: string,
        impressionId: string,
        bidNonce: string,
        now: number,
      ) {
        db.insert(callbacks)
          .values({ requestId, impressionId, bidNonce, observedAt: now })
          .onConflictDoNothing()
          .run();
      },
      authorize(
        auth: AuthorizationRequest,
        impressionId: string,
        oraclePubkey: string,
        now: number,
        sign: () => string,
      ) {
        const requestId = auth.request.id;
        const commitment = JSON.stringify(auth.commitment);
        const outputs = JSON.stringify(auth.outputs);
        // BEGIN IMMEDIATE serializes competing writers, including other processes.
        // The transaction commits before its signature can leave this function.
        return db.transaction(
          (tx) => {
            const prior = tx
              .select()
              .from(authorizations)
              .where(
                and(
                  eq(authorizations.requestId, requestId),
                  eq(authorizations.impressionId, impressionId),
                ),
              )
              .get();
            if (prior) {
              requireCondition(
                prior.bidNonce === auth.bid_nonce &&
                  prior.commitment === commitment &&
                  prior.payment === auth.payment &&
                  prior.outputs === outputs &&
                  prior.oraclePubkey === oraclePubkey,
                "authorization_conflict",
                409,
              );
              return prior.signature;
            }
            const callback = tx
              .select()
              .from(callbacks)
              .where(
                and(
                  eq(callbacks.requestId, requestId),
                  eq(callbacks.impressionId, impressionId),
                  eq(callbacks.bidNonce, auth.bid_nonce),
                ),
              )
              .get();
            requireCondition(callback, "pixel_not_observed", 409);
            const signature = sign();
            tx.insert(authorizations)
              .values({
                requestId,
                impressionId,
                bidNonce: auth.bid_nonce,
                commitment,
                payment: auth.payment,
                outputs,
                oraclePubkey,
                signature,
                createdAt: now,
              })
              .run();
            return signature;
          },
          { behavior: "immediate" },
        );
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
export type OracleStore = ReturnType<typeof openStore>;
