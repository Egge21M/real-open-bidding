import { createOracle, MAX_BODY_BYTES } from "./app";
import { readConfig } from "./config";
import { openStore } from "./store";

const config = readConfig();
const store = openStore(config.databasePath);
const server = Bun.serve({
  hostname: config.hostname,
  port: config.port,
  maxRequestBodySize: MAX_BODY_BYTES,
  fetch: createOracle(config, store),
});
console.info(
  `Oracle listening on ${server.url}; public authorization URL: ${config.authorizationUrl}`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await server.stop();
    store.close();
  });
}
