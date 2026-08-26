#!/usr/bin/env node
/**
 * Operator-facing browser-authentication recovery.
 *
 * THE FAILURE. Slot 5's storage state stopped working, the app answered
 * `refresh_token_not_found`, `/workspace` bounced to `/login`, and Vacilando had
 * nothing to say about it — no status, no action, no way back. The Director's
 * only route was a terminal.
 *
 * THE PART THAT MUST NEVER REGRESS. A person types the password. The agent may
 * start the capture and abandon it; it must never be able to complete one, see a
 * credential, or write one into a durable record. And the flow must refuse to
 * drive a browser anywhere but the slot's own loopback base, because a sign-in
 * button that can be pointed at an arbitrary host is a phishing surface with
 * Vacilando's name on it.
 *
 * Every refusal below carries a positive control, and the status path is
 * asserted NOT to claim more than it knows — metadata cannot prove a session
 * works, which is exactly how this failure stayed invisible.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
  BROWSER_AUTH_STATES, BROWSER_AUTH_REFUSALS, SLOT_PORTS,
  isLoopbackBase, readSlotAuthStatus, validateBrowserAuthRequest,
  classifyVerification, publicAuthOutcome, browserAuthHeadline,
  blocksExecution, redactAuthText, beginBrowserAuthCapture,
  captureInFlight, resetCapturesForTests, slotAuthStoragePath,
  attachLaneBrowserAuth, recordSlotVerification, readSlotVerification, laneSlot,
  legacySlotAuthStoragePath,
} = await import("../lib/vacilando/browser-auth.mjs");

let pass = 0;
let fail = 0;

async function test(name, fn) {
  resetCapturesForTests();
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

/** A state root with a slot's storage written into it. */
function makeRoot({ slot = 5, cookies = null, write = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "vac-auth-"));
  if (write) {
    const dir = join(root, "auth", `slot${slot}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "storage-state.json"), JSON.stringify({
      cookies: cookies ?? [{ name: "sb-proj-auth-token", value: "SECRET-VALUE", expires: 2_000_000_000 }],
      origins: [],
    }));
  }
  return root;
}

const laneFor = (wt, id = "lane_rt") => ({ lane_id: id, binding: { worktree_path: wt } });
const WT = "/Users/Kelly/Code/alloy-worktrees/wt5-runtime-performance-ux-completion";
const IDENTITY = "qa-slot5-refactor@example.com";

// ------------------------------------------------- states

await test("every required state exists and has an operator-facing headline", () => {
  for (const key of ["VALID", "MISSING", "EXPIRED", "AWAITING_OPERATOR", "VERIFYING",
    "RESTORED", "CANCELLED", "TIMED_OUT", "WRONG_IDENTITY", "VERIFICATION_FAILED"]) {
    assert.ok(BROWSER_AUTH_STATES[key], `${key} missing`);
    const h = browserAuthHeadline(BROWSER_AUTH_STATES[key], 5);
    assert.ok(h && h.length > 3, `${key} has no headline`);
  }
  // The one the Director must see when the lane is blocked, verbatim.
  assert.equal(browserAuthHeadline(BROWSER_AUTH_STATES.EXPIRED, 5),
    "Browser session expired — Re-authentication required");
  assert.equal(browserAuthHeadline(BROWSER_AUTH_STATES.MISSING, 5),
    "Browser session expired — Re-authentication required");
  assert.equal(browserAuthHeadline(BROWSER_AUTH_STATES.RESTORED, 5),
    "Browser session restored for slot 5");
});

await test("only the states that really block execution do", () => {
  for (const s of ["MISSING", "EXPIRED", "WRONG_IDENTITY", "VERIFICATION_FAILED", "TIMED_OUT", "CANCELLED"]) {
    assert.equal(blocksExecution(BROWSER_AUTH_STATES[s]), true, s);
  }
  // POSITIVE CONTROL: a run in progress or already restored is not blocked.
  for (const s of ["VALID", "RESTORED", "AWAITING_OPERATOR", "VERIFYING"]) {
    assert.equal(blocksExecution(BROWSER_AUTH_STATES[s]), false, s);
  }
});

// ------------------------------------------------- status, without overclaiming

await test("a missing storage file reads as missing", () => {
  const root = makeRoot({ write: false });
  const s = readSlotAuthStatus(5, { root });
  assert.equal(s.state, BROWSER_AUTH_STATES.MISSING);
  assert.equal(s.exists, false);
});

await test("a self-expired cookie reads as expired", () => {
  const root = makeRoot({ cookies: [{ name: "sb-x", value: "v", expires: 1_000 }] });
  assert.equal(readSlotAuthStatus(5, { root }).state, BROWSER_AUTH_STATES.EXPIRED);
});

await test("metadata never claims a session is verified", () => {
  // THIS IS HOW THE FAILURE HID. Slot 5's cookies claimed 2027 while the server
  // was already answering refresh_token_not_found. Presence is not proof.
  const root = makeRoot({ cookies: [{ name: "sb-x", value: "v", expires: 2_000_000_000 }] });
  const s = readSlotAuthStatus(5, { root });
  assert.equal(s.state, BROWSER_AUTH_STATES.VALID);
  assert.equal(s.verified, false, "a metadata read must never report verified");
  assert.equal(s.state_source, "metadata");
  assert.match(browserAuthHeadline(s.state, 5), /not yet verified/);
});

await test("status reports metadata and never a credential", () => {
  const root = makeRoot();
  const s = readSlotAuthStatus(5, { root });
  const serialized = JSON.stringify(s);
  assert.doesNotMatch(serialized, /SECRET-VALUE/, "a cookie value reached the status");
  assert.ok(s.cookie_names.includes("sb-proj-auth-token"), "names are metadata and are useful");
  assert.equal(s.cookie_count, 1);
  assert.ok(s.captured_at);
  // Storage lives outside every worktree, so it cannot reach Git.
  assert.equal(s.outside_worktree, true);
  assert.match(slotAuthStoragePath(5, { root }), /auth\/slot5\/storage-state\.json$/);
});

// ------------------------------------------------- binding refusals

await test("a non-loopback base is refused", () => {
  for (const bad of ["https://app.example.com", "http://10.0.0.5:3015", "http://evil.test:3015",
    "file:///etc/passwd", "ftp://127.0.0.1", "", "not a url"]) {
    assert.equal(isLoopbackBase(bad), false, `${bad} was allowed`);
  }
  // POSITIVE CONTROL.
  for (const good of ["http://127.0.0.1:3015", "http://localhost:3015", "https://127.0.0.1:3015"]) {
    assert.equal(isLoopbackBase(good), true, good);
  }
  const v = validateBrowserAuthRequest({
    lane: laneFor(WT), slot: 5, expectedIdentity: IDENTITY, baseUrl: "https://app.example.com",
  });
  assert.equal(v.error, BROWSER_AUTH_REFUSALS.NON_LOOPBACK);
});

await test("an unregistered lane or foreign worktree is refused", () => {
  assert.equal(validateBrowserAuthRequest({ lane: null, slot: 5, expectedIdentity: IDENTITY }).error,
    BROWSER_AUTH_REFUSALS.UNREGISTERED_LANE);
  assert.equal(validateBrowserAuthRequest({ lane: { lane_id: "l" }, slot: 5, expectedIdentity: IDENTITY }).error,
    BROWSER_AUTH_REFUSALS.WORKTREE_MISMATCH);
  assert.equal(validateBrowserAuthRequest({
    lane: laneFor(WT), slot: 5, expectedIdentity: IDENTITY, worktreePath: "/somewhere/else",
  }).error, BROWSER_AUTH_REFUSALS.WORKTREE_MISMATCH);
});

await test("the wrong slot and the wrong port are refused", () => {
  for (const bad of [0, 9, 99, "x", null, 5.5]) {
    assert.equal(validateBrowserAuthRequest({ lane: laneFor(WT), slot: bad, expectedIdentity: IDENTITY }).error,
      BROWSER_AUTH_REFUSALS.SLOT_MISMATCH, `slot ${bad} was accepted`);
  }
  // A slot may never borrow another slot's port — that is how one slot
  // overwrites another slot's session.
  assert.equal(validateBrowserAuthRequest({
    lane: laneFor(WT), slot: 5, port: 3016, expectedIdentity: IDENTITY,
  }).error, BROWSER_AUTH_REFUSALS.PORT_MISMATCH);

  // POSITIVE CONTROLS: each managed slot validates against its own port.
  for (const [slot, port] of Object.entries(SLOT_PORTS)) {
    const v = validateBrowserAuthRequest({ lane: laneFor(WT), slot: Number(slot), port, expectedIdentity: IDENTITY });
    assert.equal(v.ok, true, `slot ${slot}`);
    assert.equal(v.base_url, `http://127.0.0.1:${port}`);
  }
});

