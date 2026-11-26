#!/usr/bin/env node
/**
 * Admission must end in a provider, or in a truthful failure — never in
 * silence.
 *
 * Observed on the Surfaces lane: admission reached ACTIVE with
 * `provisioning_state: "bound"`, its worktree existed, its branch existed, its
 * instruction sat in a QUEUED run — and there was no agent session at all. The
 * fresh-provision branch set `rec.state = "ACTIVE"` unconditionally after
 * binding, so a failed `startLaneAgentSession` still produced an ACTIVE
 * admission. ACTIVE is outside the QUEUED set the governor sweeps, so nothing
 * ever looked at it again. The lane was permanently admitted without a
 * provider and its instruction was never delivered.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-admission-bootstrap-"));
const WT = mkdtempSync(join(tmpdir(), "vac-admission-wt-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";

const {
  BOOTSTRAP_MAX_ATTEMPTS, admissionForLane, createAdmissionRequest, evaluateAdmissionQueue,
  STRANDED_ADMISSION_MS, getAdmission, readAdmissionStore, reconcileAdmittedWithoutProvider,
  reconcilePendingDelivery, resetAdmissionsForTests,
  setAdmissionImplForTests, resetAdmissionImplForTests, transitionAdmission,
} = await import("../lib/vacilando/execution-admission.mjs");
const { createQueuedRun, getExecutionRun, resetExecutionRunsForTests, transitionExecutionRun } =
  await import("../lib/vacilando/execution-run.mjs");
const { bindDurableLane, createDurableLane, resetDevelopmentLanesForTests } =
  await import("../lib/vacilando/development-lane.mjs");
const { activeAgentSessionForLane, createAgentSession, markAgentSessionActive, patchAgentSession } =
  await import("../lib/vacilando/agent-session.mjs");
const { setAlloyAdapterImplForTests, resetAlloyAdapterImplForTests } =
  await import("../lib/vacilando/alloy-dev-adapter.mjs");

let seq = 0;
function seedAdmittedLane(name) {
  seq += 1;
  const made = createDurableLane({ name: `${name} ${seq}`, origin: "created", preferred_provider: "claude" });
  const laneId = made.lane.lane_id;
  const wt = join(WT, `w${seq}`);
  mkdirSync(wt, { recursive: true });
  const bound = bindDurableLane(laneId, {
    worktree_path: wt, tmux_session: `alloy-seed${seq}`, branch: `agent/claude/${seq}`, slot: null,
  }, { root: ROOT });
  assert.equal(bound.ok, true, bound.error);
  const run = createQueuedRun({ laneId, instruction: `original instruction ${seq}`, worktreePath: wt, root: ROOT }).run;
  const adm = createAdmissionRequest({ laneId, runId: run.run_id, provider: "claude", root: ROOT });
  return { laneId, runId: run.run_id, admissionId: adm.request.admission_id, worktree: wt };
}

let pass = 0;
let fail = 0;
async function test(name, fn) {
  // Each test owns the queue. Without this the sweep picks the OLDEST queued
  // admission — an earlier test's — and every assertion describes the wrong run.
  resetAdmissionsForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  resetDevelopmentLanesForTests?.();
  resetAdmissionImplForTests();
  // These lanes are already bound, so session-start capacity governs them.
  // An empty pane list means the host has no agents running, which is the
  // truth inside an isolated runtime.
  setAlloyAdapterImplForTests({ listPanes: () => [] });
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  finally { resetAdmissionImplForTests(); resetAlloyAdapterImplForTests(); }
}

await test("a failed bootstrap returns to the queue — it never becomes ACTIVE", async () => {
  const { admissionId, runId } = seedAdmittedLane("Surfaces-like");
  let starts = 0;
  setAdmissionImplForTests({
    canProvisionNow: async () => ({ ok: true, available: true }),
    startProviderOnBinding: async () => { starts += 1; return { ok: false, error: "tmux_session_invalid" }; },
  });
  const out = await evaluateAdmissionQueue({ root: ROOT });
  assert.equal(out.admitted, 0);
  assert.equal(starts, 1);
  const rec = getAdmission(admissionId, ROOT);
  assert.equal(rec.state, "QUEUED", "a bootstrap that started nothing must not read as admitted");
  assert.equal(rec.bootstrap_attempts, 1, "and the attempt is observable");
  assert.equal(rec.last_bootstrap_error, "tmux_session_invalid");
  // The instruction is untouched and undelivered.
  const run = getExecutionRun(runId, ROOT);
  assert.equal(run.state, "QUEUED");
  assert.equal(run.delivery.acknowledged, false);
  assert.match(run.instruction, /^original instruction/);
});

await test("retries are bounded, then the lane fails truthfully rather than sitting admitted", async () => {
  const { admissionId } = seedAdmittedLane("Doomed");
  setAdmissionImplForTests({
    canProvisionNow: async () => ({ ok: true, available: true }),
    startProviderOnBinding: async () => ({ ok: false, error: "provider_start_failed" }),
  });
  for (let i = 0; i < BOOTSTRAP_MAX_ATTEMPTS; i += 1) await evaluateAdmissionQueue({ root: ROOT });
  const rec = getAdmission(admissionId, ROOT);
  assert.equal(rec.state, "FAILED", "exhausted bootstrap is a truthful terminal state");
  assert.equal(rec.bootstrap_attempts, BOOTSTRAP_MAX_ATTEMPTS);
  assert.equal(rec.failure_reason, "provider_start_failed");
  // And an exhausted entry is not resurrected by the reconciler.
  const again = reconcileAdmittedWithoutProvider({ root: ROOT, nowMs: Date.now() + STRANDED_ADMISSION_MS + 1_000 });
  assert.equal(again.requeued.some((r) => r.admission_id === admissionId), false);
});

await test("a successful bootstrap delivers the ORIGINAL instruction exactly once", async () => {
  const { admissionId, runId, laneId } = seedAdmittedLane("Healthy");
  const delivered = [];
  let starts = 0;
  setAdmissionImplForTests({
    canProvisionNow: async () => ({ ok: true, available: true }),
    startProviderOnBinding: async ({ lane }) => {
      starts += 1;
      const s = createAgentSession({ laneId: lane.lane_id, root: ROOT });
      markAgentSessionActive(s.session.agent_session_id, { root: ROOT });
      return { ok: true, adopted: true };
    },
    deliverQueuedRun: async (run) => { delivered.push(run.run_id); return { ok: true }; },
  });
  const out = await evaluateAdmissionQueue({ root: ROOT });
  assert.equal(out.admitted, 1, JSON.stringify(out));
  assert.equal(starts, 1, "exactly one provider process was created");
  assert.deepEqual(delivered, [runId], "and only the original queued run was delivered");
  assert.equal(delivered.length, 1, "exactly once");
  assert.equal(getAdmission(admissionId, ROOT).state, "ACTIVE");
  assert.ok(activeAgentSessionForLane(laneId, ROOT));

  // Idempotent: a second sweep must not deliver again or start a second provider.
  await evaluateAdmissionQueue({ root: ROOT });
  assert.equal(starts, 1);
  assert.deepEqual(delivered, [runId]);
});

// ------------------------------------------------- the stranded state itself --

await test("an admission that is ACTIVE with no provider is returned to the queue", () => {
  // Exactly the Surfaces shape: ACTIVE, bound, no session, run still QUEUED.
  const { admissionId, laneId, runId } = seedAdmittedLane("Stranded");
  transitionAdmission(admissionId, "ACTIVE", { root: ROOT, provisioning_state: "bound" });
  assert.equal(activeAgentSessionForLane(laneId, ROOT), null, "no provider, as observed live");

  // A just-admitted entry is not stranded — session start is asynchronous.
  const early = reconcileAdmittedWithoutProvider({ root: ROOT });
  assert.equal(early.requeued.some((r) => r.admission_id === admissionId), false, "not stranded yet");

  const out = reconcileAdmittedWithoutProvider({ root: ROOT, nowMs: Date.now() + STRANDED_ADMISSION_MS + 1_000 });
  const hit = out.requeued.find((r) => r.admission_id === admissionId);
  assert.ok(hit, "the stranded entry must be found");
  assert.equal(hit.from, "ACTIVE");
  assert.equal(getAdmission(admissionId, ROOT).state, "QUEUED", "so the ordinary governor sees it again");
  assert.equal(getExecutionRun(runId, ROOT).state, "QUEUED", "the instruction is untouched");
});

await test("reconciliation never disturbs work that is genuinely fine", () => {
  // A live provider.
  const live = seedAdmittedLane("Live");
  transitionAdmission(live.admissionId, "ACTIVE", { root: ROOT });
  const s = createAgentSession({ laneId: live.laneId, root: ROOT });
  markAgentSessionActive(s.session.agent_session_id, { root: ROOT });

  // A suspended provider: a deliberate durable state, not a stranding.
  const parked = seedAdmittedLane("Parked");
  transitionAdmission(parked.admissionId, "ACTIVE", { root: ROOT });
  const ps = createAgentSession({ laneId: parked.laneId, root: ROOT });
  markAgentSessionActive(ps.session.agent_session_id, { root: ROOT });
  patchAgentSession(ps.session.agent_session_id, { state: "SUSPENDED" }, { root: ROOT });

  // A run that already started.
  const started = seedAdmittedLane("Started");
  transitionAdmission(started.admissionId, "ACTIVE", { root: ROOT });
  transitionExecutionRun(started.runId, "EXECUTING", { root: ROOT });

  const out = reconcileAdmittedWithoutProvider({ root: ROOT, nowMs: Date.now() + STRANDED_ADMISSION_MS + 1_000 });
  const ids = out.requeued.map((r) => r.admission_id);
  assert.equal(ids.includes(live.admissionId), false, "a live provider is not disturbed");
  assert.equal(ids.includes(parked.admissionId), false, "a suspended provider is deliberate, not stranded");
  assert.equal(ids.includes(started.admissionId), false, "work that already started is not requeued");
});

await test("the queue sweep reconciles before it picks a head — this is the restart path", async () => {
  const { admissionId } = seedAdmittedLane("RestartRecovered");
  transitionAdmission(admissionId, "ACTIVE", { root: ROOT, provisioning_state: "bound" });
  let starts = 0;
  setAdmissionImplForTests({
    canProvisionNow: async () => ({ ok: true, available: true }),
    startProviderOnBinding: async ({ lane }) => {
      starts += 1;
      const s = createAgentSession({ laneId: lane.lane_id, root: ROOT });
      markAgentSessionActive(s.session.agent_session_id, { root: ROOT });
      return { ok: true };
    },
    deliverQueuedRun: async () => ({ ok: true }),
  });
  // One ordinary tick — the same call a Gateway restart makes — recovers it.
  const out = await evaluateAdmissionQueue({ root: ROOT, nowMs: Date.now() + STRANDED_ADMISSION_MS + 1_000 });
  assert.equal(starts, 1, "the stranded lane bootstrapped on the very next tick");
  assert.equal(out.admitted, 1);
  // ADMITTED (provider up, delivery deferred to orientation) or ACTIVE
  // (delivered inline) are both fine. What matters is that it left the stranded
  // state and now has a provider.
  const after = getAdmission(admissionId, ROOT);
  assert.ok(["ADMITTED", "ACTIVE"].includes(after.state), `unexpected state ${after.state}`);
  assert.ok(activeAgentSessionForLane(after.lane_id, ROOT), "and a provider exists");
});

await test("an instruction deferred on readiness is retried once the pane is ready", async () => {
  // Observed live on Surfaces: provider up and oriented, pane at an actionable
  // prompt, run QUEUED with `waiting_for_ready_prompt` — and nothing ever tried
  // again, because the queue sweep only looks at QUEUED admissions and this one
  // was ADMITTED.
  const { admissionId, laneId, runId } = seedAdmittedLane("DeferredDelivery");
  transitionAdmission(admissionId, "ADMITTED", { root: ROOT, provisioning_state: "session_starting" });
  const s = createAgentSession({ laneId, runId, root: ROOT });
  markAgentSessionActive(s.session.agent_session_id, { root: ROOT, orientedAt: new Date().toISOString() });
  patchAgentSession(s.session.agent_session_id, { oriented_at: new Date().toISOString() }, { root: ROOT });

  const attempted = [];
  setAdmissionImplForTests({
    deliverQueuedRun: async (ref) => { attempted.push(ref.run_id); return { ok: true }; },
  });
  const out = await reconcilePendingDelivery({ root: ROOT });
  assert.deepEqual(attempted, [runId], "the deferred instruction is re-attempted, and only it");
  assert.equal(out.delivered.length, 1, "the deferred instruction is re-attempted");
  assert.equal(out.delivered[0].run_id, runId, "and it is the ORIGINAL run");

  // A lane with no provider is not retried — that is bootstrap's job.
  const bare = seedAdmittedLane("NoProvider");
  transitionAdmission(bare.admissionId, "ADMITTED", { root: ROOT });
  attempted.length = 0;
  const none = await reconcilePendingDelivery({ root: ROOT });
  assert.equal(none.delivered.some((d) => d.run_id === bare.runId), false);
  assert.equal(attempted.includes(bare.runId), false, "no provider means bootstrap's job, not delivery's");
});

process.stdout.write(`\n1..${pass + fail}\npass ${pass}\nfail ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
