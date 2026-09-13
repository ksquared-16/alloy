#!/usr/bin/env node
/**
 * BACKLOG BURN-DOWN: THE TAIL WAS OURS AFTER ALL.
 *
 * The notification P95 was carried as "web-push delivery, external, P2". It was
 * measured instead, over 497 delivered notifications: P50 0.61s, P90 12.5s,
 * P95 18.7s, max 47.2s, with 20.5% over five seconds — and EVERY slow case
 * showing `sent: 3`, `attempted: true`, no error, no retry. Nothing was failing.
 * Three healthy devices were being waited on one after another, because the
 * fan-out awaited each send in turn. The provider's latency is not ours;
 * multiplying it by the number of devices was.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sendPushToSubscriptions } from "../lib/vacilando/lane-push.mjs";
import { governedRequestRetentionCap } from "../lib/vacilando/governed-action-request.mjs";

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const src = (f) => readFileSync(new URL(`../lib/vacilando/${f}`, import.meta.url), "utf8");

/* ── THE FAN-OUT ─────────────────────────────────────────────────────────── */

await test("B1. THE DEFECT: subscriptions go out together, not one after another", async () => {
  /*
   * Three sends that each take 50ms cost ~50ms concurrently and ~150ms in
   * series. Asserted as WALL TIME, because the property that matters is how
   * long an operator waits.
   *
   * The store is seeded in a temp root rather than borrowed from the host: the
   * first version of this test passed here and failed in CI, because this
   * machine has real push subscriptions and a CI runner has none. A timing
   * test that only runs where someone happens to own a phone is not a test.
   */
  const root = mkdtempSync(join(tmpdir(), "vac-push-"));
  try {
    mkdirSync(join(root, "vacilando"), { recursive: true });
    writeFileSync(join(root, "vacilando", "web-push.json"), JSON.stringify({
      schema_version: "vacilando.web_push.v1",
      vapid: { subject: "mailto:ops@example.com", publicKey: "k", privateKey: "k" },
      subscriptions: [1, 2, 3].map((i) => ({
        endpoint: `https://push.example/${i}`, keys: { p256dh: "x", auth: "y" },
        created_at: new Date().toISOString(),
      })),
    }));
    let live = 0;
    let peak = 0;
    const send = async () => {
      live += 1; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 50));
      live -= 1;
    };
    const started = Date.now();
    const out = await sendPushToSubscriptions(
      { title: "t", body: "b", kind: "governed_action_approval_required" },
      { root, send, ignorePreference: true },
    );
    const elapsed = Date.now() - started;
    assert.equal(out.sent, 3, `fixture: all three must be attempted (${JSON.stringify(out)})`);
    assert.equal(peak, 3, "all three were in flight at once");
    assert.ok(elapsed < 120, `three 50ms sends took ${elapsed}ms - that is serial`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("B2. the results stay index-mapped to their subscriptions", async () => {
  /*
   * Parallelising must not let `results[i]` stop meaning `subs[i]`: the
   * dead-endpoint prune reads exactly that correspondence, so an order that
   * depends on which provider answered first would prune the wrong device.
   */
  const code = src("lane-push.mjs");
  assert.match(code, /Promise\.all\(subs\.map\(/, "the fan-out is concurrent");
  assert.match(code, /INDEX-MAPPED/, "and says why the ordering is deliberate");
  assert.doesNotMatch(code, /for \(const sub of subs\) \{\s*\n\s*const provider/,
    "the serial loop is gone");
});

/* ── DIAGNOSTICS ─────────────────────────────────────────────────────────── */

await test("B3. routine governance failure paths no longer select line zero", () => {
  // Each of these is a failure an operator reads on an ordinary promotion or
  // cleanup. `gh` and `git` open with a blank line often enough that selecting
  // it reported "" for a named failure.
  for (const [file, needle] of [
    ["trusted-host-open-pr.mjs", "gh pr list failed"],
    ["trusted-host-push.mjs", "ls-remote failed"],
    ["trusted-host-repository-housekeeping.mjs", "gh pr close failed"],
    ["trusted-host-repository-housekeeping.mjs", "gh api delete failed"],
    ["toolkit-convergence.mjs", "toolkit install failed"],
    ["control-plane-recovery.mjs", "kickstart failed"],
    ["github.mjs", "gh error"],
  ]) {
    const code = src(file);
    const line = code.split("\n").find((l) => l.includes(needle));
    assert.ok(line, `${file}: expected a failure path mentioning ${needle}`);
    assert.match(line, /firstMeaningfulLine/, `${file}: ${needle} still selects line zero`);
  }
});

await test("B4. successful-output parsing was NOT converted", () => {
  /*
   * provider-runtime takes the first line of SUCCESSFUL output. Same syntax,
   * different meaning: there is no blank-first-line defect to fix, and
   * "meaningful" is not a property the caller wants applied to it.
   */
  const code = src("provider-runtime.mjs");
  assert.match(code, /r\.code === 0 \? r\.out\.trim\(\)\.split\("\\n"\)\[0\] : null/,
    "success-output semantics are untouched");
});

/* ── RETENTION ───────────────────────────────────────────────────────────── */

await test("B5. retention is sized from measured volume, not rounded up by feel", () => {
  /*
   * 2026-09-13 produced 204 governed actions in one day. 1000 was five days at
   * that rate — short of the seven the weekly report needs, with nothing left
   * for the week-over-week comparison.
   */
  assert.equal(governedRequestRetentionCap(), 2000);
  const code = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8");
  assert.match(code, /204 governed\s*\n?\s*\*? ?actions/, "the number it was sized against is written down");
  assert.match(code, /cannot recover what is already gone/i,
    "and so is the limit: evicted history does not come back");
});

/* ── OPERATOR-REVIEW ─────────────────────────────────────────────────────── */

await test("B6. operator_review explains itself where the operator meets it", () => {
  // No governance document mentions the state. An operator who reads only
  // "operator_review" reasonably concludes their approval is what unblocks it.
  const cli = readFileSync(new URL("../vac-worktree-retire.mjs", import.meta.url), "utf8");
  assert.match(cli, /operator_review is not 'approve to proceed'/);
  assert.match(cli, /not_retirable_now/, "it names the refusal that would follow");
  assert.match(cli, /state=candidate/, "and what would change it");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