await test("there is no silent fallback QA account", () => {
  for (const bad of [null, "", "   ", "not-an-email", "someone"]) {
    assert.equal(validateBrowserAuthRequest({ lane: laneFor(WT), slot: 5, expectedIdentity: bad }).error,
      BROWSER_AUTH_REFUSALS.NO_IDENTITY, `${bad} was accepted`);
  }
  assert.equal(validateBrowserAuthRequest({ lane: laneFor(WT), slot: 5, expectedIdentity: IDENTITY }).ok, true);
});

// ------------------------------------------------- verification

await test("the wrong account is wrong_identity, never close enough", () => {
  assert.equal(classifyVerification({
    expectedIdentity: IDENTITY, actualIdentity: "qa-slot4-product@example.com",
    workspaceRedirectsToLogin: false,
  }).state, BROWSER_AUTH_STATES.WRONG_IDENTITY);

  // POSITIVE CONTROLS: the right account restores, and case does not matter.
  assert.equal(classifyVerification({
    expectedIdentity: IDENTITY, actualIdentity: IDENTITY, workspaceRedirectsToLogin: false,
  }).state, BROWSER_AUTH_STATES.RESTORED);
  assert.equal(classifyVerification({
    expectedIdentity: IDENTITY, actualIdentity: IDENTITY.toUpperCase(), workspaceRedirectsToLogin: false,
  }).state, BROWSER_AUTH_STATES.RESTORED);
});

