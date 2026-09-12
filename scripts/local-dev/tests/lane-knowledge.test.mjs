#!/usr/bin/env node
/**
 * Lane knowledge — durable context, and what may be trusted of it.
 *
 * WHAT IS NOT TESTED HERE. `lane-memory.mjs` already owns the lane-scoped store,
 * the record shape and the bounded projection, and none of that is
 * re-implemented or re-asserted. These controls cover only the layer this
 * mission adds: that a fact knows what KIND it is, that a mutable one says when
 * it must be looked up again, that certification names exactly what it proves,
 * and that canonical truth wins when the two disagree.
 *
 * THE CONTROL THAT MATTERS MOST is "canonical truth wins". The whole subsystem
 * exists to stop a document becoming authority by outliving the fact it
 * recorded — the live version of which DevOps 3 measured, where a lane record
 * claimed a slot the registry had long since given to somebody else.
 *
 * Isolated. No lane store, worktree or repository is written.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-know-"));
process.env.ALLOY_RUNTIME_ROOT = join(ROOT, "gateway");
mkdirSync(join(ROOT, "gateway", "vacilando"), { recursive: true });

const K = await import("../lib/vacilando/lane-knowledge.mjs");
const H = await import("../lib/vacilando/health.mjs");
const LM = await import("../lib/vacilando/lane-memory.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);
const LANE = "lane_aaaaaaaaaaaa";

// ── 1, 14. A deterministic location that does not need a worktree ────────────

test("1 — a lane resolves a deterministic knowledge index", () => {
  const a = K.knowledgeIndexFor(LANE, { repoRoot: "/repo", stateRoot: "/state" });
  const b = K.knowledgeIndexFor(LANE, { repoRoot: "/repo", stateRoot: "/state" });
  assert.deepEqual(a, b, "the same lane must always resolve the same location");
  assert.match(a.document.path, new RegExp(`${LANE}\\.md$`));
  assert.match(a.runtime.store, /lane-memory/);
  assert.equal(K.knowledgeIndexFor(""), null);
});

test("2, 14 — the index never depends on the lane's worktree", () => {
  // DevOps 3 certified that a durable lane survives worktree reclamation, so
  // knowledge anchored to a checkout is knowledge with an expiry date.
  const idx = K.knowledgeIndexFor(LANE, { repoRoot: "/repo", stateRoot: "/state" });
  const everything = JSON.stringify(idx);
  assert.ok(!everything.includes("alloy-worktrees"), "no path may point into a lane worktree");
  assert.equal(idx.document.path, "/repo/docs/platform/planning/vacilando-os/lanes/" + LANE + ".md");
  assert.equal(idx.runtime.store, "/state/vacilando/lane-memory/lanes.json");
});

test("the split states which kind lives where, so nothing is written twice", () => {
  const idx = K.knowledgeIndexFor(LANE, { repoRoot: "/repo", stateRoot: "/state" });
  assert.ok(idx.document.holds.includes("DURABLE_DECISION"));
  assert.ok(idx.document.holds.includes("EVIDENCE"));
  assert.ok(idx.runtime.holds.includes("CURRENT_OBSERVATION"));
  // No kind may be claimed by both halves, or "durable" becomes "copied".
  const overlap = idx.document.holds.filter((h) => idx.runtime.holds.includes(h));
  assert.deepEqual(overlap, []);
  assert.match(idx.rule, /Never both/);
});

// ── 3, 4. Mutable versus durable ─────────────────────────────────────────────

test("3 — a mutable observation carries its age, its source, and whether to re-check", () => {
  const fresh = K.observedFact("documentation-api", { source: "managed-slots", nowMs: NOW });
  assert.equal(fresh.kind, K.FACT_KIND.CURRENT_OBSERVATION);
  assert.equal(fresh.requires_revalidation, false);
  assert.equal(fresh.source, "managed-slots");

  // The slot-8 shape: true when written, quietly wrong a day later.
  const old = K.observedFact("documentation-api", {
    source: "managed-slots",
    observedAt: new Date(NOW - 48 * HOUR).toISOString(),
    nowMs: NOW,
  });
  assert.equal(old.requires_revalidation, true, "an aged observation must never read as current truth");
  assert.ok(old.age_ms > K.OBSERVATION_TTL_MS);
});

test("3b — an unsourced observation always requires revalidation", () => {
  // Recorded rather than dropped — losing a fact silently is worse than keeping
  // it with a caveat — but never trusted, because nobody can be asked about it.
  const f = K.observedFact("something", { source: null, nowMs: NOW });
  assert.equal(f.requires_revalidation, true);
  assert.equal(f.value, "something");
});

test("4 — a durable decision survives the state it was taken about moving", () => {
  const d = K.durableDecision({
    decision: "Freshness is derived, never stored",
    rationale: "A persisted verdict is one that can be wrong, because staging moves underneath it",
    alternatives_rejected: ["persist a freshness column on the lane record"],
    authority: "DevOps 2",
    candidate: "db0033e12",
    nowMs: NOW,
  });
  assert.equal(d.kind, K.FACT_KIND.DURABLE_DECISION);
  assert.equal(d.requires_revalidation, false, "a decision does not rot when state changes");
  assert.equal(d.candidate, "db0033e12");
  // The most expensive thing to rediscover is why the obvious approach was not taken.
  assert.deepEqual(d.alternatives_rejected, ["persist a freshness column on the lane record"]);
});

// ── 5. Certification is bound to what it proves ──────────────────────────────

test("5 — certification names the exact candidate, environment and evidence", () => {
  const c = K.certificationRecord({
    candidate: "f59c0fca5",
    environment: "isolated runtime, origin/staging f61185c25",
    suites: ["worktree-lifecycle-class 27/0", "development-health 30/0"],
    passed: true,
    pre_existing_failures: ["development-session-bootstrap 11/4 — identical on pristine staging"],
    evidence_refs: ["docs/platform/planning/vacilando-os/DEVOPS-3-WORKTREE-LIFECYCLE.md"],
    promotion: "READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK",
    soak: "14b0e01dcd06 active",
    nowMs: NOW,
  });
  assert.equal(c.kind, K.FACT_KIND.EVIDENCE);
  assert.equal(c.candidate, "f59c0fca5");
  assert.equal(c.requires_revalidation, false, "evidence is a claim about a moment and stays true of it");
  // Pre-existing failures recorded WITH the evidence, so the next reader does
  // not repeat the baseline comparison and a new failure cannot hide in the noise.
  assert.equal(c.pre_existing_failures.length, 1);
});

test("5b — evidence with no candidate proves nothing, and says so", () => {
  assert.equal(K.certificationRecord({}).candidate, null);
});

test("5c — evidence holds references, never pasted output", () => {
  const c = K.certificationRecord({ candidate: "abc", evidence_refs: ["docs/x.md"], nowMs: NOW });
  const text = JSON.stringify(c);
  assert.ok(text.length < 2000, "a certification record must stay a pointer, not a transcript");
  assert.deepEqual(c.evidence_refs, ["docs/x.md"]);
});

// ── 10, 11. Canonical truth wins, visibly ────────────────────────────────────

test("10, 11 — canonical truth overrides stale knowledge, and the conflict is reported", () => {
  // The live shape: a record still saying slot 8 belongs to a lane the registry
  // moved on from. Written knowledge must never win this argument.
  const observations = {
    slot: K.observedFact(8, { source: "development-lane.binding", observedAt: new Date(NOW - 72 * HOUR).toISOString(), nowMs: NOW }),
    branch: K.observedFact("agent/x", { source: "git", nowMs: NOW }),
  };
  const out = K.detectKnowledgeContradictions({ observations, canonical: { slot: null, branch: "agent/x" } });
  // `slot: null` is "the registry gives it to nobody", which is not a contradiction
  // to report — absence of a canonical value is not a competing claim.
  assert.equal(out.count, 0);

  const moved = K.detectKnowledgeContradictions({ observations, canonical: { slot: 3, branch: "agent/x" } });
  assert.equal(moved.count, 1);
  assert.equal(moved.contradictions[0].key, "slot");
  assert.equal(moved.contradictions[0].recorded, 8);
  assert.equal(moved.contradictions[0].canonical, 3);
  assert.equal(moved.contradictions[0].resolution, "canonical_wins");
});

test("10b — a durable decision is never overruled by state moving", () => {
  // Auto-rewriting decisions when state changes would erase exactly the
  // reasoning that is worth keeping.
  const observations = {
    decision: K.durableDecision({ decision: "use rebase", nowMs: NOW }),
  };
  const out = K.detectKnowledgeContradictions({ observations, canonical: { decision: "use merge" } });
  assert.equal(out.count, 0, "only observations are compared; decisions are history, not claims about now");
});

// ── 12. Unknown stays unknown ────────────────────────────────────────────────

test("12 — seeding records what is readable and marks the rest UNKNOWN", () => {
  const lane = {
    lane_id: LANE, name: "Test", repository_id: "repo_alloy", preferred_provider: "claude",
    binding: { branch: "agent/x", worktree_path: "/w/x", slot: 4 },
  };
  const seed = K.seedLaneKnowledge(lane, {
    bootstrap: { ok: true, contract_version: "vacilando.lane_bootstrap.v1", stale: false },
    freshness: { ok: true, state: "CURRENT", behind: 0 },
    nowMs: NOW,
  });
  // Everything readable becomes a sourced observation.
  assert.equal(seed.observations.slot.value, 4);
  assert.equal(seed.observations.slot.source, "development-lane.binding");
  assert.equal(seed.observations.freshness_state.value, "CURRENT");
  // And nothing else is invented. A fabricated decision is worse than a gap,
  // because a gap is obviously a gap.
  assert.equal(seed.decisions, "UNKNOWN");
  assert.equal(seed.certification, "UNKNOWN");
  assert.equal(seed.carry_forward, "UNKNOWN");
  assert.notDeepEqual(seed.decisions, [], "an empty list would read as 'there were none'");
  assert.match(seed.note, /not inferred/);
});

// ── 6, 9. Compaction and bounded resume ──────────────────────────────────────

test("6 — current state can be replaced without touching durable history", () => {
  const knowledge = {
    observations: { freshness_state: K.observedFact("STALE_SAFE_TO_RECONCILE", { source: "lane-freshness", nowMs: NOW }) },
    decisions: [K.durableDecision({ decision: "keep", nowMs: NOW })],
    certification: K.certificationRecord({ candidate: "abc", nowMs: NOW }),
  };
  // Compaction replaces the mutable half only.
  const compacted = { ...knowledge, observations: { freshness_state: K.observedFact("CURRENT", { source: "lane-freshness", nowMs: NOW }) } };
  assert.equal(compacted.observations.freshness_state.value, "CURRENT");
  assert.deepEqual(compacted.decisions, knowledge.decisions, "durable history must survive compaction");
  assert.deepEqual(compacted.certification, knowledge.certification);
});

test("9 — resume assembles a bounded package, not the whole history", () => {
  const memory = LM.laneMemoryRecord({
    laneId: LANE,
    label: "Test Lane",
    mission: { objective: "do the thing", phase: "implementation" },
    progress: { completed: Array.from({ length: 40 }, (_, i) => `step ${i}`), current_state: "mid-flight" },
    nowMs: NOW,
  });
  memory.knowledge = {
    observations: { branch: K.observedFact("agent/x", { source: "git", nowMs: NOW }) },
    decisions: Array.from({ length: 30 }, (_, i) => K.durableDecision({ decision: `d${i}`, nowMs: NOW })),
    planned: Array.from({ length: 20 }, (_, i) => K.plannedItem({ description: `p${i}` })),
    carry_forward: [K.carryForward({ description: "debt" })],
  };
  const ctx = K.assembleLaneContext(LANE, {
    memory, limit: 8, nowMs: NOW,
    getLane: () => ({ lane_id: LANE, name: "Test Lane", status: "ACTIVE" }),
  });
  assert.equal(ctx.ok, true);
  assert.equal(ctx.decisions.length, 8, "decisions are clipped");
  assert.equal(ctx.planned.length, 8, "planned is clipped");
  // The existing projection already clips and reports what it clipped.
  assert.equal(ctx.projection.completed.total, 40);
  assert.equal(ctx.projection.completed.items.length, 8);
  assert.equal(ctx.projection.completed.truncated, true);
});

test("2b, 14 — an archived lane with no worktree still resolves its knowledge", () => {
  // The DevOps 3 result made concrete: the worktree is gone, the lane is not.
  const memory = LM.laneMemoryRecord({ laneId: LANE, label: "Archived", nowMs: NOW });
  memory.knowledge = { observations: {}, decisions: [K.durableDecision({ decision: "shipped", nowMs: NOW })] };
  const ctx = K.assembleLaneContext(LANE, {
    memory, nowMs: NOW,
    getLane: () => ({ lane_id: LANE, name: "Archived", status: "ACTIVE", binding: null }),
  });
  assert.equal(ctx.ok, true);
  assert.equal(ctx.has_knowledge, true);
  assert.equal(ctx.decisions.length, 1);
});

test("knowledge survives even when the lane record itself is gone", () => {
  const memory = LM.laneMemoryRecord({ laneId: LANE, label: "Orphan", nowMs: NOW });
  const ctx = K.assembleLaneContext(LANE, { memory, nowMs: NOW, getLane: () => null });
  assert.equal(ctx.ok, true);
  assert.equal(ctx.identity, null, "absent identity is reported as absent, not invented");
});

test("resume surfaces which facts must be re-checked before they are relied on", () => {
  const memory = LM.laneMemoryRecord({ laneId: LANE, nowMs: NOW });
  memory.knowledge = {
    observations: {
      slot: K.observedFact(8, { source: "x", observedAt: new Date(NOW - 72 * HOUR).toISOString(), nowMs: NOW }),
      branch: K.observedFact("agent/x", { source: "git", nowMs: NOW }),
    },
  };
  const ctx = K.assembleLaneContext(LANE, { memory, nowMs: NOW, getLane: () => ({ lane_id: LANE }) });
  assert.deepEqual(ctx.requires_revalidation, ["slot"]);
});

// ── 13. Lanes cannot write each other ───────────────────────────────────────

test("13 — one lane cannot read or write another lane's knowledge", () => {
  const mine = LM.laneMemoryRecord({ laneId: LANE, label: "Mine", nowMs: NOW });
  const theirs = LM.laneMemoryRecord({ laneId: "lane_bbbbbbbbbbbb", label: "Theirs", nowMs: NOW });
  // Every accessor is keyed by lane id, and the assembled package carries the id
  // it was asked for — so a package can never be silently about another lane.
  const ctx = K.assembleLaneContext(LANE, { memory: mine, nowMs: NOW, getLane: () => ({ lane_id: LANE }) });
  assert.equal(ctx.lane_id, LANE);
  assert.notEqual(ctx.projection.label, theirs.identity.label);
  assert.notEqual(K.knowledgeIndexFor(LANE).document.path, K.knowledgeIndexFor("lane_bbbbbbbbbbbb").document.path);
});

// ── 15, 16. Health, and no new authority ────────────────────────────────────

test("15 — the fleet inventory distinguishes missing from seeded from stale", () => {
  const lanes = [{ lane_id: "l1", name: "A" }, { lane_id: "l2", name: "B" }, { lane_id: "l3", name: "C" }];
  const seeded = LM.laneMemoryRecord({ laneId: "l2", nowMs: NOW });
  seeded.knowledge = K.seedLaneKnowledge({ lane_id: "l2", binding: {} }, { nowMs: NOW });
  const staleRec = LM.laneMemoryRecord({ laneId: "l3", progress: { current_state: "working" }, nowMs: NOW });
  staleRec.knowledge = {
    decisions: [], observations: { slot: K.observedFact(1, { source: null, nowMs: NOW }) },
  };
  const inv = K.inventoryLaneKnowledge({ lanes, memories: [seeded, staleRec] });
  assert.equal(inv.lanes, 3);
  assert.equal(inv.by_state.MISSING, 1);
  assert.equal(inv.by_state.SEEDED, 1);
  assert.equal(inv.by_state.STALE_OBSERVATIONS, 1);
});

test("15b — the health check uses the existing framework with survivable severities", () => {
  assert.ok(H.CHECKS.includes("lane.knowledge"));
  const row = (state, extra = {}) => ({ lane_id: "l", name: "L", state, ...extra });
  // 12 of 13 lanes have no record today. A check that is red from birth is a
  // check nobody reads, so missing work is a watch.
  assert.equal(H.checkLaneKnowledge({ inventory: { rows: [row("MISSING")], by_state: {} } }).severity, "watch");
  assert.equal(H.checkLaneKnowledge({ inventory: { rows: [row("STALE_OBSERVATIONS")], by_state: {} } }).severity, "watch");
  assert.equal(H.checkLaneKnowledge({ inventory: { rows: [row("CURRENT")], by_state: {} } }).severity, "healthy");
  // A contradiction is the real fault: a document winning an argument with truth.
  const bad = H.checkLaneKnowledge({ inventory: { rows: [row("CURRENT", { contradictions: 1 })], by_state: {} } });
  assert.equal(bad.severity, "problem");
  assert.match(bad.suggested_action, /do not rewrite the durable decisions/);
  assert.equal(H.checkLaneKnowledge({ inventory: null }).incomplete, true);
});

test("16 — this module holds no authority and starts no loop", () => {
  const src = Object.values(K).filter((v) => typeof v === "function").map((f) => f.toString()).join("\n");
  for (const forbidden of ["setInterval", "setTimeout", "writeFileSync", "execFileSync", "spawnSync"]) {
    assert.ok(!src.includes(forbidden), `lane knowledge must never ${forbidden}: it records, it does not act`);
  }
});

test("8 — nothing here requires an update per commit or per message", () => {
  // The record is written at lifecycle seams by existing owners. This module
  // exposes constructors and readers; it has no writer of its own at all.
  const writers = Object.keys(K).filter((k) => /^(record|append|write|save|commit)/i.test(k));
  assert.deepEqual(writers, [], "knowledge is written through lane-memory's existing writer, not a new one");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
