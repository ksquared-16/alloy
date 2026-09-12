/**
 * Lane Knowledge Activation & Handoff Coverage V1.
 *
 * The question every test asks: after a reboot, does Vacilando know what to do
 * with this lane — and if it does not, does it say so rather than guess?
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as LR from "../lib/vacilando/lane-resume.mjs";
import { CHECKPOINT_COLLECTORS, collectCheckpoint } from "../lib/vacilando/maintenance-activation.mjs";
import { evaluateCheckpoint } from "../lib/vacilando/host-maintenance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");
const codeOf = (f) => readFileSync(join(LIB, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const openRun = (over = {}) => ({ run_id: "r1", state: "EXECUTING", instruction: "Certify gate 2", ...over });
const doneRun = (over = {}) => ({ run_id: "r0", state: "COMPLETE", ...over });

/* ── 1 · a deterministic next action ────────────────────────────────────── */
test("an open run's instruction is the strongest next action", () => {
  const d = LR.deriveResumeDisposition({ laneId: "l1", openRun: openRun() });
  assert.equal(d.disposition, LR.DISPOSITION.ACTIONABLE);
  assert.equal(d.source, "open_run_instruction");
  assert.equal(d.next_action, "Certify gate 2");
  assert.equal(LR.sessionDispositionFor(d).may_start, true);
});

test("a completion report's next step is used when no run is open", () => {
  const d = LR.deriveResumeDisposition({ laneId: "l1", latestRun: doneRun({ completion_report: { next_step: "Open the promotion PR" } }) });
  assert.equal(d.disposition, LR.DISPOSITION.ACTIONABLE);
  assert.equal(d.source, "completion_report_next_step");
  assert.equal(d.next_action, "Open the promotion PR");
});

test("a handoff payload is used when neither exists", () => {
  const d = LR.deriveResumeDisposition({ laneId: "l1", handoff: { handoff_id: "ahf_1", payload: { next_action: "Pick up the cert run" } } });
  assert.equal(d.source, "handoff_payload");
  assert.equal(d.handoff_id, "ahf_1");
});

test("the source hierarchy is honoured strongest-first", () => {
  const d = LR.deriveResumeDisposition({
    laneId: "l1",
    openRun: openRun(),
    latestRun: doneRun({ completion_report: { next_step: "weaker" } }),
    handoff: { payload: { next_action: "weakest" } },
    recordedNextStep: "weakest of all",
  });
  assert.equal(d.next_action, "Certify gate 2", "an in-flight instruction outranks every account of the past");
  const ranks = LR.NEXT_ACTION_SOURCES.map((s) => s.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), "the hierarchy is declared in order");
});

/* ── 2/4 · an honest hold, never an invented action ─────────────────────── */
test("a finished run with no recorded next step HOLDS rather than inventing one", () => {
  const d = LR.deriveResumeDisposition({
    laneId: "l1",
    latestRun: doneRun({ completion_report: { summary: "Certified the candidate and filed evidence." } }),
  });
  assert.equal(d.disposition, LR.DISPOSITION.HELD_NEEDS_OPERATOR);
  assert.equal(d.next_action, null, "a summary of what happened is not a decision about what is next");
  assert.ok(d.needs, "and it says what it is waiting for");
  assert.match(d.reason, /invented/);
});

test("an explicitly held lane is durable and safely resumable", () => {
  const d = LR.deriveResumeDisposition({ laneId: "l1", latestRun: doneRun() });
  assert.ok(LR.DURABLE_DISPOSITIONS.includes(d.disposition));
  const s = LR.sessionDispositionFor(d);
  assert.equal(s.action, "HOLD");
  assert.equal(s.may_start, false, "a reboot must not start work nobody decided");
});

test("no evidence at all is UNRESOLVED, which is not durable", () => {
  const d = LR.deriveResumeDisposition({ laneId: "l1" });
  assert.equal(d.disposition, LR.DISPOSITION.UNRESOLVED);
  assert.ok(!LR.DURABLE_DISPOSITIONS.includes(d.disposition));
  assert.equal(LR.sessionDispositionFor(d).may_start, false);
});

