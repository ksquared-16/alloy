/**
 * One Host Steward cycle, end to end.
 *
 * This is the only module that both observes and mutates, and it does the
 * mutating exclusively by calling owners certified elsewhere. Its own
 * contribution is sequencing, locking, verification and audit.
 *
 * EVERY RESOURCE IS ISOLATED. A resource whose observation throws, whose owner
 * is missing, or whose postcondition fails stops work on THAT resource and the
 * cycle continues. A health loop that aborts on its first bad resource stops
 * observing exactly when observation matters most.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, loadavg, cpus } from "node:os";
import { join } from "node:path";
import {
  acquireCycleLock, releaseCycleLock, buildCyclePlan, recordAction, resourceKey,
  classifyHostAdmission, hygieneDue, recordHygieneCycle,
} from "./host-steward-cycle.mjs";
import { residualHeavyCommands, asStewardResource } from "./heavy-command-registry.mjs";
import { applyStewardPlan } from "./host-steward-execute.mjs";
import { executionRunStorePath } from "./execution-run.mjs";

/** Read host memory/load signals for Host Admission V2. Unreadable stays null. */
export function observeHostSignals({ exec = defaultExec } = {}) {
  const vm = exec("/usr/bin/vm_stat", []);
  const page = Number((vm.match(/page size of (\d+)/) || [])[1] || 16384);
  const pages = (k) => { const m = vm.match(new RegExp(`${k}:\\s+(\\d+)`)); return m ? Number(m[1]) * page : null; };
  const swap = exec("/usr/sbin/sysctl", ["-n", "vm.swapusage"]);
  const mb = (k) => { const m = swap.match(new RegExp(`${k} = ([0-9.]+)M`)); return m ? Number(m[1]) * 1048576 : null; };
  const total = Number(String(exec("/usr/sbin/sysctl", ["-n", "hw.memsize"])).trim()) || null;
  const free = pages("Pages free");
  const inactive = pages("Pages inactive");
  return {
    totalBytes: total,
    freeBytes: free,
    availableBytes: free != null
      ? free + (pages("Pages speculative") || 0) + (pages("Pages purgeable") || 0) + (inactive || 0) * 0.5
      : null,
    compressorBytes: pages("Pages occupied by compressor"),
    swapTotalBytes: mb("total"),
    swapUsedBytes: mb("used"),
    loadAvg: loadavg(),
    cores: cpus().length,
  };
}

function defaultExec(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: "utf8", timeout: 15000 }); } catch { return ""; }
}

/** Run states by id, or null when the store cannot be read — null is never "no owner". */
export function readRunStates(root) {
  try {
    const p = executionRunStorePath(root);
    if (!existsSync(p)) return null;
    const j = JSON.parse(readFileSync(p, "utf8"));
    const byId = new Map();
    for (const v of Object.values(j.lanes || {})) {
      const rs = Array.isArray(v) ? v : (v.runs || Object.values(v).find(Array.isArray) || []);
      for (const r of rs) if (r?.run_id) byId.set(r.run_id, r.state);
    }
    return byId;
  } catch { return null; }
}

const defaultGroupAlive = (pgid) => { try { process.kill(-Number(pgid), 0); return true; } catch { return false; } };

/**
 * Execute one cycle.
 *
 * `dryRun` observes and plans without mutating — the same planner, so a preview
 * and a real cycle can never disagree about what would happen.
 */
