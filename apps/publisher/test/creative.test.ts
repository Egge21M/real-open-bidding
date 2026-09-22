import { expect, test } from "bun:test";
import { validateCreative } from "../src/creative";

const pixel = "https://oracle.example/pixel/a/b/c";
const image = `<img src="${pixel}">`;
test("creative validation accepts absolute HTTPS CSS and never rewrites signed HTML", () => {
  const html = `<style>@import "https://assets.example/a.css"; body{background:url(https://assets.example/bg.png)}</style><div style="color:red"></div>${image}`;
  expect(() => validateCreative(html, pixel)).not.toThrow();
});
test("relative resources, policy injection and unsupported embedded documents are ineligible", () => {
  for (const markup of [
    '<img src="/relative.png">',
    '<div style="background:url(relative.png)"></div>',
    '<style>@import "relative.css";</style>',
    "<style>body { background: u\\72l(relative.png) }</style>",
    '<template><img src="relative.png"></template>',
    '<base href="https://elsewhere.example">',
    '<iframe src="https://elsewhere.example"></iframe>',
    '<meta http-equiv="refresh" content="0;url=https://elsewhere.example">',
  ])
    expect(() => validateCreative(markup + image, pixel)).toThrow();
  expect(() => validateCreative("<p>No pixel</p>", pixel)).toThrow(
    "missing_pixel",
  );
});