test("a held lane is never counted as actionable", () => {
  const held = LR.deriveResumeDisposition({ laneId: "l1", latestRun: doneRun() });
  assert.notEqual(held.disposition, LR.DISPOSITION.ACTIONABLE);
  assert.equal(LR.sessionDispositionFor(held).action, "HOLD");
});

/* ── 3/15 · the maintenance checkpoint ──────────────────────────────────── */
test("a lane with no disposition at all blocks the checkpoint", () => {
  const c = collectCheckpoint({
    lanes: [{ lane_id: "l1", active: true }],
    runs: [], governedActions: [], worktrees: [{ name: "w", durability: "merged" }],
  });
  assert.ok(c.failed.includes("lane_next_action_recorded"));
  assert.equal(evaluateCheckpoint({ measurements: c.measurements }).durable, false);
});

test("an explicit hold satisfies the checkpoint; silence does not", () => {
  const obs = (restart) => ({
    lanes: [{ lane_id: "l1", active: true, restart_context: restart }],
    runs: [], governedActions: [], worktrees: [{ name: "w", durability: "merged" }],
  });
  const held = collectCheckpoint(obs({ disposition: LR.DISPOSITION.HELD_NEEDS_OPERATOR }));
  assert.deepEqual(held.failed, [], "a recorded decision to hold is a recorded decision");
  assert.equal(evaluateCheckpoint({ measurements: held.measurements }).durable, true);

  const silent = collectCheckpoint(obs(null));
  assert.ok(silent.failed.includes("lane_next_action_recorded"));

  const unresolved = collectCheckpoint(obs({ disposition: LR.DISPOSITION.UNRESOLVED }));
  assert.ok(unresolved.failed.includes("lane_next_action_recorded"), "UNRESOLVED is not a decision");
});

test("the checkpoint reports how many lanes are held, so a hold cannot hide", () => {
  const c = collectCheckpoint({
    lanes: [
      { lane_id: "a", active: true, restart_context: { next_action: "go" } },
      { lane_id: "b", active: true, restart_context: { disposition: LR.DISPOSITION.HELD_NEEDS_OPERATOR } },
    ],
    runs: [], governedActions: [], worktrees: [{ name: "w", durability: "merged" }],
  });
  const row = c.rows.find((r) => r.id === "lane_next_action_recorded");
  assert.equal(row.outcome, "PASS");
  assert.equal(row.evidence.held, 1);
  assert.match(row.detail, /1 explicitly held/);
});

/* ── 14 · no lane may vanish from the count ─────────────────────────────── */
test("the collector counts every active lane", () => {
  const lanes = Array.from({ length: 13 }, (_, i) => ({ lane_id: `l${i}`, active: true, restart_context: { disposition: LR.DISPOSITION.HELD_NEEDS_OPERATOR } }));
  const c = collectCheckpoint({ lanes, runs: [], governedActions: [], worktrees: [{ name: "w", durability: "merged" }] });
  const row = c.rows.find((r) => r.id === "lane_next_action_recorded");
  assert.equal(row.evidence.active, 13, "no lane may disappear from the count to make the metric pass");
});

test("an inventory reports unresolved lanes by name rather than hiding them", () => {
  const inv = LR.inventoryLaneResume({
    lanes: [{ lane_id: "a" }, { lane_id: "b" }],
    evidenceFor: (l) => (l.lane_id === "a" ? { openRun: openRun() } : {}),
  });
  assert.equal(inv.lanes, 2);
  assert.equal(inv.complete, false);
  assert.deepEqual(inv.unresolved, ["b"]);
  assert.equal(inv.durable, 1);
});