export function runStewardCycle({
  root,
  nowMs = Date.now(),
  dryRun = false,
  groupAlive = defaultGroupAlive,
  exec = defaultExec,
  stopDevServer = null,
} = {}) {
  const startedMs = nowMs;
  const wallStart = Date.now();
  const lock = dryRun ? { ok: true, cycle_id: "hsc_dryrun" } : acquireCycleLock({ root, nowMs });
  if (!lock.ok) return { ok: false, error: lock.error, running: lock.running };

  const cycleId = lock.cycle_id;
  const problems = [];
  let resources = [];
  let admissionBefore = null;

  // ── Observe. Each observation is independently fallible.
  try {
    const states = readRunStates(root);
    const residual = residualHeavyCommands({
      root,
      runStateFor: (id) => (states ? states.get(id) ?? null : null),
      groupAlive,
      nowMs,
    });
    // A run store we could not read means ownership is UNKNOWN, and unknown
    // ownership must reach the classifier as unknown — not as "no owner".
    // NOTE: residualHeavyCommands already yields owning_runs === null when no
    // state resolves, so unknown ownership reaches the classifier as unknown
    // without a second guard here. A redundant guard that no mutation can kill
    // is dead code pretending to be safety.
    resources = residual.map((r) => asStewardResource(r));
  } catch (e) { problems.push({ stage: "observe_residual", error: String(e?.message || e) }); }

  try { admissionBefore = classifyHostAdmission(observeHostSignals({ exec })); }
  catch (e) { problems.push({ stage: "observe_admission", error: String(e?.message || e) }); }

  const plan = buildCyclePlan({ cycleId, resources, admission: admissionBefore, root: dryRun ? null : root, nowMs });

  if (dryRun) {
    return { ok: true, dry_run: true, cycle_id: cycleId, plan, admission_before: admissionBefore, problems };
  }

  // ── Execute, one resource at a time, through canonical owners only.
  const executed = [];
  const refused = [];
  for (const entry of plan.proposed) {
    try {
      if (entry.action === "terminate_terminal_test_process") {
        const stewardPlan = {
          fingerprint: plan.plan_fingerprint,
          autonomous: [{
            id: entry.resource_id ?? null,
            action: entry.action,
            ownership: entry.ownership,
            resource_class: entry.resource_class,
            evidence: entry.evidence,
          }],
        };
        const out = applyStewardPlan({ plan: stewardPlan, root, nowMs, stopDevServer });
        const ok = out.ok && out.applied_count === 1;
        // Verify the postcondition rather than trusting the executor.
        const gone = entry.evidence?.pgid != null ? !groupAlive(entry.evidence.pgid) : null;
        const verified = ok && gone === true;
        recordAction({ root, resourceKey: entry.resource_key, action: entry.action, result: { ok: verified }, nowMs });
        (verified ? executed : refused).push({
          ...entry, ok: verified,
          postcondition_verified: gone,
          detail: verified ? null : (out.refused?.[0]?.error || "postcondition not verified"),
        });
        continue;
      }
      // Owners that exist but are invoked by their own subsystem: recorded as
      // proposed-and-delegated rather than silently performed here.
      refused.push({ ...entry, ok: false, detail: `delegated to ${entry.owner}` });
    } catch (e) {
      // One bad resource must not abort the loop.
      problems.push({ stage: "execute", resource: entry.resource_key, error: String(e?.message || e) });
      refused.push({ ...entry, ok: false, detail: String(e?.message || e) });
    }
  }

  let admissionAfter = null;
  if (executed.length) {
    try { admissionAfter = classifyHostAdmission(observeHostSignals({ exec })); }
    catch (e) { problems.push({ stage: "remeasure", error: String(e?.message || e) }); }
  }

  // Duration is measured on the WALL clock; every recorded timestamp uses the
  // cycle's own clock. Mixing them made the cycle untestable: a caller could
  // inject a clock for the decisions and still get real-time audit rows, so a
  // freshly-run cycle read as stale.
  const wallEnd = Date.now();
  const record = {
    cycle_id: cycleId,
    started_at: new Date(startedMs).toISOString(),
    duration_ms: Math.max(0, wallEnd - wallStart),
    admission_before: admissionBefore?.state ?? null,
    admission_after: admissionAfter?.state ?? admissionBefore?.state ?? null,
    observed: plan.classifications,
    proposed: plan.proposed.map((p) => ({ resource_key: p.resource_key, action: p.action, owner: p.owner })),
    executed: executed.map((e) => ({ resource_key: e.resource_key, action: e.action, owner: e.owner, ok: e.ok, postcondition_verified: e.postcondition_verified })),
    refused: refused.map((e) => ({ resource_key: e.resource_key, action: e.action, detail: e.detail })),
    suppressed: plan.suppressed.map((s) => ({ resource_key: s.resource_key, action: s.action, suppressed_because: s.suppressed_because })),
    problems,
  };
  releaseCycleLock({ root, cycleId, record, nowMs });

  return {
    ok: true,
    cycle_id: cycleId,
    plan,
    executed, refused, problems,
    admission_before: admissionBefore,
    admission_after: admissionAfter,
    record,
  };
}