await test("a /workspace redirect fails verification even with the right account", () => {
  assert.equal(classifyVerification({
    expectedIdentity: IDENTITY, actualIdentity: IDENTITY, workspaceRedirectsToLogin: true,
  }).state, BROWSER_AUTH_STATES.VERIFICATION_FAILED);
  assert.equal(classifyVerification({
    expectedIdentity: IDENTITY, actualIdentity: null, workspaceRedirectsToLogin: false,
  }).state, BROWSER_AUTH_STATES.VERIFICATION_FAILED);
});

// ------------------------------------------------- capture lifecycle

await test("one interactive capture per slot", async () => {
  const v = validateBrowserAuthRequest({ lane: laneFor(WT), slot: 5, expectedIdentity: IDENTITY });
  let released;
  const held = new Promise((r) => { released = r; });
  const slow = () => held.then(() => ({ ok: true }));
  const first = beginBrowserAuthCapture(v, { spawn: slow });
  await new Promise((r) => setImmediate(r));
  assert.ok(captureInFlight(5), "the first capture must register as in flight");

  const second = await beginBrowserAuthCapture(v, { spawn: slow });
  assert.equal(second.ok, false);
  assert.equal(second.error, BROWSER_AUTH_REFUSALS.CAPTURE_IN_FLIGHT);

  released();
  await first;
  // POSITIVE CONTROL: once it finishes, the slot frees.
  assert.equal(captureInFlight(5), null);
});

await test("cancellation and timeout are reported as themselves", async () => {
  const v = validateBrowserAuthRequest({ lane: laneFor(WT), slot: 5, expectedIdentity: IDENTITY });
  const cancelled = await beginBrowserAuthCapture(v, { spawn: async () => ({ cancelled: true }) });
  assert.equal(cancelled.state, BROWSER_AUTH_STATES.CANCELLED);

  const timedOut = await beginBrowserAuthCapture(v, { spawn: async () => ({ timedOut: true }) });
  assert.equal(timedOut.state, BROWSER_AUTH_STATES.TIMED_OUT);

  // POSITIVE CONTROL: a completed capture moves to verifying, not to restored —
  // only verification may say restored.
  const done = await beginBrowserAuthCapture(v, { spawn: async () => ({ ok: true }) });
  assert.equal(done.state, BROWSER_AUTH_STATES.VERIFYING);
});

