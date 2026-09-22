import { visit } from "jsonc-parser";
import { OracleError } from "./errors";

// Reject ambiguous JSON before any security-sensitive field is interpreted.
export function parseJson(text: string): unknown {
  const objects: Set<string>[] = [];
  let depth = 0;
  const invalid = () => {
    throw new OracleError(400, "invalid_json");
  };
  const enter = () => {
    if (++depth > 64) invalid();
  };
  visit(
    text,
    {
      onObjectBegin() {
        enter();
        objects.push(new Set());
      },
      onObjectProperty(name) {
        const keys = objects.at(-1)!;
        if (keys.has(name) || !name.isWellFormed()) invalid();
        keys.add(name);
      },
      onObjectEnd() {
        objects.pop();
        depth--;
      },
      onArrayBegin: enter,
      onArrayEnd() {
        depth--;
      },
      onLiteralValue(value) {
        if (typeof value === "string" && !value.isWellFormed()) invalid();
        if (typeof value === "number" && !Number.isFinite(value)) invalid();
      },
      onError: invalid,
    },
    { disallowComments: true, allowTrailingComma: false },
  );
  try {
    return JSON.parse(text);
  } catch {
    return invalid();
  }
}

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new OracleError(400, "invalid_utf8");
  }
}