/**
 * One Steward cycle plus, when it is due, one hygiene cycle.
 *
 * WHY A SEPARATE ENTRY POINT RATHER THAN A STAGE INSIDE `runStewardCycle`.
 * `runStewardCycle` is synchronous and ten call sites depend on that; hygiene
 * reclamation is asynchronous. Making the existing function async to add a
 * stage would change every caller's contract to gain nothing, so the async part
 * wraps the sync part instead.
 *
 * WHY NOT A SECOND DAEMON. §13 is explicit. There is one resident loop on this
 * host and hygiene is a stage of it, gated on its own far slower cadence
 * because a hygiene observation costs a `du` over ~100 toolkit directories and
 * an `lsof` per log — real work to reclaim bytes that were equally reclaimable
 * six hours ago.
 *
 * HYGIENE NEVER FAILS THE STEWARD CYCLE. Its result is attached and its
 * failures are recorded; the host's own health does not depend on it.
 */
export async function runStewardCycleWithHygiene({
  root, nowMs = Date.now(), dryRun = false, groupAlive = defaultGroupAlive, exec = defaultExec,
  stopDevServer = null, hygiene = true, forceHygiene = false, hygieneOptions = null,
  recoveryStage = true,
} = {}) {
  const steward = runStewardCycle({ root, nowMs, dryRun, groupAlive, exec, stopDevServer });

  /*
   * RECOVERY FIRST. A host that needs repairing must not spend its cycle
   * tidying, and a control plane at RECOVERY_REQUIRED must not be handing work
   * to a scheduler. Failures here are attached and never abort the cycle.
   */
  let recovery = null;
  if (root && recoveryStage !== false) {
    try { recovery = await runResidentRecoveryStage({ root, nowMs, dryRun }); }
    catch (e) { recovery = { ok: false, error: "recovery_stage_threw", detail: String(e?.message || e) }; }
  }
  const recoveryBlocking = recovery?.failure_class && recovery.failure_class !== "HEALTHY" && !recovery.verified;

  if (!hygiene || !root) return { ...steward, recovery, hygiene: null };
  if (recoveryBlocking) {
    // §13: recovery outranks ordinary work. Hygiene and scheduling wait for a
    // control plane that is not currently broken.
    return { ...steward, recovery, hygiene: { skipped: "control_plane_not_healthy", failure_class: recovery.failure_class } };
  }

  const due = forceHygiene ? { due: true, reason: "forced" } : hygieneDue({ root, nowMs });
  // Carry the recovery result on EVERY return path. Dropping it on the
  // hygiene-not-due branch made the resident stage look like it had not run.
  if (!due.due) return { ...steward, recovery, hygiene: { skipped: "not_due", last_ms: due.last_ms } };

  let result = null;
  try {
    const { runHygieneCycle } = await import("./hygiene-cycle.mjs");
    result = await runHygieneCycle({
      root, nowMs, dryRun,
      // Sizes cost a `du` over a 29 GB estate and no DECISION depends on them;
      // only the scoreboard does, and that is what `vac hygiene` is for.
      withBytes: false,
      ...(hygieneOptions || {}),
    });
  } catch (e) {
    result = { ok: false, error: "hygiene_cycle_threw", detail: String(e?.message || e) };
  }
  if (!dryRun) {
    recordHygieneCycle({
      root, nowMs,
      summary: {
        ok: result?.ok === true,
        executed: result?.executed?.length ?? 0,
        failed: result?.failed?.length ?? 0,
        bytes_reclaimed: result?.bytes_reclaimed ?? 0,
        error: result?.ok === false ? (result.error ?? null) : null,
      },
    });
  }
  return { ...steward, recovery, hygiene: result };
}

