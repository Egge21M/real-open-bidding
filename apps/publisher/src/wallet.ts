import { existsSync } from "node:fs";
import { encode } from "cborg";
import { readConfig } from "./config";
import { openStore } from "./store";
import { unhex } from "./crypto";

process.umask(0o077);
const mode = process.argv[2] ?? "status";
if (mode !== "status" && mode !== "export")
  throw new Error("Usage: bun run wallet [status|export]");
const config = readConfig();
if (!existsSync(config.databasePath))
  throw new Error("Publisher database does not exist");
const store = openStore(config.databasePath);
try {
  if (mode === "status")
    console.info(
      JSON.stringify(
        { recordedProceeds: store.balance(), payments: store.paymentStatus() },
        null,
        2,
      ),
    );
  else {
    // Export copies retained bearer proofs; it neither spends nor deletes them.
    const saved = store.exportProofs();
    const tokens = Array.from(new Set(saved.map((row) => row.mint))).map(
      (mint) => {
        const proofs = saved
          .filter((row) => row.mint === mint)
          .map((row) => row.proof);
        const groups = Array.from(new Set(proofs.map((p) => p.id))).map(
          (id) => ({
            i: unhex(id),
            p: proofs
              .filter((p) => p.id === id)
              .map((p) => ({ a: p.amount, s: p.secret, c: unhex(p.C) })),
          }),
        );
        return {
          mint,
          token:
            "cashuB" +
            Buffer.from(encode({ m: mint, u: "sat", t: groups })).toString(
              "base64url",
            ),
        };
      },
    );
    console.info(JSON.stringify(tokens, null, 2));
  }
} finally {
  store.close();
}
