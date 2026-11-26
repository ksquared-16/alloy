#!/usr/bin/env node
/**
 * A — THE SESSION WAS ALWAYS VALID. IT WAS FILED UNDER THE WRONG NAME.
 *
 * The application pins a cookie name for loopback runtimes
 * (`authCookieNameFor` → `sb-alloy-local-auth`). `vac-qa-session-mint` never
 * asked that question and derived `sb-${projectRef}-auth-token` unconditionally.
 * Against the certification project at 127.0.0.1:54421 the ref is "127", so the
 * mint wrote `sb-127-auth-token` while the running app read `sb-alloy-local-auth`.
 *
 * MEASURED A/B, same session value: `sb-127-auth-token` → 307 /login,
 * `sb-alloy-local-auth` → 200 authenticated.
 *
 * C — THE WRAPPER ABANDONED THE CHILD IT WAS AWAITING.
 *
 * `defaultSpawn` called `child.unref()`, removing the child from the event
 * loop's reference count while the caller was awaiting it. Node considered the
 * loop empty and exited mid-await:
 *
 *     Detected unsettled top-level await at vac-browser-auth.mjs:274
 *
 * The browser often survived, which is why it looked like it half worked. The
 * promise never settled, so verification never ran, slot verification was never
 * recorded, and no structured outcome was emitted.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const C = await import("../lib/vacilando/auth-cookie-identity.mjs");
const src = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

// ── A ────────────────────────────────────────────────────────────────────────
test("A1. the certification project resolves to the name the app actually reads", () => {
  assert.equal(C.authCookieNameForUrl("http://127.0.0.1:54421"), "sb-alloy-local-auth");
  // The old derivation, stated so the regression is unmistakable.
  assert.equal(C.projectRefFor("http://127.0.0.1:54421"), "127");
  assert.notEqual(C.authCookieNameForUrl("http://127.0.0.1:54421"), "sb-127-auth-token",
    "sb-127-auth-token is the name that produced 307 /login");
});

test("A2. every supported loopback host derives the same identity — not a Slot 8 exception", () => {
  for (const u of [
    "http://127.0.0.1:54321", "http://127.0.0.1:54421", "http://localhost:54321",
    "http://localhost:3000", "http://[::1]:54321", "http://0.0.0.0:54321",
  ]) {
    assert.equal(C.authCookieNameForUrl(u), "sb-alloy-local-auth", `${u} must use the pinned local name`);
  }
});

test("A3. hosted runtimes keep the library derivation — production is untouched", () => {
  assert.equal(C.authCookieNameForUrl("https://vslwnntzzgpnmrpjipat.supabase.co"), "sb-vslwnntzzgpnmrpjipat-auth-token");
  assert.equal(C.isLoopbackSupabaseUrl("https://vslwnntzzgpnmrpjipat.supabase.co"), false);
});

test("A4. the mint consumes the rule and no longer derives its own", () => {
  const mint = src("../vac-qa-session-mint.mjs");
  assert.match(mint, /authCookieNameForUrl\(supabaseUrl\)/, "it asks the canonical owner");
  const code = mint.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/const cookieName = `sb-\$\{projectRef\}-auth-token`/.test(code), false,
    "the independent derivation must be gone, not merely shadowed");
  assert.match(mint, /cookie_identity_unresolved/, "and an unresolvable identity fails loudly rather than guessing");
});

test("A5. THE DRIFT GUARD: the app and the helper cannot disagree again", () => {
  /*
   * Parsed from the application's own file. If either side moves, this fails.
   *
   * The toolkit ships scripts/local-dev only, so when this runs from an
   * INSTALLED toolkit the app source is genuinely absent. That is stated and
   * skipped rather than failed — but never silently: the control asserts it is
   * really in an installed layout before it declines, so a missing file in a
   * repo checkout still fails loudly.
   */
  const candidates = [
    "../../../web/lib/supabase/browserTransport.ts",
    "../../../../web/lib/supabase/browserTransport.ts",
  ];
  let app = null;
  for (const c of candidates) {
    try { app = src(c); break; } catch { /* try the next layout */ }
  }
  if (app === null) {
    let repoHere = true;
    try { src("../../../web/package.json"); } catch { repoHere = false; }
    assert.equal(repoHere, false,
      "the app source is missing from a checkout that DOES have web/ — that is a real failure, not a layout difference");
    process.stdout.write("      (installed toolkit: app source not shipped; guard runs in the repo)\n");
    return;
  }
  const appConst = app.match(/LOCAL_AUTH_COOKIE_NAME\s*=\s*"([^"]+)"/)?.[1];
  assert.equal(appConst, C.LOCAL_AUTH_COOKIE_NAME,
    `app pins ${appConst}, helper pins ${C.LOCAL_AUTH_COOKIE_NAME}`);
  // NB: the host list contains "[::1]", so a [^\]]+ class stops early and silently
  // parses three of five. Take the whole Set(...) call and pull the strings out.
  const appHosts = app.match(/LOOPBACK_HOSTS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || "";
  const parsed = [...appHosts.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  assert.equal(parsed.length, 5, `expected the full host list, parsed ${parsed.length}: ${parsed.join(",")}`);
  assert.deepEqual(parsed, [...C.LOOPBACK_HOSTS].sort(),
    "the loopback host sets must match exactly, or the two disagree about what 'local' means");
  assert.match(app, /isLoopbackSupabaseUrl\(canonical\) \? LOCAL_AUTH_COOKIE_NAME : null/,
    "the app rule is still loopback-pinned / hosted-derived");
});