/**
 * THE RESIDENT RECOVERY STAGE — the second of Phase 7's two narrow blockers.
 *
 * `control-plane-recovery` has been certified since Phase 3 and was never
 * called by anything on a cadence. That is why `director-forced-to-mac-mini`
 * stayed MITIGATED for four phases: the decision model existed, and nothing
 * drove it. Recovery code existing is not evidence that recovery happens.
 *
 * WHAT THIS STAGE OWNS: sequencing. Nothing else. The classification is
 * `control-plane-recovery.classifyControlPlane`, the decision is `planRecovery`,
 * the repair is whichever owner the policy names, and the episode memory is the
 * recovery module's. No recovery rule is written here, because a rule written
 * in the caller is a rule the decision owner cannot be tested against.
 *
 * ORDER: recovery runs BEFORE hygiene and before scheduling. A host that needs
 * repairing must not spend the cycle tidying, and §13 requires safety to outrank
 * scheduling pressure.
 *
 * THE HONEST LIMIT, stated because it decides what this can ever certify. The
 * Steward runs INSIDE the Gateway process. If that process dies, this stage
 * dies with it, so PROCESS_DEAD is not recoverable from here — launchd's
 * KeepAlive owns that, and it is the independent execution path §14 asks about.
 * What this stage adds is the class launchd cannot see: a Gateway that is alive
 * and not serving, which is exactly the condition
 * `director-forced-to-mac-mini` was opened for.
 */
export async function runResidentRecoveryStage({
  root,
  nowMs = Date.now(),
  dryRun = false,
  observe = null,
  repair = null,
} = {}) {
  if (!root) return { ok: false, error: "missing_runtime_root" };
  const R = await import("./control-plane-recovery.mjs");

  let observation = null;
  try {
    observation = observe ? await observe() : await R.observeControlPlane({ root, nowMs });
  } catch (e) {
    return { ok: false, error: "observation_failed", detail: String(e?.message || e) };
  }

  const plan = R.planRecovery(observation, { root, nowMs });
  const base = {
    ok: true,
    failure_class: plan.failure_class,
    level: plan.level,
    reason: plan.reason,
    escalate: Boolean(plan.escalate),
    action: plan.action ?? null,
    owner: plan.owner ?? null,
  };

  if (plan.failure_class === "HEALTHY") return { ...base, acted: false, why: "nothing to repair" };
  // No action means the decision owner has said this is not ours to fix —
  // Tailscale, an unreachable host, or authority already exhausted. Escalation
  // is the outcome, and it is already on the plan.
  if (!plan.action) {
    // Carry the decision owner's own explanation. Replacing it with a generic
    // word here is how "within attempt cooldown; a faster retry would be a loop"
    // became the unhelpful "waiting".
    return {
      ...base,
      acted: false,
      waiting: Boolean(plan.waiting),
      why: plan.reason || (plan.escalate ? "escalated; no autonomous action applies" : "waiting"),
    };
  }
  if (dryRun) return { ...base, acted: false, dry_run: true, why: "dry run" };

  // The attempt is recorded BEFORE the action, because the action may kill the
  // process holding the memory.
  const episode = R.recordAttempt(plan.episode, { action: plan.action, nowMs, root });

  let performed = null;
  try {
    if (repair) performed = await repair(plan);
    else if (plan.action === "restart_owned_gateway") {
      const H = await import("./control-plane-health.mjs");
      performed = await H.recoverOwnedVacilandoProcess({ root, nowMs });
    } else {
      // An action with no wired owner is REPORTED, never improvised. The wt1
      // dev server proved what ad hoc signalling costs.
      return { ...base, acted: false, episode, why: `no wired repair owner for ${plan.action}`, escalate: true };
    }
  } catch (e) {
    performed = { ok: false, error: String(e?.message || e) };
  }

  // Verify by RE-OBSERVING, never by trusting the repair's own return value.
  let after = null;
  try { after = observe ? await observe() : await R.observeControlPlane({ root, nowMs: Date.now() }); }
  catch { after = null; }
  const verdict = after ? R.classifyControlPlane({ ...after, now_ms: Date.now() }) : null;
  const recovered = verdict?.failure_class === "HEALTHY";
  const finalEpisode = R.recordVerification(episode, {
    ok: recovered,
    detail: verdict ? verdict.why : "the control plane could not be re-observed after the attempt",
    nowMs: Date.now(),
    root,
  });

  return {
    ...base,
    acted: true,
    performed,
    verified: recovered,
    after_class: verdict?.failure_class ?? null,
    episode: finalEpisode,
  };
}
