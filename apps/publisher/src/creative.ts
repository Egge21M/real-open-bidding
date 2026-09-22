import { parse, type DefaultTreeAdapterMap } from "parse5";
import { transform, transformStyleAttribute } from "lightningcss";
import { requireCondition } from "./errors";

function resourceUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    requireCondition(false, "relative_creative_url");
  }
  requireCondition(
    url!.protocol === "https:" && !url!.username && !url!.password,
    "insecure_creative_url",
  );
}

function validateCss(value: string, inline: boolean) {
  const code = Buffer.from(value);
  const result = inline
    ? transformStyleAttribute({ code, analyzeDependencies: true })
    : transform({ filename: "creative.css", code, analyzeDependencies: true });
  for (const dependency of result.dependencies ?? []) {
    if (dependency.type === "url" || dependency.type === "import") {
      if (!dependency.url.startsWith("#")) resourceUrl(dependency.url);
    }
  }
  // The parser's output is discarded; the original committed HTML/CSS is served.
}

export function validateCreative(html: string, pixel: string) {
  requireCondition(html.isWellFormed(), "invalid_creative");
  const pending: DefaultTreeAdapterMap["node"][] = [parse(html)];
  let hasPixel = false;
  while (pending.length) {
    const node = pending.pop()!;
    if ("tagName" in node) {
      requireCondition(
        !["base", "iframe", "object", "embed", "form"].includes(node.tagName),
        "unsupported_creative",
      );
      if (node.tagName === "style")
        validateCss(
          node.childNodes
            .filter((n) => "value" in n)
            .map((n) => (n as DefaultTreeAdapterMap["textNode"]).value)
            .join(""),
          false,
        );
      for (const attr of node.attrs) {
        if (attr.name === "style") validateCss(attr.value, true);
        if (node.tagName === "meta" && attr.name === "http-equiv")
          requireCondition(false, "unsupported_creative");
        // Complex srcsets can hide relative URLs. The initial common-profile implementation
        // accepts explicit src instead; the response CSP also constrains dynamic resources.
        requireCondition(attr.name !== "srcset", "unsupported_creative");
        if (
          [
            "src",
            "href",
            "poster",
            "action",
            "data",
            "xlink:href",
            "background",
          ].includes(attr.name)
        ) {
          if (attr.value.startsWith("#") && attr.name === "href") continue;
          resourceUrl(attr.value);
        }
      }
      if (
        node.tagName === "img" &&
        node.attrs.some((a) => a.name === "src" && a.value === pixel)
      )
        hasPixel = true;
      if ("content" in node)
        pending.push((node as DefaultTreeAdapterMap["template"]).content);
    }
    if ("childNodes" in node) pending.push(...node.childNodes);
  }
  requireCondition(hasPixel, "missing_pixel");
}

export function creativeHeaders(origin: string): HeadersInit {
  const directives = [
    "default-src 'none'",
    "script-src https: 'unsafe-inline'",
    "style-src https: 'unsafe-inline'",
    "img-src https:",
    "font-src https:",
    "connect-src https:",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    `frame-ancestors ${origin}`,
    "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
  ];
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": directives.join("; "),
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
}