// ------------------------------------------------- secrets

await test("no credential material can reach a log or a durable result", () => {
  const leaky = [
    "access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk",
    "refresh_token: v1.MRefreshTokenValue",
    "sb-proj-auth-token=base64cookievalue",
    "password=hunter2",
  ].join("\n");
  const clean = redactAuthText(leaky);
  assert.doesNotMatch(clean, /hunter2/);
  assert.doesNotMatch(clean, /MRefreshTokenValue/);
  assert.doesNotMatch(clean, /base64cookievalue/);
  assert.doesNotMatch(clean, /eyJhbGciOiJIUzI1NiJ9\./);
  assert.match(clean, /redacted/);

  const v = validateBrowserAuthRequest({ lane: laneFor(WT), slot: 5, expectedIdentity: IDENTITY });
  const out = publicAuthOutcome({
    validated: v, state: BROWSER_AUTH_STATES.RESTORED,
    status: readSlotAuthStatus(5, { root: makeRoot() }),
    detail: "access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.zzz",
  });
  const serialized = JSON.stringify(out);
  assert.doesNotMatch(serialized, /SECRET-VALUE/);
  assert.doesNotMatch(serialized, /eyJhbGciOiJIUzI1NiJ9\./);
  assert.equal(out.secrets_recorded, false);
  // The durable record still carries what an operator needs.
  assert.equal(out.headline, "Browser session restored for slot 5");
  assert.equal(out.expected_identity, IDENTITY);
  assert.ok(out.verified_at, "a restored outcome records when it was verified");
  assert.equal(out.storage_outside_worktree, true);
});

