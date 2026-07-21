#!/usr/bin/env node
/**
 * Vacilando Runtime — test harness.
 *
 * Covers the properties the mission demands:
 *   - projections are pure + deterministic (same input → byte-identical output)
 *   - status/health/merge derivations are correct from real-shaped inputs
 *   - approvals surface open gates and never resolved ones
 *   - activity is time-ordered and projected (never reads the wall clock itself)
 *   - gaps are emitted, never faked, when a source is missing
 *   - the server binds loopback-only and answers /api/health + /api/state
 *
 * Pure-function tests use synthetic enriched contexts (no I/O). The server test
 * exercises the real projection but tolerates an empty environment.
 */
import assert from "node:assert";

import { glyphFor, parseAheadBehind, INITIATIVE_LIFECYCLE } from "../lib/vacilando/model.mjs";
import { projectSprint, projectSprints, deriveStatus, decisionIsOpen } from "../lib/vacilando/sprint.mjs";
import { projectWorker, deriveHealth } from "../lib/vacilando/worker.mjs";
import { deriveMergeReadiness, projectRepository } from "../lib/vacilando/repository.mjs";
import { projectApprovals } from "../lib/vacilando/approval.mjs";
import { projectActivity } from "../lib/vacilando/activity.mjs";
import { projectProject } from "../lib/vacilando/project.mjs";
import { startVacilandoServer, LOOPBACK_HOST } from "../lib/vacilando-server.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; process.stdout.write(`  ok   ${name}\n`); }
  catch (e) { fail++; process.stdout.write(`  FAIL ${name}\n       ${e.message}\n`); }
}

// --- fixtures ---------------------------------------------------------------
const ctxManaged = {
  slot: 6, worktree: "wt6-x", sprint: "vacilando-x", provider: "claude",
  git: "dirty", ahead: 1, behind: 0, server: "running", port: "3016",
  path: "/w/wt6-x", branch: "agent/claude/6-vacilando-x", branch_expected: "agent/claude/6-vacilando-x",
  lifecycle: "active", agent_status: "active", meta: { ALLOY_AGENT_ROLE: "Experimental", ALLOY_CREATED_AT: "2026-07-21T00:00:00Z" },
  manifest: null, initiative: null,
  evidence: { count: 2, files: ["a", "b"], newest_ms: 1000 },
  git_recent: { commits: [{ short: "abc", subject: "do thing", author: "claude", at: "2026-07-20T00:00:00Z", at_ms: 5000 }], last_ms: 5000 },
};
const ctxInitiative = (state, decisions = []) => ({
  ...ctxManaged, slot: 1, worktree: "wt1-y", sprint: "y",
  initiative: { key: "y", title: "Y Initiative", state, human_decisions: decisions },
});

// --- model ------------------------------------------------------------------
test("glyphFor is deterministic + stable", () => {
  assert.equal(glyphFor("wt6-x"), glyphFor("wt6-x"));
  assert.ok(typeof glyphFor("anything") === "string");
});
test("parseAheadBehind parses and tolerates junk", () => {
  assert.deepEqual(parseAheadBehind("15/23"), { ahead: 15, behind: 23 });
  assert.deepEqual(parseAheadBehind("nonsense"), { ahead: 0, behind: 0 });
});

// --- sprint status ----------------------------------------------------------
test("deriveStatus: paused wins", () => {
  assert.equal(deriveStatus({ ...ctxManaged, lifecycle: "paused" }), "paused");
});
test("deriveStatus: reviewing initiative → review", () => {
  assert.equal(deriveStatus(ctxInitiative("reviewing")), "review");
});
test("deriveStatus: remediation_required → blocked", () => {
  assert.equal(deriveStatus(ctxInitiative("remediation_required")), "blocked");
});
test("deriveStatus: merge_ready → complete", () => {
  assert.equal(deriveStatus(ctxInitiative("merge_ready")), "complete");
});
test("deriveStatus: open decision blocks", () => {
  assert.equal(deriveStatus(ctxInitiative("implementing", [{ id: "d1", status: "open" }])), "blocked");
});
test("deriveStatus: active + work → running", () => {
  assert.equal(deriveStatus(ctxManaged), "running");
});

// --- progress is honest -----------------------------------------------------
test("progress: null (gap) for managed sprint without initiative", () => {
  const sp = projectSprint(ctxManaged);
  assert.equal(sp.progress.value, null);
  assert.equal(sp.progress.derived, false);
});
test("progress: derived from lifecycle ordinal for initiative sprint", () => {
  const sp = projectSprint(ctxInitiative("implementing"));
  const idx = INITIATIVE_LIFECYCLE.indexOf("implementing");
  assert.equal(sp.progress.value, Math.round((idx / (INITIATIVE_LIFECYCLE.length - 1)) * 100));
  assert.equal(sp.progress.derived, true);
});
test("phase index/total are null (unmodelled gap)", () => {
  const sp = projectSprint(ctxManaged);
  assert.equal(sp.phase.index, null);
  assert.equal(sp.phase.total, null);
});