/* ── 5/6/7/8 · the lifecycle seams ──────────────────────────────────────── */
test("updates happen at six existing seams, and on no timer", () => {
  assert.equal(LR.LIFECYCLE_SEAMS.length, 6);
  for (const s of LR.LIFECYCLE_SEAMS) {
    assert.ok(s.owner && !s.owner.includes("lane-resume"), `${s.id} must delegate to an existing owner`);
    assert.ok(s.changes, `${s.id} must say what changes there`);
  }
  const ids = LR.LIFECYCLE_SEAMS.map((s) => s.id);
  for (const required of ["assignment_accepted", "blocker_discovered", "candidate_certified", "handoff_or_closeout", "lane_parked_or_resumed"]) {
    assert.ok(ids.includes(required), `${required} must be a seam`);
  }
});

test("an assignment replaces a held disposition with the instruction in force", () => {
  const before = LR.deriveResumeDisposition({ laneId: "l1", latestRun: doneRun() });
  assert.equal(before.disposition, LR.DISPOSITION.HELD_NEEDS_OPERATOR);
  const after = LR.deriveResumeDisposition({ laneId: "l1", latestRun: doneRun(), openRun: openRun({ instruction: "New assignment" }) });
  assert.equal(after.disposition, LR.DISPOSITION.ACTIONABLE);
  assert.equal(after.next_action, "New assignment");
});

test("a blocker persists into the record", () => {
  const d = LR.deriveResumeDisposition({ laneId: "l1", openRun: openRun(), blockedOn: "waiting on the Director census" });
  assert.match(d.blocker, /Director census/);
  assert.match(JSON.stringify(LR.resumeRecordFor(d)), /Director census/);
});

test("a certified candidate is carried as a pointer", () => {
  const d = LR.deriveResumeDisposition({ laneId: "l1", openRun: openRun(), candidate: "b43866b85" });
  const rec = LR.resumeRecordFor(d);
  assert.equal(rec.refs.candidate, "b43866b85");
});

test("a handoff updates the next action", () => {
  const d = LR.deriveResumeDisposition({ laneId: "l1", handoff: { handoff_id: "ahf_9", payload: { next_step: "Resume gate 2 step 5" } } });
  assert.equal(d.next_action, "Resume gate 2 step 5");
  assert.equal(LR.resumeRecordFor(d).refs.handoff_id, "ahf_9");
});

/* ── 9/10/11 · independence from ephemeral ownership ────────────────────── */
test("the record survives worktree, slot and session loss because it names none of them", () => {
  const d = LR.deriveResumeDisposition({
    laneId: "l1", openRun: openRun({ worktree_path: "/Users/x/wt", agent_session_id: "sess_1" }), branch: "agent/ui-vac",
  });
  const rec = LR.resumeRecordFor(d);
  const p = LR.resumeRecordIsPortable(rec);
  assert.equal(p.portable, true, `ephemeral keys leaked: ${p.offenders.join(", ")}`);
  const text = JSON.stringify(rec);
  for (const leak of ["/Users/", "sess_", "pid", "3011"]) {
    assert.ok(!text.includes(leak), `the record must not carry ${leak}`);
  }
  assert.equal(rec.lane_id, "l1", "the lane id is the identifier that outlives all three");
});

test("a branch is recorded as a rotting observation, not as the next action", async () => {
  const K = await import("../lib/vacilando/lane-knowledge.mjs");
  const d = LR.deriveResumeDisposition({ laneId: "l1", openRun: openRun(), branch: "agent/ui-vac" });
  const rec = LR.resumeRecordFor(d);
  assert.equal(rec.observations.branch.kind, K.FACT_KIND.CURRENT_OBSERVATION);
  assert.notEqual(rec.planned.description, "agent/ui-vac");
});

test("the portability control actually detects a leak", () => {
  const bad = LR.resumeRecordIsPortable({ refs: { worktree_path: "/Users/x" }, nested: { slot: 8 } });
  assert.equal(bad.portable, false);
  assert.equal(bad.offenders.length, 2);
});

/* ── 12 · bounded ───────────────────────────────────────────────────────── */
test("a resume record is bounded and carries no transcript", () => {
  const huge = "x".repeat(50_000);
  const d = LR.deriveResumeDisposition({ laneId: "l1", openRun: openRun({ instruction: huge }) });
  const rec = LR.resumeRecordFor(d);
  assert.ok(JSON.stringify(rec).length <= LR.RESUME_MAX_BYTES, "the record must stay a pointer set");
  assert.ok(d.next_action.length <= 400);
});