await test("storage cannot reach Git", () => {
  // It lives under the machine state root, not any repository, so exclusion is
  // structural rather than a .gitignore entry someone can delete.
  // Asserted by intent, not by literal directory: the path follows whichever
  // runtime root the verifier reads (base or gateway), and pinning the literal
  // string made this fail on a correct change rather than on a leak.
  const p = slotAuthStoragePath(5);
  assert.doesNotMatch(p, /alloy-worktrees/);
  assert.match(p, /\.local\/state\/alloy-dev(\/gateway)?\/auth\/slot5\//);
  assert.equal(readSlotAuthStatus(5, { root: makeRoot() }).outside_worktree, true);
});

await test("a live failure outranks optimistic metadata", async () => {
  // THE CASE THAT WOULD HAVE STAYED INVISIBLE. A present, self-unexpired storage
  // file reads as "valid" from metadata, so the lane that most needs recovery is
  // the one that never offers it. A recorded live verdict corrects that.
  const root = makeRoot();
  const lane = { lane_id: "lane_rt", binding: { worktree_path: WT } };
  const before = attachLaneBrowserAuth([lane], { root, qaIdentityFor: () => IDENTITY })[0];
  assert.equal(before.browser_auth.blocks_execution, false, "metadata alone does not block");

  recordSlotVerification(5, { state: BROWSER_AUTH_STATES.VERIFICATION_FAILED, expectedIdentity: IDENTITY, root });
  const after = attachLaneBrowserAuth([lane], { root, qaIdentityFor: () => IDENTITY })[0];
  assert.equal(after.browser_auth.state, BROWSER_AUTH_STATES.VERIFICATION_FAILED);
  assert.equal(after.browser_auth.blocks_execution, true);
  assert.equal(after.browser_auth.last_verified_state, BROWSER_AUTH_STATES.VERIFICATION_FAILED);

  // POSITIVE CONTROL, AND THE IMPORTANT DIRECTION: a verdict may only make the
  // state WORSE. A stale "restored" must never mask a storage file that has
  // since gone missing, or the card would vanish while the lane stayed broken.
  const empty = makeRoot({ write: false });
  recordSlotVerification(5, { state: BROWSER_AUTH_STATES.RESTORED, expectedIdentity: IDENTITY, root: empty });
  const masked = attachLaneBrowserAuth([lane], { root: empty, qaIdentityFor: () => IDENTITY })[0];
  assert.equal(masked.browser_auth.state, BROWSER_AUTH_STATES.MISSING, "a stale restored verdict must not mask a missing file");
  assert.equal(masked.browser_auth.blocks_execution, true);

  // The verdict record itself carries no secret.
  const rec = readSlotVerification(5, { root });
  assert.equal(rec.secrets_recorded, false);
  assert.equal(rec.expected_identity, IDENTITY);
});

await test("a lane with no slot has no browser session to recover", () => {
  assert.equal(laneSlot({ binding: { worktree_path: "/tmp/not-a-slot" } }), null);
  assert.equal(laneSlot({ binding: { worktree_path: WT } }), 5);
  assert.equal(laneSlot({ binding: { slot: 3 } }), 3);
  const untouched = attachLaneBrowserAuth([{ lane_id: "x", binding: { worktree_path: "/tmp/none" } }]);
  assert.equal(untouched[0].browser_auth, undefined);
});

await test("storage resolves under the runtime root the verifier reads", () => {
  // `alloy-agent-verify` reads `$ALLOY_RUNTIME_ROOT/auth/slot<N>` and does not
  // special-case the gateway root. Stripping `/gateway` here pointed the status
  // at a file the verifier never opens, so slot 5 reported a valid session while
  // verification said `missing` — the exact disagreement this flow exists to end.
  const prev = process.env.ALLOY_RUNTIME_ROOT;
  try {
    process.env.ALLOY_RUNTIME_ROOT = "/tmp/alloy-root-probe/gateway";
    assert.equal(
      slotAuthStoragePath(5),
      "/tmp/alloy-root-probe/gateway/auth/slot5/storage-state.json",
    );
    assert.equal(
      legacySlotAuthStoragePath(5),
      "/tmp/alloy-root-probe/auth/slot5/storage-state.json",
    );
  } finally {
    if (prev === undefined) delete process.env.ALLOY_RUNTIME_ROOT;
    else process.env.ALLOY_RUNTIME_ROOT = prev;
  }
});

await test("a session stranded under the base root is missing, and says why", () => {
  const prev = process.env.ALLOY_RUNTIME_ROOT;
  const base = mkdtempSync(join(tmpdir(), "alloy-stranded-"));
  try {
    process.env.ALLOY_RUNTIME_ROOT = join(base, "gateway");
    // A real capture, but under the base root — the verifier cannot reach it.
    mkdirSync(join(base, "auth", "slot5"), { recursive: true });
    writeFileSync(
      join(base, "auth", "slot5", "storage-state.json"),
      JSON.stringify({ cookies: [{ name: "sb", expires: 4102444800 }] }),
      { mode: 0o600 },
    );

    const status = readSlotAuthStatus(5);
    // Not valid: presence somewhere else is not presence where it counts.
    assert.equal(status.state, BROWSER_AUTH_STATES.MISSING);
    assert.equal(status.exists, false);
    assert.equal(status.stranded_storage_path, join(base, "auth", "slot5", "storage-state.json"));
    assert.match(status.detail, /base runtime root/);
    assert.equal(blocksExecution(status.state), true);
    // The explanation must survive into what the Director actually sees.
    const lanes = attachLaneBrowserAuth([{ lane_id: "l", binding: { slot: 5 } }]);
    assert.match(lanes[0].browser_auth.detail, /base runtime root/);
    // And it must still never carry credential material.
    assert.equal(lanes[0].browser_auth.secrets_recorded, false);
    // The missing branch reports no cookie data at all, so there is nothing in
    // it that could describe the stranded session's contents.
    assert.equal(status.cookie_count, undefined);
    assert.equal(status.cookie_names, undefined);
  } finally {
    if (prev === undefined) delete process.env.ALLOY_RUNTIME_ROOT;
    else process.env.ALLOY_RUNTIME_ROOT = prev;
  }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