// --- determinism (the core discipline) --------------------------------------
test("projectSprints is byte-for-byte deterministic", () => {
  const a = JSON.stringify(projectSprints([ctxManaged, ctxInitiative("reviewing")]));
  const b = JSON.stringify(projectSprints([ctxManaged, ctxInitiative("reviewing")]));
  assert.equal(a, b);
});

// --- worker -----------------------------------------------------------------
test("deriveHealth: branch drift → attention", () => {
  assert.equal(deriveHealth({ ...ctxManaged, branch: "wrong", branch_expected: "right" }), "attention");
});
test("deriveHealth: healthy path", () => {
  assert.equal(deriveHealth(ctxManaged), "healthy");
});
test("projectWorker exposes ownership without secrets", () => {
  const w = projectWorker(ctxManaged);
  assert.equal(w.id, "claude-6");
  assert.ok("session_id" in w.ownership);
  assert.ok(!JSON.stringify(w).match(/SERVICE_ROLE|PASSWORD|SECRET/));
});

// --- repository -------------------------------------------------------------
test("deriveMergeReadiness: unreviewed commits are NOT 'ready'", () => {
  assert.equal(deriveMergeReadiness({ initiative: null, ahead: 3, behind: 0, git: "clean" }), "unreviewed");
});
test("deriveMergeReadiness: merge_ready gate → ready", () => {
  assert.equal(deriveMergeReadiness({ initiative: { state: "merge_ready" }, ahead: 3, behind: 0, git: "clean" }), "ready");
});
test("projectRepository: PR field is a declared gap (null)", () => {
  const repo = projectRepository([ctxManaged], { root: {}, slots: {} });
  assert.equal(repo.worktrees[0].pr, null);
});

// --- approvals --------------------------------------------------------------
test("approvals: open question surfaces, resolved does not", () => {
  const inits = [
    { key: "a", title: "A", state: "implementing", human_decisions: [{ id: "d1", status: "open", question: "Q?" }, { id: "d2", status: "resolved", question: "done" }] },
    { key: "b", title: "B", state: "reviewing", human_decisions: [] },
    { key: "c", title: "C", state: "awaiting_promotion_approval", human_decisions: [] },
  ];
  const ap = projectApprovals(inits);
  assert.equal(ap.counts.questions, 1);
  assert.equal(ap.counts.reviews, 1);
  assert.equal(ap.counts.promotions, 1);
  assert.equal(ap.total, 3);
});
test("decisionIsOpen respects resolved/decided/superseded", () => {
  assert.equal(decisionIsOpen({ status: "open" }), true);
  assert.equal(decisionIsOpen({ status: "resolved" }), false);
  assert.equal(decisionIsOpen({ status: "superseded" }), false);
  assert.equal(decisionIsOpen({}), true);
});

// --- activity ---------------------------------------------------------------
test("activity is time-ordered desc and projected from git", () => {
  const older = { ...ctxManaged, sprint: "old", git_recent: { commits: [{ short: "1", subject: "old", author: "c", at: "x", at_ms: 100 }], last_ms: 100 }, meta: {}, evidence: { count: 0 } };
  const newer = { ...ctxManaged, sprint: "new", git_recent: { commits: [{ short: "2", subject: "new", author: "c", at: "x", at_ms: 900 }], last_ms: 900 }, meta: {}, evidence: { count: 0 } };
  const ev = projectActivity([older, newer]);
  assert.equal(ev[0].at_ms, 900);
  assert.equal(ev[0].kind, "commit");
});

// --- project ----------------------------------------------------------------
test("project: multi-project + epics are declared gaps, not invented", () => {
  const p = projectProject({ root: { canonical: "/Users/Kelly/Alloy" }, slots: {} }, [{ key: "y" }]);
  assert.deepEqual(p.epics, []);
  assert.ok(p.gaps.some((g) => g.field.startsWith("epics")));
  assert.ok(p.gaps.some((g) => g.field.startsWith("projects_available")));
});

// --- server (loopback + endpoints) ------------------------------------------
async function serverTests() {
  const { server, close, port } = await startVacilandoServer(0); // ephemeral
  const addr = server.address();
  test("server binds loopback only (127.0.0.1)", () => {
    assert.equal(addr.address, LOOPBACK_HOST);
  });
  const base = `http://${LOOPBACK_HOST}:${addr.port}`;
  const health = await (await fetch(`${base}/api/health`)).json();
  test("GET /api/health → ok", () => {
    assert.equal(health.ok, true);
    assert.equal(health.schema, "vacilando.snapshot.v1");
  });
  const state = await (await fetch(`${base}/api/state`)).json();
  test("GET /api/state → snapshot with schema + arrays", () => {
    assert.equal(state.schema_version, "vacilando.snapshot.v1");
    assert.ok(Array.isArray(state.sprints));
    assert.ok(Array.isArray(state.gaps));
  });
  const notFound = await fetch(`${base}/api/nope`);
  test("unknown /api endpoint → 404 (fail closed)", () => {
    assert.equal(notFound.status, 404);
  });
  close();
}

await serverTests();
process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
