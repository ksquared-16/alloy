#!/usr/bin/env node
/**
 * The Critical Invariants Pack — its manifest, its failure law, and proof that
 * it actually detects regressions.
 *
 * A SAFETY PACK PROVEN ONLY WHILE EVERYTHING IS GREEN IS NOT PROVEN. The most
 * important controls here are the fault injections: a real violation is created
 * and the pack is required to catch it. A pack that has never failed is a pack
 * nobody has tested.
 *
 * `runProof` is injected throughout, so these assert the PACK's contract — which
 * outcomes block, how pre-existing debt is differentiated, what happens when a
 * proof cannot run — without spawning the platform's whole test surface. The
 * proofs themselves are owned and certified by their domains.
 *
 * Isolated. Nothing is spawned and nothing is written.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");

const P = await import("../lib/vacilando/critical-invariants.mjs");
const K = await import("../lib/vacilando/lane-knowledge.mjs");
const W = await import("../lib/vacilando/worktree-lifecycle.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const allPass = () => ({ outcome: P.OUTCOME.PASS });

// ── 1, 2, 15. The manifest ───────────────────────────────────────────────────

await test("1 — every invariant has a stable, unique, structured id", () => {
  const ids = P.INVARIANTS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
  for (const id of ids) {
    assert.match(id, /^INV-[A-Z]+-\d{3}$/, `${id} must be a stable structured id`);
  }
});

await test("2 — every invariant names exactly one canonical owner and its rationale", () => {
  for (const i of P.INVARIANTS) {
    assert.ok(i.owner && i.owner.length > 3, `${i.id} has no owner`);
    assert.ok(i.rationale && i.rationale.length > 40, `${i.id} has no rationale worth reading`);
    assert.ok(Object.values(P.SEVERITY).includes(i.severity), `${i.id} has no severity`);
    assert.ok(Number.isInteger(i.level), `${i.id} has no required level`);
    assert.ok(i.evidence, `${i.id} says nothing about what it produces`);
  }
});

await test("an invariant states a TRUTH, never an implementation detail", () => {
  // "function X returns Y" has to be rewritten every time the implementation
  // moves, and stops being a statement anyone can argue with.
  for (const i of P.INVARIANTS) {
    assert.ok(i.statement.length > 30, `${i.id} statement is too thin to be a truth`);
    assert.ok(!/\bfunction\b|\breturns\b|\(\)/.test(i.statement), `${i.id} states an implementation, not a truth`);
  }
});

await test("3 — every proof is an EXISTING control, and it exists", () => {
  // The pack composes authoritative proofs; it does not clone their assertions.
  // A manifest pointing at a control that is not there is worse than no pack.
  for (const i of P.INVARIANTS) {
    const rel = i.proof.runner === P.RUNNER.VITEST ? join("web", i.proof.target) : i.proof.target;
    assert.ok(existsSync(join(REPO, rel)), `${i.id} names a proof that does not exist: ${rel}`);
  }
});

await test("15 — the pack defines no rule of its own", () => {
  // If this module ever contains an assertion, it has become the second source
  // of truth it exists to avoid.
  const src = Object.values(P).filter((v) => typeof v === "function").map((f) => f.toString()).join("\n");
  for (const forbidden of ["assert", "expect(", "toEqual", "spawnSync", "execFileSync"]) {
    assert.ok(!src.includes(forbidden), `the manifest must never ${forbidden}: it asks owners, it does not judge`);
  }
});

await test("the runtime, governance, worktree, access and business spines are all represented", () => {
  const domains = new Set(P.INVARIANTS.map((i) => i.id.split("-")[1]));
  for (const d of ["RUNTIME", "GOV", "WORKTREE", "ACCESS", "FIN", "ATTEND"]) {
    assert.ok(domains.has(d), `no invariant covers ${d}`);
  }
  // Small, or it fails. A pack that grows until people route around it has
  // failed more completely than one never written.
  assert.ok(P.INVARIANTS.length <= 15, "the kernel must stay a kernel");
});

// ── 4, 5, 14. Bound to a candidate ───────────────────────────────────────────

await test("4, 5 — a pack result is bound to the exact candidate and environment", async () => {
  const out = await P.runCriticalInvariants({
    candidate: "f54cdf6be", environment: "isolated", runProof: allPass,
  });
  assert.equal(out.candidate, "f54cdf6be");
  assert.equal(out.environment, "isolated");
  assert.equal(out.pack_version, P.PACK_VERSION);
  assert.equal(out.verdict, P.OUTCOME.PASS);
  assert.equal(out.blocks_integration, false);
});

await test("14, 13 — certification captures outcomes as references, never raw output", async () => {
  const out = await P.runCriticalInvariants({ candidate: "abc123", environment: "e", runProof: allPass });
  const cert = P.packCertification(out, {
    certificationRecord: K.certificationRecord,
    evidenceRefs: ["docs/platform/planning/vacilando-os/DEVOPS-5-CRITICAL-INVARIANTS.md"],
  });
  assert.equal(cert.kind, K.FACT_KIND.EVIDENCE);
  assert.equal(cert.candidate, "abc123");
  assert.equal(cert.passed, true);
  // One concise line per invariant — enough to reproduce, nothing to scroll.
  assert.equal(cert.suites.length, P.INVARIANTS.length);
  assert.ok(JSON.stringify(cert).length < 4000, "a certification record must stay a pointer, not a transcript");
  for (const line of cert.suites) assert.match(line, /^INV-[A-Z]+-\d{3}: (PASS|FAIL|UNMEASURED)/);
});

await test("the pack records WHY it exists as a durable decision, not a comment", () => {
  const d = P.packRationale({ durableDecision: K.durableDecision });
  assert.equal(d.kind, K.FACT_KIND.DURABLE_DECISION);
  assert.ok(d.alternatives_rejected.length >= 3, "the rejected alternatives are the useful half");
  assert.match(d.rationale, /route around it/);
});

// ── 6, 7, 8. The failure law ────────────────────────────────────────────────

await test("6 — a new invariant failure blocks, with no override", async () => {
  const out = await P.runCriticalInvariants({
    candidate: "c", runProof: (inv) =>
      (inv.id === "INV-RUNTIME-001" ? { outcome: P.OUTCOME.FAIL, detail: "two owners" } : { outcome: P.OUTCOME.PASS }),
  });
  assert.equal(out.verdict, P.OUTCOME.FAIL);
  assert.equal(out.blocks_integration, true);
  assert.equal(out.counts.failed_new, 1);
  // There is deliberately no flag, option or field that turns this into a pass.
  assert.ok(!("override" in out) && !("force" in out) && !("approved_anyway" in out));
});

await test("7 — a pre-existing failure stays visible and is differentiated from a regression", async () => {
  const failOne = (inv) =>
    (inv.id === "INV-GOV-002" ? { outcome: P.OUTCOME.FAIL, detail: "known red" } : { outcome: P.OUTCOME.PASS });

  const unknown = await P.runCriticalInvariants({ candidate: "c", runProof: failOne });
  assert.equal(unknown.counts.failed_new, 1, "without a baseline it is a regression");
  assert.equal(unknown.verdict, P.OUTCOME.FAIL);

  const known = await P.runCriticalInvariants({ candidate: "c", runProof: failOne, baseline: ["INV-GOV-002"] });
  assert.equal(known.counts.failed_new, 0);
  assert.equal(known.counts.failed_pre_existing, 1);
  // NOT normalised into green. The outcome is still FAIL and the row still says so.
  const row = known.results.find((r) => r.id === "INV-GOV-002");
  assert.equal(row.outcome, P.OUTCOME.FAIL, "known debt must never be rewritten as a pass");
  assert.equal(row.pre_existing, true);
});

await test("the baseline is never granted automatically", () => {
  // A baseline the pack gives itself is a pack that excuses its own failures.
  assert.ok(P.MEASURED_BASELINE.entries.length >= 1, "the measured debt is recorded");
  // ...but it is data, not a default. `runCriticalInvariants` defaults to [].
  assert.match(P.runCriticalInvariants.toString(), /baseline = \[\]/);
});

await test("8 — an unmeasured required invariant does not silently pass", async () => {
  const out = await P.runCriticalInvariants({
    candidate: "c", runProof: (inv) =>
      (inv.id === "INV-FIN-001" ? { outcome: P.OUTCOME.UNMEASURED, detail: "deps absent" } : { outcome: P.OUTCOME.PASS }),
  });
  assert.equal(out.verdict, P.OUTCOME.UNMEASURED);
  assert.equal(out.blocks_integration, true, "we could not check is not it is fine");
  assert.equal(out.counts.unmeasured, 1);
});

await test("8b — a runner that throws, or answers nonsense, is UNMEASURED and never a pass", async () => {
  const thrown = await P.runCriticalInvariants({
    candidate: "c", runProof: (inv) => { if (inv.id === "INV-ACCESS-001") throw new Error("boom"); return { outcome: P.OUTCOME.PASS }; },
  });
  assert.equal(thrown.counts.unmeasured, 1);
  assert.match(thrown.results.find((r) => r.id === "INV-ACCESS-001").detail, /proof threw/);

  const garbage = await P.runCriticalInvariants({ candidate: "c", runProof: () => ({ outcome: "probably fine" }) });
  assert.equal(garbage.counts.unmeasured, P.INVARIANTS.length, "an unrecognised answer is not an optimistic pass");

  const none = await P.runCriticalInvariants({ candidate: "c" });
  assert.equal(none.verdict, P.OUTCOME.UNMEASURED, "no runner at all must not report green");
});

// ── 9, 10, 11. Fault injection — the pack must catch real regressions ───────

await test("9 — FAULT INJECTION: duplicate slot ownership is detected", () => {
  // Not a mocked outcome. The real control from the canonical owner is given a
  // real violation: two ACTIVE lanes claiming one managed slot, which is exactly
  // what was found live on slot 8.
  const violation = W.detectSlotOwnershipConflicts({
    lanes: [
      { lane_id: "l1", name: "A", status: "ACTIVE", binding: { slot: 8, worktree_name: "wt-a" } },
      { lane_id: "l2", name: "B", status: "ACTIVE", binding: { slot: 8, worktree_name: "wt-b" } },
    ],
    registrySlots: { 8: "wt-b" },
  });
  assert.equal(violation.conflicts.length, 1, "the owner must detect the violation");

  // And the healthy shape must NOT trip it, or the invariant is just noise.
  const healthy = W.detectSlotOwnershipConflicts({
    lanes: [{ lane_id: "l1", name: "A", status: "ACTIVE", binding: { slot: 8, worktree_name: "wt-a" } }],
    registrySlots: { 8: "wt-a" },
  });
  assert.equal(healthy.conflicts.length, 0);
});

await test("10 — FAULT INJECTION: a governed-action safety regression fails the pack", async () => {
  const out = await P.runCriticalInvariants({
    candidate: "c", runProof: (inv) =>
      (inv.id.startsWith("INV-GOV") ? { outcome: P.OUTCOME.FAIL, detail: "second grant minted" } : { outcome: P.OUTCOME.PASS }),
  });
  assert.equal(out.verdict, P.OUTCOME.FAIL);
  assert.equal(out.counts.failed_new, 2);
  assert.equal(out.blocks_integration, true);
});

await test("11 — FAULT INJECTION: a business-spine regression fails the pack", async () => {
  for (const id of ["INV-FIN-001", "INV-ATTEND-001", "INV-ACCESS-001"]) {
    const out = await P.runCriticalInvariants({
      candidate: "c", runProof: (inv) => (inv.id === id ? { outcome: P.OUTCOME.FAIL } : { outcome: P.OUTCOME.PASS }),
    });
    assert.equal(out.verdict, P.OUTCOME.FAIL, `${id} must be able to block`);
    assert.equal(out.blocks_integration, true);
  }
});

await test("FAULT INJECTION: knowledge contradiction is detected by its owner", () => {
  // The real control, given a real violation: a record still asserting a slot
  // the canonical owner has reassigned.
  const out = K.detectKnowledgeContradictions({
    observations: { slot: K.observedFact(8, { source: "development-lane.binding" }) },
    canonical: { slot: 3 },
  });
  assert.equal(out.count, 1);
  assert.equal(out.contradictions[0].resolution, "canonical_wins");
});

// ── 12. Budget ──────────────────────────────────────────────────────────────

await test("12 — the pack reports whether it stayed within its measured budget", async () => {
  const ok = await P.runCriticalInvariants({ candidate: "c", runProof: allPass });
  assert.equal(ok.within_budget, true);
  assert.equal(ok.budget_ms, P.BUDGET.max_ms);
  assert.ok(Number.isFinite(ok.elapsed_ms));

  // A proof that grows into a slow one must be reported as a breach rather than
  // quietly making the pack something a lane starts skipping.
  const tight = await P.runCriticalInvariants({
    candidate: "c", runProof: allPass, budget: { max_ms: -1 },
  });
  assert.equal(tight.within_budget, false);
});

await test("the measured budget is recorded, not guessed", () => {
  assert.equal(P.BUDGET.measured_at, "2026-09-12");
  assert.ok(P.BUDGET.measured_node_ms_range[1] < 1000, "node proofs are milliseconds");
  assert.ok(P.BUDGET.measured_vitest_ms_range[1] < 5000, "vitest proofs are low seconds");
});

// ── Levels and the DevOps 6 seam ────────────────────────────────────────────

await test("levels select what must hold at each boundary", () => {
  assert.equal(P.LEVELS.READY_FOR_STAGING, 2);
  const l2 = P.invariantsForLevel(P.LEVELS.READY_FOR_STAGING);
  assert.equal(l2.length, P.INVARIANTS.length, "every V1 invariant is required at READY_FOR_STAGING");
  // A lower boundary requires fewer, never more.
  assert.ok(P.invariantsForLevel(P.LEVELS.LOCAL).length <= l2.length);
});

await test("the DevOps 6 seam is deterministic in and deterministic out", async () => {
  const a = await P.runCriticalInvariants({ candidate: "x", environment: "e", runProof: allPass, nowMs: 1 });
  const b = await P.runCriticalInvariants({ candidate: "x", environment: "e", runProof: allPass, nowMs: 1 });
  const strip = (r) => ({ ...r, elapsed_ms: 0, results: r.results.map((x) => ({ ...x, ms: 0 })) });
  assert.deepEqual(strip(a), strip(b), "the same inputs must produce the same verdict");
  for (const key of ["verdict", "blocks_integration", "counts", "results", "candidate", "environment"]) {
    assert.ok(key in a, `DevOps 6 needs ${key}`);
  }
  assert.ok([P.OUTCOME.PASS, P.OUTCOME.FAIL, P.OUTCOME.UNMEASURED].includes(a.verdict));
});

await test("invariantById resolves, and an unknown id is null rather than a guess", () => {
  assert.equal(P.invariantById("INV-RUNTIME-001").id, "INV-RUNTIME-001");
  assert.equal(P.invariantById("INV-NOPE-999"), null);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
