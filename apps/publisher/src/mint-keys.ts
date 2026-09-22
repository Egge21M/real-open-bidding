import { z } from "zod";
import { secureUrl } from "./config";
import { keysetSchema } from "./schemas";
import { jsonResponse } from "./settlement";

// Explicit provisioning only. This command is never called on an auction path.
const url = secureUrl.parse(process.argv[2]).replace(/\/$/, "");
const get = async (path: string) => {
  const response = await fetch(url + path, {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Mint key provisioning failed");
  return jsonResponse(response);
};
const metadata = z
  .object({
    keysets: z
      .array(
        keysetSchema.omit({ keys: true }).extend({ unit: z.string() }).strip(),
      )
      .max(1024),
  })
  .parse(await get("/v1/keysets"));
const keysets = await Promise.all(
  metadata.keysets
    .filter((k) => k.unit === "sat")
    .map(async (meta) => {
      const response = z
        .object({
          keysets: z.array(
            keysetSchema.pick({ id: true, unit: true, keys: true }).strip(),
          ),
        })
        .parse(await get("/v1/keys/" + meta.id));
      const keys = response.keysets.find(
        (k) => k.id === meta.id && k.unit === meta.unit,
      );
      if (!keys) throw new Error("Mint returned mismatched keyset");
      return { ...meta, keys: keys.keys };
    }),
);
console.info(JSON.stringify({ url, keysets }, null, 2));
