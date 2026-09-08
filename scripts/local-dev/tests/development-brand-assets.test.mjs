#!/usr/bin/env node
/**
 * The approved Vacilando logo is wired to every brand surface.
 *
 * WHAT THIS GUARDS. Icon sets rot silently: a manifest keeps pointing at a file
 * nobody regenerated, a favicon link is never added at all, or a stale vector
 * source quietly reinstates the previous brand the next time someone runs the
 * icon renderer. None of that fails a build — it just ships the wrong logo — so
 * the wiring is asserted here instead.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUB = join(HERE, "..", "apps", "vacilando", "public");
const DESK = join(HERE, "..", "apps", "vacilando-desktop", "assets");
const html = readFileSync(join(PUB, "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(join(PUB, "manifest.webmanifest"), "utf8"));
const css = readFileSync(join(PUB, "styles.css"), "utf8");

/** Minimal PNG header read: dimensions and colour type. */
function pngInfo(path) {
  const b = readFileSync(path);
  assert.equal(b.readUInt32BE(0), 0x89504e47, `${path} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25], bytes: b.length };
}

test("every icon the manifest names actually exists at the size it claims", () => {
  assert.ok(manifest.icons.length >= 3);
  for (const icon of manifest.icons) {
    const file = join(PUB, icon.src.replace(/^\//, ""));
    assert.ok(existsSync(file), `${icon.src} is referenced but missing`);
    const [w, h] = icon.sizes.split("x").map(Number);
    const info = pngInfo(file);
    assert.equal(info.width, w, `${icon.src} width`);
    assert.equal(info.height, h, `${icon.src} height`);
  }
});

test("a maskable icon is declared, so Android does not crop the artwork", () => {
  const maskable = manifest.icons.find((i) => i.purpose === "maskable");
  assert.ok(maskable, "no maskable icon declared");
  assert.ok(existsSync(join(PUB, maskable.src.replace(/^\//, ""))));
});

test("the page declares a favicon at all", () => {
  // There was no rel=icon link whatsoever before this: the tab fell back to
  // whatever the browser guessed.
  assert.match(html, /<link rel="icon" href="favicon\.ico"/);
  assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="favicon-32\.png">/);
  assert.match(html, /<link rel="icon" type="image\/png" sizes="16x16" href="favicon-16\.png">/);
  assert.match(html, /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/);
});

test("favicon.ico is a real multi-image ICO, not a renamed PNG", () => {
  const b = readFileSync(join(PUB, "favicon.ico"));
  assert.equal(b.readUInt16LE(0), 0, "reserved word");
  assert.equal(b.readUInt16LE(2), 1, "ICO type");
  const count = b.readUInt16LE(4);
  assert.equal(count, 3, "16, 32 and 48 should all be present");
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    const o = 6 + i * 16;
    sizes.push(b[o] === 0 ? 256 : b[o]);
    // Each entry must point at real bytes inside the file.
    const len = b.readUInt32LE(o + 8);
    const off = b.readUInt32LE(o + 12);
    assert.ok(len > 0 && off + len <= b.length, `entry ${i} is out of bounds`);
  }
  assert.deepEqual(sizes.sort((a, c) => a - c), [16, 32, 48]);
});

test("icons carry an alpha channel, so a rounded mask has something to cut", () => {
  for (const f of ["icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon-32.png"]) {
    // PNG colour type 6 is RGBA.
    assert.equal(pngInfo(join(PUB, f)).colorType, 6, `${f} has no alpha`);
  }
});

test("the header renders the approved mark with its true intrinsic size", () => {
  assert.match(html, /class="brand-mark" src="vacilando-mark\.png"/);
  const m = html.match(/class="brand-mark"[^>]*width="(\d+)" height="(\d+)"/);
  assert.ok(m, "the mark declares no intrinsic size, so the rail will reflow");
  const info = pngInfo(join(PUB, "vacilando-mark.png"));
  assert.equal(Number(m[1]), info.width);
  assert.equal(Number(m[2]), info.height);
});

test("the mark is decorative, so it is not announced twice to a screen reader", () => {
  // The wordmark beside it already says "Vacilando".
  assert.match(html, /class="brand-mark"[^>]*alt=""/);
});

test("the rail mark sits on a deliberate light ground", () => {
  // MEASURED: dropped straight onto juniper the pine reads at 1.11:1 and the
  // river at 1.55:1 — the artwork is drawn for a light background.
  //
  // UI V2 CHANGED HOW THAT LIGHT GROUND IS PROVIDED, not whether it exists.
  // The mark used to paint its own cream plate inside a WHITE rail, so the
  // logo sat on a visibly different ground from the navigation containing it
  // — a cream rectangle floating in white. The rail is now the cream canvas
  // itself, so the mark needs no plate and the seam is gone. The contract that
  // matters is unchanged: the artwork must never end up on a dark ground.
  const rule = css.match(/\.brand-mark\{[^}]*\}/);
  assert.ok(rule, "no .brand-mark rule");
  const rail = css.match(/\n\.rail\{[^}]*\}/)?.[0] || "";
  assert.match(rail, /background:var\(--bg\)/, "the rail must be the light canvas the mark was drawn for");
  // And the mark must not reintroduce a competing plate on top of it.
  assert.match(rule[0], /background:transparent/);
  for (const dark of ["--rail-0", "--rail-1", "--rail-2", "--vacilando-juniper", "--vacilando-navy"]) {
    assert.equal(rail.includes(dark), false, `the rail must not paint ${dark} behind the mark`);
  }
});

test("theme colours are the brand's, not the retired forest green", () => {
  assert.match(html, /<meta name="theme-color" content="#365C4A">/);
  assert.equal(html.includes("#15402c"), false, "the retired rail colour is gone");
  assert.equal(manifest.theme_color, "#365C4A");
  assert.equal(manifest.background_color, "#f4efe6", "the manifest ground must track the V2 canvas token --bg");
});

test("the icon vector source is the approved artwork, not the retired scene", () => {
  // render-icon.js renders THIS file. Left stale, regenerating the icons would
  // have silently reinstated the old hand-drawn desert.
  const svg = readFileSync(join(DESK, "icon.svg"), "utf8");
  assert.match(svg, /data:image\/png;base64,/, "icon.svg no longer embeds the approved artwork");
  assert.equal(/linearGradient id="sky"/.test(svg), false, "the retired vector scene is still here");
});

test("native icons were rebuilt from the approved artwork", () => {
  const icns = readFileSync(join(DESK, "icon.icns"));
  assert.equal(icns.toString("ascii", 0, 4), "icns");
  assert.ok(icns.length > 100_000, "icns looks truncated");
  const png = pngInfo(join(DESK, "icon.png"));
  assert.equal(png.width, 512);
  assert.equal(png.colorType, 6);
});

test("brand assets stay within a sane weight budget", () => {
  // A 2.2:1 flat illustration should compress; if this jumps, something is
  // shipping an unquantised master.
  const total = ["vacilando-mark.png", "icon-512.png", "icon-192.png", "apple-touch-icon.png",
    "icon-maskable-512.png", "favicon.ico", "favicon-16.png", "favicon-32.png", "favicon-48.png"]
    .reduce((n, f) => n + statSync(join(PUB, f)).size, 0);
  assert.ok(total < 1_200_000, `web brand assets are ${Math.round(total / 1024)} KB`);
});

test("no retired brand artwork is still drawn in the app shell", () => {
  // The rail carried a second, hand-drawn palm-and-sunset desert scene in
  // colours the palette no longer contains, so the app showed two competing
  // desert illustrations at once — the approved one at the top of the rail and
  // the retired one at the bottom.
  for (const dead of ["#c8794a", "#c06a3f", "#a4512d", "#8a4527", "#f0b878", "#173f2a"]) {
    assert.equal(html.includes(dead), false, `retired brand colour ${dead} is still in the shell`);
  }
  assert.equal(/class="desert"/.test(html), false);
});

test("the server knows how to serve an .ico", () => {
  // Served as application/octet-stream, some browsers decline to use it as the
  // tab icon at all.
  const server = readFileSync(join(HERE, "..", "lib", "vacilando-server.mjs"), "utf8");
  assert.match(server, /"\.ico": "image\/x-icon"/);
});

test("no brand surface still points at a file that does not exist", () => {
  for (const ref of html.matchAll(/(?:href|src)="([^"]+\.(?:png|ico|webmanifest))"/g)) {
    assert.ok(existsSync(join(PUB, ref[1])), `${ref[1]} referenced by index.html is missing`);
  }
});