// ── C ────────────────────────────────────────────────────────────────────────
test("C1. the awaited child is never unref'd", () => {
  const code = src("../lib/vacilando/browser-auth.mjs").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const fn = code.slice(code.indexOf("function defaultSpawn"), code.indexOf("export function redactAuthText"));
  assert.equal(/child\.unref/.test(fn), false,
    "unref on an awaited child is what produced the unsettled top-level await");
  assert.match(fn, /timeout: timeoutMs/, "the child is bounded by an explicit timeout");
  assert.match(fn, /killSignal: "SIGTERM"/, "and the kill is deterministic");
});

test("C2. every outcome settles the promise", async () => {
  const B = await import("../lib/vacilando/browser-auth.mjs");
  const cases = [
    ["success",  { ok: true, stdout: "done", stderr: "" }],
    ["failure",  { ok: false, stderr: "boom", error: "exit 1" }],
    ["timeout",  { ok: false, timedOut: true }],
    ["cancel",   { ok: false, cancelled: true }],
  ];
  for (const [label, result] of cases) {
    const out = await B.beginBrowserAuthCapture(
      { slot: 8, base_url: "http://127.0.0.1:3018", expected_identity: "qa-slot8-x@example.com" },
      { spawn: async () => result, timeoutMs: 500, loginCommand: "/bin/true" },
    );
    assert.ok(out && typeof out.ok === "boolean", `${label} settled with a structured outcome`);
    assert.ok(out.state, `${label} reports a state`);
  }
});

test("C3. cancellation ends the child rather than abandoning it", () => {
  const code = src("../lib/vacilando/browser-auth.mjs");
  assert.match(code, /onChild/, "the child handle reaches the caller");
  assert.match(code, /record\.cancel = \(\) => \{ try \{ child\.kill\("SIGTERM"\)/,
    "cancel kills the child; a cancelled capture must not leave a browser nobody owns");
});

test("C4. the CLI awaits the wrapper and emits a structured outcome", () => {
  const cli = src("../vac-browser-auth.mjs");
  assert.match(cli, /await beginBrowserAuthCapture\(/, "the wrapper is awaited");
  assert.match(cli, /verifyBrowserAuth\(/, "verification runs after capture");
  assert.match(cli, /recordSlotVerification\(/, "slot verification is recorded");
  assert.match(cli, /publicAuthOutcome\(/, "and a structured outcome is emitted");
  // Ordering within the sign-in path itself — the import block lists all four
  // names at the top of the file, so indexOf over the whole source proves nothing.
  const signIn = cli.slice(cli.indexOf("const began = await beginBrowserAuthCapture("));
  assert.ok(signIn.length > 0, "the sign-in path is where the control expects it");
  assert.ok(signIn.indexOf("verifyBrowserAuth(") > 0, "verification follows capture");
  assert.ok(signIn.indexOf("verifyBrowserAuth(") < signIn.indexOf("recordSlotVerification("),
    "and recording follows verification");
  assert.ok(signIn.indexOf("recordSlotVerification(") < signIn.lastIndexOf("publicAuthOutcome("),
    "with the structured outcome emitted last");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
