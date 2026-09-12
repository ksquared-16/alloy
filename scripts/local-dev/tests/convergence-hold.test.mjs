/**
 * Deployment hold for a convergence window.
 *
 * One question: can another lane replace the running Gateway while a
 * convergence holds the host? Until now, yes — and it did.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = mkdtempSync(join(tmpdir(), "vac-hold-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");

const {
  GATEWAY_HOST_MUTATION_RESOURCE, acquireGatewayHostMutation, releaseGatewayHostMutation,
  gatewayHostMutationHolder, assertGatewayHostMutationAllowed,
} = await import("../lib/vacilando/gateway-host-mutation.mjs");
const { createDurableLane } = await import("../lib/vacilando/development-lane.mjs");
const { createQueuedRun, transitionExecutionRun } = await import("../lib/vacilando/execution-run.mjs");

/**
 * A real lane and a real run, because the resource governor refuses
 * `run_not_found` — which is the governor being right: a hold has to belong to
 * something that can release it.
 */
function realRun(name) {
  const lane = createDurableLane({ name, origin: "test", root: ROOT });
  assert.equal(lane.ok, true, lane.error);
  const q = createQueuedRun({ laneId: lane.lane.lane_id, instruction: "convergence", worktreePath: join(HERE, "..", "..", ".."), origin: "operator", root: ROOT });
  assert.equal(q.ok, true, q.error);
  const m = transitionExecutionRun(q.run.run_id, "EXECUTING", { origin: "system", root: ROOT, reason: "delivered" });
  return { laneId: lane.lane.lane_id, runId: (m.run || q.run).run_id };
}

const CONV = realRun("Convergence");
const OTHER = realRun("Someone Else");

test("an unheld host allows a toolkit install exactly as before", () => {
  assert.equal(gatewayHostMutationHolder(ROOT), null);
  assert.equal(assertGatewayHostMutationAllowed({ root: ROOT }).ok, true);
});

test("a held host refuses another run, and names the holder", () => {
  const got = acquireGatewayHostMutation({ runId: CONV.runId, laneId: CONV.laneId, reason: "final convergence", root: ROOT });
  assert.equal(got.ok, true, got.error);
  assert.equal(got.granted, true, `not granted: ${JSON.stringify(got).slice(0, 200)}`);

  const holder = gatewayHostMutationHolder(ROOT);
  assert.equal(holder.run_id, CONV.runId);
  assert.equal(holder.lane_id, CONV.laneId);

  const other = assertGatewayHostMutationAllowed({ runId: OTHER.runId, root: ROOT });
  assert.equal(other.ok, false);
  assert.equal(other.error, "gateway_host_mutation_held");
  assert.match(other.detail, new RegExp(CONV.runId), "the refusal must name who holds it");
  assert.match(other.detail, new RegExp(CONV.laneId));
});

test("the holder's own run may proceed", () => {
  assert.equal(assertGatewayHostMutationAllowed({ runId: CONV.runId, root: ROOT }).ok, true);
});

test("the hold is visible, auditable and removable", () => {
  assert.ok(gatewayHostMutationHolder(ROOT).granted_at, "it records when it was taken");
  const rel = releaseGatewayHostMutation({ runId: CONV.runId, root: ROOT });
  assert.ok(rel.ok !== false, JSON.stringify(rel));
  assert.equal(gatewayHostMutationHolder(ROOT), null, "and it is gone afterwards");
  assert.equal(assertGatewayHostMutationAllowed({ runId: OTHER.runId, root: ROOT }).ok, true);
});

/* ── the seam that was missing ──────────────────────────────────────────── */
test("the governed toolkit install now consults the hold", () => {
  const src = readFileSync(join(LIB, "trusted-host-actions.mjs"), "utf8");
  const branch = src.slice(src.indexOf("ACTION_TYPES.HOST_INSTALL_TOOLKIT"));
  const guardIdx = branch.indexOf("assertGatewayHostMutationAllowed");
  const execIdx = branch.indexOf("executeInstallToolkitTrustedHostAction");
  assert.ok(guardIdx > -1, "the install branch must consult the hold");
  assert.ok(guardIdx < execIdx, "and must consult it BEFORE installing");
});

test("the Gateway installer script kept its own guard", () => {
  const sh = readFileSync(join(HERE, "..", "install-vacilando-gateway.sh"), "utf8");
  assert.match(sh, /gateway-host-mutation\.mjs/, "the pre-existing enforcement is unchanged");
  assert.match(sh, /VACILANDO_SKIP_HOST_MUTATION_GUARD/, "including its explicit operator override");
});

test("no second lock is introduced", () => {
  const src = readFileSync(join(LIB, "gateway-host-mutation.mjs"), "utf8");
  // It reuses the ordinary resource governor rather than keeping its own store.
  assert.match(src, /execution-resource\.mjs/);
  for (const bad of ["writeFileSync", "new Map(", "LOCK_FILE"]) {
    assert.ok(!src.includes(bad), `the hold must not keep its own ${bad}`);
  }
});

test("normal development is unaffected: only host mutation is gated", () => {
  // The resource key names host mutation specifically, not promotion or work.
  assert.equal(GATEWAY_HOST_MUTATION_RESOURCE, "gateway_host_mutation");
  const src = readFileSync(join(LIB, "trusted-host-actions.mjs"), "utf8");
  // Other action types are not gated by it.
  for (const other of ["REPOSITORY_MERGE_PULL_REQUEST", "DATABASE_READ_CENSUS", "VACILANDO_RETIRE_WORKTREE"]) {
    const i = src.indexOf(`ACTION_TYPES.${other}`);
    if (i < 0) continue;
    const window = src.slice(i, i + 400);
    assert.ok(!window.includes("assertGatewayHostMutationAllowed"), `${other} must not be gated by the host hold`);
  }
});
