import { createPublisher, MAX_BODY_BYTES } from "./app";
import { readConfig } from "./config";
import { createRelayTransport } from "./relay";
import { createSettlementWorker } from "./settlement";
import { openStore } from "./store";

process.umask(0o077);
const config = readConfig();
const store = openStore(config.databasePath);
store.recoverCollecting();
const relay = createRelayTransport(
  config.relays,
  config.identityKey,
  config.networkTimeoutMs,
);
const worker = createSettlementWorker(config, store);
const server = Bun.serve({
  hostname: config.hostname,
  port: config.port,
  maxRequestBodySize: MAX_BODY_BYTES,
  idleTimeout: Math.min(
    255,
    config.auctionSeconds + Math.ceil(config.networkTimeoutMs / 1000) + 5,
  ),
  fetch: createPublisher(config, store, relay),
});
worker.start();
console.info(
  `Publisher listening at ${server.url}; public URL ${config.publicUrl}`,
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, async () => {
    if (stopping) return;
    stopping = true;
    await server.stop();
    relay.close();
    await worker.stop();
    store.close();
  });
