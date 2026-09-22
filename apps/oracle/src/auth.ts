import { hashHex, verifyEvent } from "./crypto";
import { OracleError, requireCondition } from "./errors";
import { decodeUtf8, parseJson } from "./json";
import { eventSchema } from "./schemas";

export function authenticate(
  request: Request,
  body: Uint8Array,
  publicUrl: string,
  now: number,
): string {
  try {
    const header = request.headers.get("authorization");
    requireCondition(
      header && header.length <= 16_384 && header.startsWith("Nostr "),
      "unauthorized",
      401,
    );
    const encoded = header.slice(6);
    requireCondition(
      !encoded.includes("=") || encoded.length % 4 === 0,
      "unauthorized",
      401,
    );
    requireCondition(
      /^[A-Za-z0-9+/]+={0,2}$/.test(encoded),
      "unauthorized",
      401,
    );
    const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
    requireCondition(
      Buffer.from(bytes).toString("base64").replace(/=+$/, "") ===
        encoded.replace(/=+$/, ""),
      "unauthorized",
      401,
    );
    const event = eventSchema.parse(parseJson(decodeUtf8(bytes)));
    requireCondition(
      event.kind === 27235 && event.content === "" && verifyEvent(event),
      "unauthorized",
      401,
    );
    requireCondition(
      Math.abs(now - event.created_at) <= 60,
      "unauthorized",
      401,
    );
    const tag = (name: string) => {
      const matches = event.tags.filter((t) => t[0] === name);
      requireCondition(
        matches.length === 1 && matches[0]!.length === 2,
        "unauthorized",
        401,
      );
      return matches[0]![1]!;
    };
    requireCondition(
      tag("u") === publicUrl && tag("method") === request.method,
      "unauthorized",
      401,
    );
    requireCondition(
      tag("payload").toLowerCase() === hashHex(body),
      "unauthorized",
      401,
    );
    return event.pubkey;
  } catch {
    throw new OracleError(401, "unauthorized");
  }
}
