#!/usr/bin/env node
/**
 * FINISHED AND "STAGING MUST MOVE" ARE DIFFERENT QUESTIONS.
 *
 * They had become one. Over fourteen days 234 merges into staging touched
 * `scripts/local-dev`, with a MEDIAN GAP OF NINETEEN MINUTES between them; in
 * the two days the governed-action store still covers, this lane filed 42
 * toolkit installs. Each of those carried a pull request, a check set, a merge,
 * a deployment, an install and a convergence — for, at the median, five files.
 *
 * These cases pin the classification that separates the two questions, and in
 * particular the default: an unclassified candidate BATCHES. The measured
 * behaviour was the opposite default, where anything green went to staging
 * because nothing said it should not.
 */
import assert from "node:assert/strict";
import {
  BATCHABLE_CLASSES, LIVE_ONLY_SURFACES, PROMOTE_NOW_REASONS,
  classifyCandidate, summariseBatch, whyThisMustPromoteNow,
} from "../lib/vacilando/promotion-economy.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/* ── the default ──────────────────────────────────────────────────────────── */

test("1 — an unclassified candidate batches, and says it was unclassified", () => {
  const c = classifyCandidate({ paths: ["scripts/local-dev/tests/development-x.test.mjs"] });
  assert.equal(c.disposition, "BATCH");
  assert.equal(c.unclassified, true, "silence must be visible, not just safe");
});

test("2 — every batchable class is a real answer, not a shrug", () => {
  for (const key of Object.keys(BATCHABLE_CLASSES)) {
    const c = classifyCandidate({ paths: ["scripts/local-dev/x.mjs"], batch_class: key });
    assert.equal(c.disposition, "BATCH");
    assert.equal(c.unclassified, false);
    assert.ok(c.why && c.why.length > 8, `${key} must carry a reason`);
  }
});

/* ── the exceptions ───────────────────────────────────────────────────────── */

test("3 — each of the four exceptions promotes, and names itself", () => {
  for (const key of Object.keys(PROMOTE_NOW_REASONS)) {
    const c = classifyCandidate({ paths: ["scripts/local-dev/lib/vacilando/a.mjs"], promote_now_reason: key });
    assert.equal(c.disposition, "PROMOTE_NOW", `${key} must promote`);
    assert.equal(c.why, PROMOTE_NOW_REASONS[key]);
  }
});

test("4 — an invented exception still promotes, but is flagged unclassified", () => {
  // Deliberately NOT a refusal. A policy that can block the one urgent fix of
  // the week gets routed around within a day, and then it is worse than
  // nothing. What it must do is make the claim visible for review.
  const c = classifyCandidate({ paths: ["a"], promote_now_reason: "because_i_said_so" });
  assert.equal(c.disposition, "PROMOTE_NOW");
  assert.equal(c.unclassified, true);
  assert.match(c.why, /unrecognised exception/);
});

test("5 — a live-only surface promotes without anyone having to claim it", () => {
  // The worked example: the hosted fixture runner's bare `psql` was invisible
  // to every local suite and only appeared when the trusted host ran it.
  const c = classifyCandidate({ paths: ["web/scripts/seedFinancialsDemoTenant.mjs"] });
  assert.equal(c.disposition, "PROMOTE_NOW");
  assert.match(c.why, /cannot be meaningfully certified/);
  assert.ok(LIVE_ONLY_SURFACES.includes("web/scripts/seedFinancialsDemoTenant.mjs"));
});

test("6 — a claimed batch class does not override a live-only surface", () => {
  const c = classifyCandidate({
    paths: ["certification/fixtures/financials-demo-tenant.sql"],
    batch_class: "maintenance",
  });
  assert.equal(c.disposition, "PROMOTE_NOW",
    "calling it maintenance does not make it certifiable locally");
});

/* ── install economy ──────────────────────────────────────────────────────── */

test("7 — a test-only candidate requires no toolkit install", () => {
  const c = classifyCandidate({ paths: ["scripts/local-dev/tests/development-x.test.mjs"] });
  assert.equal(c.runtime_bytes_change, false);
  assert.equal(c.requires_install, false, "42 installs in two days is the cost of getting this wrong");
});

test("8 — a library change is treated as runtime unless the caller says otherwise", () => {
  const inferred = classifyCandidate({ paths: ["scripts/local-dev/lib/vacilando/a.mjs"] });
  assert.equal(inferred.requires_install, true, "conservative by default");
  const stated = classifyCandidate({
    paths: ["scripts/local-dev/lib/vacilando/a.mjs"],
    runtime_bytes_change: false,
  });
  assert.equal(stated.requires_install, false,
    "a repository audit module with no runtime importer must be able to say so");
});

/* ── the sentence a mission has to answer ─────────────────────────────────── */

test("9 — WHY_THIS_MUST_PROMOTE_NOW answers in both directions", () => {
  const yes = whyThisMustPromoteNow({ paths: ["a"], promote_now_reason: "consumer_blocker" });
  assert.equal(yes.promote, true);
  assert.match(yes.statement, /^WHY_THIS_MUST_PROMOTE_NOW: an Alloy consumer/);
  const no = whyThisMustPromoteNow({ paths: ["scripts/local-dev/tests/a.test.mjs"] });
  assert.equal(no.promote, false);
  assert.match(no.statement, /no strong answer/);
});

/* ── the batch ────────────────────────────────────────────────────────────── */

test("10 — a batch of batchable work implies zero promotions", () => {
  const b = summariseBatch([
    { name: "impact discovery", paths: ["scripts/local-dev/lib/vacilando/impact-discovery.mjs"], batch_class: "observability", runtime_bytes_change: false },
    { name: "tests", paths: ["scripts/local-dev/tests/a.test.mjs"], batch_class: "test_repair" },
  ]);
  assert.equal(b.promote_now, false);
  assert.equal(b.promotions_implied, 0);
  assert.equal(b.requires_install, false);
});

test("11 — one forcing member carries the whole batch, and only one promotion", () => {
  const b = summariseBatch([
    { name: "docs", paths: ["docs/a.md"], batch_class: "documentation" },
    { name: "runner", paths: ["web/scripts/seedFinancialsDemoTenant.mjs"] },
    { name: "tests", paths: ["scripts/local-dev/tests/a.test.mjs"], batch_class: "test_repair" },
  ]);
  assert.equal(b.promote_now, true);
  assert.equal(b.promotions_implied, 1, "the economy IS that the rest travel for free");
  assert.equal(b.forced_by.length, 1);
  assert.equal(b.forced_by[0].name, "runner");
});

test("12 — an unclassified member is named so silence is reviewable", () => {
  const b = summariseBatch([
    { name: "mystery", paths: ["scripts/local-dev/lib/vacilando/x.mjs"] },
    { name: "known", paths: ["docs/a.md"], batch_class: "documentation" },
  ]);
  assert.deepEqual(b.unclassified, ["mystery"]);
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