test("durable decisions are not restated in a resume record", () => {
  const d = LR.deriveResumeDisposition({ laneId: "l1", openRun: openRun() });
  const rec = LR.resumeRecordFor(d);
  assert.ok(!("decisions" in rec), "decisions stay where DevOps 4 put them");
  assert.ok(!("promotion_checkpoints" in rec));
});

/* ── 13 · lane isolation ────────────────────────────────────────────────── */
test("one lane's derivation cannot touch another lane's state", () => {
  const a = LR.deriveResumeDisposition({ laneId: "lane_a", openRun: openRun({ instruction: "A work" }) });
  const b = LR.deriveResumeDisposition({ laneId: "lane_b", latestRun: doneRun() });
  assert.equal(a.lane_id, "lane_a");
  assert.equal(b.lane_id, "lane_b");
  assert.notEqual(a.disposition, b.disposition);
  const recA = LR.resumeRecordFor(a);
  assert.equal(recA.lane_id, "lane_a");
  assert.ok(!JSON.stringify(recA).includes("lane_b"));
});

/* ── 16 · no second store, no loop ──────────────────────────────────────── */
test("no second knowledge store and no polling loop is introduced", () => {
  const code = codeOf("lane-resume.mjs");
  for (const f of ["setInterval", "setTimeout", "writeFileSync", "readFileSync", "existsSync", "child_process"]) {
    assert.ok(!code.includes(f), `lane-resume must not use ${f}`);
  }
  const exported = Object.keys(LR);
  assert.ok(!exported.some((k) => /^(write|save|persist|record|store)/.test(k)), `no writer exports: ${exported.join(", ")}`);
  // And it builds its facts with DevOps 4's vocabulary rather than its own.
  assert.ok(code.includes("observedFact") && code.includes("plannedItem") && code.includes("carryForward"),
    "it must use the canonical fact kinds");
});

test("the resume record uses DevOps 4 fact kinds, not a parallel vocabulary", async () => {
  const K = await import("../lib/vacilando/lane-knowledge.mjs");
  const d = LR.deriveResumeDisposition({ laneId: "l1", latestRun: doneRun() });
  const rec = LR.resumeRecordFor(d);
  assert.equal(rec.carry_forward.kind, K.FACT_KIND.CARRY_FORWARD);
  const actionable = LR.resumeRecordFor(LR.deriveResumeDisposition({ laneId: "l1", openRun: openRun() }));
  assert.equal(actionable.planned.kind, K.FACT_KIND.PLANNED, "a next action is intent, not fact");
});

/* ── the real fleet shape ───────────────────────────────────────────────── */
test("the measured fleet shape yields thirteen honest dispositions", () => {
  // Six lanes have an in-flight instruction or a handoff; seven have a finished
  // run and no recorded next step. Measured on 2026-09-12.
  const lanes = [
    ...Array.from({ length: 3 }, (_, i) => ({ lane_id: `open${i}` })),
    ...Array.from({ length: 3 }, (_, i) => ({ lane_id: `hand${i}` })),
    ...Array.from({ length: 7 }, (_, i) => ({ lane_id: `done${i}` })),
  ];
  const inv = LR.inventoryLaneResume({
    lanes,
    evidenceFor: (l) => {
      if (l.lane_id.startsWith("open")) return { openRun: openRun() };
      if (l.lane_id.startsWith("hand")) return { handoff: { payload: { next_action: "continue" } } };
      return { latestRun: doneRun() };
    },
  });
  assert.equal(inv.lanes, 13);
  assert.equal(inv.by_disposition[LR.DISPOSITION.ACTIONABLE], 6);
  assert.equal(inv.by_disposition[LR.DISPOSITION.HELD_NEEDS_OPERATOR], 7);
  assert.equal(inv.durable, 13);
  assert.equal(inv.complete, true, "thirteen honest dispositions, not thirteen green records");
  assert.deepEqual(inv.unresolved, []);
});
