/**
 * MAINTENANCE ACTIVATION READINESS — wiring DevOps 7's gates to the owners that
 * can actually answer them.
 *
 * DevOps 7 built the maintenance cycle and deliberately left three things
 * unwired: nothing collected the five checkpoint booleans, no privileged path
 * could turn a READY_TO_REBOOT intent into a reboot, and no cycle had ever run.
 * The live dry run reported all five checkpoint requirements UNMEASURED and
 * correctly refused — the gate working, with nothing behind it.
 *
 * This adds no maintenance runner, no checkpoint system, no reboot daemon and no
 * config owner. Every collector below asks a module that already holds the fact,
 * and the reboot executor validates a proof rather than deciding anything.
 *
 * Pure: it performs no I/O and executes nothing. Observations are passed in, so
 * an activation decision is a function of evidence and can be replayed.
 */

import { CHECKPOINT_REQUIREMENTS, PHASE } from "./host-maintenance.mjs";

export const ACTIVATION_SCHEMA = "vacilando.maintenance_activation.v1";

export const OUTCOME = Object.freeze({ PASS: "PASS", FAIL: "FAIL", UNMEASURED: "UNMEASURED" });

/* ── A: the five collectors ─────────────────────────────────────────────── */

/**
 * Each checkpoint requirement, and the owner that can answer it.
 *
 * `collect` takes an observation the caller gathered from that owner and returns
 * PASS / FAIL / UNMEASURED with evidence. Absent or malformed input is
 * UNMEASURED — never an optimistic pass — because the entire value of this gate
 * is that it refuses to let a reboot proceed on facts nobody established.
 */
export const CHECKPOINT_COLLECTORS = Object.freeze([
  Object.freeze({
    id: "lane_next_action_recorded",
    owner: "lane-memory / lane-knowledge (DevOps 4)",
    observation: "lanes[] with restart_context.next_action, plus which lanes are active",
    collect(obs) {
      const lanes = obs?.lanes;
      if (!Array.isArray(lanes)) return unmeasured("no lane inventory was supplied");
      const active = lanes.filter((l) => l?.active === true);
      if (!active.length) return pass("no active lane has work to resume", { active: 0 });
      const missing = active.filter((l) => !l?.restart_context?.next_action).map((l) => l.lane_id);
      return missing.length
        ? fail(`${missing.length} active lane(s) have no durable next action`, { lanes: missing.slice(0, 8) })
        : pass(`${active.length} active lane(s) carry a durable next action`, { active: active.length });
    },
  }),
  Object.freeze({
    id: "lane_blockers_recorded",
    owner: "lane-memory (DevOps 4)",
    observation: "lanes[] with blocked_on and, when blocked, a recorded blocker",
    collect(obs) {
      const lanes = obs?.lanes;
      if (!Array.isArray(lanes)) return unmeasured("no lane inventory was supplied");
      const blocked = lanes.filter((l) => l?.active === true && l?.blocked_on);
      const undocumented = blocked.filter((l) => !l?.restart_context?.blocker && !l?.blocker_recorded).map((l) => l.lane_id);
      return undocumented.length
        ? fail(`${undocumented.length} blocked lane(s) did not record what blocks them`, { lanes: undocumented.slice(0, 8) })
        : pass(`${blocked.length} blocked lane(s) recorded their blocker`, { blocked: blocked.length });
    },
  }),
  Object.freeze({
    id: "accepted_executions_durable",
    owner: "governed-action-request (Governance + Async Ack)",
    observation: "governedActions[] with status and durable execution ownership",
    collect(obs) {
      const actions = obs?.governedActions;
      if (!Array.isArray(actions)) return unmeasured("no governed-action inventory was supplied");
      const NONTERMINAL = ["accepted", "approved", "queued", "executing", "in_flight"];
      const inFlight = actions.filter((a) => NONTERMINAL.includes(String(a?.status || "").toLowerCase()));
      // An accepted action is durable when its ownership is recorded, not when a
      // Promise in some process still holds it. That distinction is the whole
      // reason async acknowledgement records the claim before returning.
      const transient = inFlight.filter((a) => !a?.async_execution && !a?.grant_id && !a?.trusted_host_action_id).map((a) => a.request_id);
      return transient.length
        ? fail(`${transient.length} accepted action(s) have no durable execution ownership`, { requests: transient.slice(0, 8) })
        : pass(`${inFlight.length} in-flight action(s) are durably owned`, { in_flight: inFlight.length });
    },
  }),
  Object.freeze({
    id: "worktree_durability_known",
    owner: "worktree-retirement branch durability (DevOps 3)",
    observation: "worktrees[] with a measured durability class",
    collect(obs) {
      const wts = obs?.worktrees;
      if (!Array.isArray(wts)) return unmeasured("no worktree inventory was supplied");
      // DevOps 3's law: unmeasured durability is the state that must never
      // precede a reclaim. Here it must never precede a reboot either, because a
      // worktree whose durability nobody measured may hold the only copy.
      const unknown = wts.filter((w) => !w?.durability || w.durability === "unknown").map((w) => w.name || w.path);
      if (unknown.length) return unmeasured(`${unknown.length} worktree(s) have unmeasured branch durability`, { worktrees: unknown.slice(0, 8) });
      const undurable = wts.filter((w) => w.durability === "unique_local_commits").map((w) => w.name || w.path);
      return undurable.length
        ? fail(`${undurable.length} worktree(s) hold unique local commits`, { worktrees: undurable.slice(0, 8) })
        : pass(`${wts.length} worktree(s) have known durability`, { worktrees: wts.length });
    },
  }),
  Object.freeze({
    id: "run_handoff_filed",
    owner: "execution-run-report",
    observation: "runs[] with state and whether a report was filed",
    collect(obs) {
      const runs = obs?.runs;
      if (!Array.isArray(runs)) return unmeasured("no run inventory was supplied");
      const TERMINAL = ["COMPLETE", "FAILED", "ABANDONED", "CANCELLED"];
      const open = runs.filter((r) => !TERMINAL.includes(String(r?.state || "").toUpperCase()));
      const unreported = open.filter((r) => !r?.last_report_at && !r?.summary_filed).map((r) => r.run_id);
      return unreported.length
        ? fail(`${unreported.length} open run(s) filed no account of where they got to`, { runs: unreported.slice(0, 8) })
        : pass(`${open.length} open run(s) have filed a report`, { open: open.length });
    },
  }),
]);

const pass = (detail, evidence = {}) => ({ outcome: OUTCOME.PASS, detail, evidence });
const fail = (detail, evidence = {}) => ({ outcome: OUTCOME.FAIL, detail, evidence });
const unmeasured = (detail, evidence = {}) => ({ outcome: OUTCOME.UNMEASURED, detail, evidence });

/**
 * Run every collector and hand DevOps 7 the booleans its gate expects.
 *
 * `measurements` is deliberately tri-state at the boundary: a collector that
 * returns UNMEASURED yields `null`, which `evaluateCheckpoint` already treats as
 * blocking. A collector that does not exist at all also yields nothing, so the
 * gate cannot be satisfied by a missing collector — which is the specific
 * accident this mission had to make impossible.
 */
export function collectCheckpoint(observations = {}, { collectors = CHECKPOINT_COLLECTORS } = {}) {
  const rows = [];
  const measurements = {};
  for (const req of CHECKPOINT_REQUIREMENTS) {
    const collector = collectors.find((c) => c.id === req.id);
    if (!collector) {
      rows.push({ id: req.id, outcome: OUTCOME.UNMEASURED, detail: "no collector is wired for this requirement", owner: req.owner });
      continue;
    }
    let result;
    try { result = collector.collect(observations); } catch (e) {
      result = unmeasured(`collector threw: ${String(e?.message || e).slice(0, 120)}`);
    }
    const outcome = result?.outcome && Object.values(OUTCOME).includes(result.outcome) ? result.outcome : OUTCOME.UNMEASURED;
    rows.push({ id: req.id, outcome, detail: result?.detail ?? null, evidence: result?.evidence ?? null, owner: collector.owner });
    if (outcome === OUTCOME.PASS) measurements[req.id] = true;
    else if (outcome === OUTCOME.FAIL) measurements[req.id] = false;
    // UNMEASURED contributes nothing, so evaluateCheckpoint sees it as absent.
  }
  return {
    schema: ACTIVATION_SCHEMA,
    rows,
    measurements,
    unmeasured: rows.filter((r) => r.outcome === OUTCOME.UNMEASURED).map((r) => r.id),
    failed: rows.filter((r) => r.outcome === OUTCOME.FAIL).map((r) => r.id),
    complete: rows.every((r) => r.outcome === OUTCOME.PASS),
  };
}

/** Every requirement has a collector — asserted here so a gap is a value, not a surprise. */
export function collectorCoverage({ collectors = CHECKPOINT_COLLECTORS } = {}) {
  const missing = CHECKPOINT_REQUIREMENTS.filter((r) => !collectors.some((c) => c.id === r.id)).map((r) => r.id);
  const orphan = collectors.filter((c) => !CHECKPOINT_REQUIREMENTS.some((r) => r.id === c.id)).map((c) => c.id);
  return { complete: missing.length === 0 && orphan.length === 0, missing, orphan, requirements: CHECKPOINT_REQUIREMENTS.length };
}

/* ── C/D: the reboot execution owner ────────────────────────────────────── */

/**
 * THE NARROWEST PRIVILEGE PATH THAT EXISTS ON THIS HOST.
 *
 * Audited before choosing. `sudo -n -l` reports a password is required, so there
 * is no passwordless capability today. There are no root LaunchDaemons, and the
 * Gateway runs as a USER LaunchAgent, so nothing in the running system holds
 * root. The user is in `admin`, which means an operator can authorise a change
 * but a background cycle cannot.
 *
 * Three candidates, and the choice matters:
 *
 *   a root LaunchDaemon watching for a request file — a new long-lived
 *     privileged process, which is precisely the "another reboot daemon" this
 *     programme is told not to add, and a far larger attack surface than the job
 *     needs;
 *   osascript System Events restart — runs as the user with no password, and is
 *     refusable by any application with unsaved state, so a maintenance window
 *     could silently not reboot and report that it had;
 *   a sudoers drop-in granting NOPASSWD for exactly one command.
 *
 * The third is chosen. It stores no credential, grants no shell, names one
 * absolute binary with fixed arguments, and is installed once by an operator who
 * already has that authority. The capability is the sudoers line; the
 * AUTHORISATION is the maintenance gate below, and neither is sufficient alone.
 */
export const REBOOT_COMMAND = Object.freeze({ bin: "/sbin/shutdown", args: Object.freeze(["-r", "now"]) });

export const SUDOERS_CONTRACT = Object.freeze({
  path: "/etc/sudoers.d/vacilando-maintenance-reboot",
  mode: "0440",
  // One command, absolute, fixed arguments, no wildcards.
  rule: `%admin ALL=(root) NOPASSWD: ${REBOOT_COMMAND.bin} ${REBOOT_COMMAND.args.join(" ")}`,
  grants: "exactly one reboot invocation",
  does_not_grant: ["a shell", "arbitrary shutdown arguments", "any other binary", "a password-free sudo generally"],
  installed_by: "an operator with admin authority, once, at activation",
});

/** Has the capability been installed? Read, never installed, by this module's caller. */
export function rebootCapability({ sudoersPresent = null, nopasswdVerified = null } = {}) {
  if (sudoersPresent === null || nopasswdVerified === null) {
    return { available: false, reason: "the privileged reboot capability has not been measured", measured: false };
  }
  if (!sudoersPresent) return { available: false, measured: true, reason: `${SUDOERS_CONTRACT.path} is not installed; maintenance can decide to reboot and cannot perform one` };
  if (!nopasswdVerified) return { available: false, measured: true, reason: "the sudoers rule is present but did not verify as passwordless for the exact command" };
  return { available: true, measured: true, command: `${REBOOT_COMMAND.bin} ${REBOOT_COMMAND.args.join(" ")}` };
}

/** How long a READY_TO_REBOOT proof stays usable. Short: the world moves. */
export const REBOOT_PROOF_TTL_MS = 10 * 60 * 1000;

/**
 * MAY THIS EXACT REQUEST REBOOT THE HOST, RIGHT NOW?
 *
 * Seven conditions, all required. The ones that matter most are the last three:
 * drain is re-checked immediately before execution rather than trusted from the
 * earlier decision, a protected mutation that began in between blocks, and a
 * proof that has already been used or has aged out refuses. Without those, an
 * authorisation minted at 03:00 could reboot through a migration that started at
 * 03:07.
 *
 * There is no generic "run shutdown" authority: the request must name the
 * maintenance id that owns it, and a request from any other source is refused
 * without being evaluated further.
 */
export function authorizeReboot({
  request = null,
  window = null,
  checkpoint = null,
  drainNow = null,
  protectedMutationsNow = null,
  capability = null,
  alreadyRebootedThisPeriod = false,
  nowMs = Date.now(),
  ttlMs = REBOOT_PROOF_TTL_MS,
} = {}) {
  const no = (reason, extra = {}) => ({ authorized: false, reason, ...extra });

  if (!request?.maintenance_id) return no("a reboot request must name the maintenance window that owns it");
  if (!window?.maintenance_id) return no("no maintenance window was supplied");
  if (request.maintenance_id !== window.maintenance_id) {
    return no(`the request names maintenance ${request.maintenance_id}; the open window is ${window.maintenance_id}`);
  }
  if (window.phase !== PHASE.READY_TO_REBOOT) {
    return no(`the maintenance window is ${window.phase}, not ${PHASE.READY_TO_REBOOT}`);
  }
  if (!checkpoint?.durable) return no(`the checkpoint gate did not pass: ${checkpoint?.reason || "not measured"}`);
  if (!drainNow || drainNow.safe !== true) {
    // Re-measured here, not inherited: the earlier decision described an earlier
    // host.
    return no(`drain is no longer safe: ${drainNow ? `${drainNow.blockers?.length || 0} blocker(s)` : "not re-measured immediately before execution"}`);
  }
  if (protectedMutationsNow === null || protectedMutationsNow === undefined) {
    return no("protected mutations were not re-checked immediately before execution");
  }
  if (protectedMutationsNow > 0) {
    return no(`${protectedMutationsNow} irreversible mutation(s) began after the reboot decision was made`);
  }
  if (alreadyRebootedThisPeriod) {
    return no("this maintenance period has already initiated a reboot; one period initiates at most one");
  }
  const issued = Date.parse(request.issued_at || "");
  if (!Number.isFinite(issued)) return no("the reboot proof carries no usable issue time");
  if (nowMs - issued > ttlMs) {
    return no(`the reboot proof is ${Math.round((nowMs - issued) / 60000)} minutes old and has expired`);
  }
  if (request.consumed === true) return no("this reboot proof has already been consumed; a replayed proof is refused");
  const cap = capability || rebootCapability({});
  if (!cap.available) return no(`the privileged reboot capability is unavailable: ${cap.reason}`);

  return {
    authorized: true,
    maintenance_id: window.maintenance_id,
    command: `${REBOOT_COMMAND.bin} ${REBOOT_COMMAND.args.join(" ")}`,
    proof_age_ms: nowMs - issued,
    reason: "the maintenance window owns this request, the gates passed, and the host is still safe",
  };
}

/* ── E: the Gateway interpreter ─────────────────────────────────────────── */

/**
 * PIN THE INTERPRETER WITHOUT PINNING IT SO HARD THE GATEWAY CANNOT START.
 *
 * MEASURED, and the picture is finer than "the plist hard-codes a path":
 *
 *   /opt/homebrew/bin/node                    → Cellar/node@22/22.23.2_1/bin/node
 *   /opt/homebrew/opt/node@22/bin/node        → the same file, via the FORMULA link
 *   /opt/homebrew/Cellar/node@22/22.23.2_1/…  → the exact build
 *
 * The plist points at the first. That is the hazard: `bin/node` belongs to
 * whichever node formula is linked, so installing the unversioned `node` formula
 * relinks it to a different MAJOR and the Gateway silently changes interpreter at
 * its next restart.
 *
 * The exact Cellar path is the obvious fix and the wrong one: `brew cleanup`
 * removes old versions, so pinning there converts a silent version change into a
 * Gateway that cannot start at all — a worse failure, in the direction of
 * downtime.
 *
 * `opt/node@22/bin/node` is chosen: bound to the major that was certified,
 * following patch upgrades within it, and surviving cleanup. The remaining drift
 * — a patch bump inside 22 — is then caught rather than prevented, by certifying
 * the ACTUAL `process.version` of the running Gateway after boot.
 */
export const INTERPRETER = Object.freeze({
  FLOATING: "floating",
  MAJOR_PINNED: "major_pinned",
  EXACT: "exact",
  UNKNOWN: "unknown",
});

export function classifyInterpreterPath(path) {
  const p = String(path || "");
  if (!p) return { class: INTERPRETER.UNKNOWN, safe: false, why: "no interpreter path" };
  if (/\/Cellar\/[^/]+\/[^/]+\//.test(p)) {
    return {
      class: INTERPRETER.EXACT, safe: false,
      why: "an exact Cellar path is removed by `brew cleanup`, which turns a version change into a Gateway that cannot start",
    };
  }
  /*
   * THE FLOATING CASE IS TESTED FIRST, AND THE FORMULA LINK MUST BE VERSIONED.
   *
   * A first cut matched `/opt/<name>/bin/` for the formula link — which
   * `/opt/homebrew/bin/node` also satisfies, because `homebrew` is a perfectly
   * good `<name>`. The floating path was therefore classified MAJOR_PINNED and
   * SAFE: the exact opposite of the truth, failing in the direction that says
   * "no action needed" about the one path that needs action.
   *
   * What actually distinguishes them is the `@version` in the formula segment.
   * `node@22` names a major; `homebrew` names the prefix.
   */
  if (/^.*\/bin\/node$/.test(p) && !/\/opt\/[^/]*@[^/]*\/bin\//.test(p)) {
    return {
      class: INTERPRETER.FLOATING, safe: false,
      why: "the unversioned front path follows whichever formula is linked, so a major upgrade silently changes the Gateway's interpreter",
    };
  }
  if (/\/opt\/[^/]*@[^/]*\/bin\//.test(p)) {
    return { class: INTERPRETER.MAJOR_PINNED, safe: true, why: "bound to the certified formula major, follows patch upgrades, survives cleanup" };
  }
  return { class: INTERPRETER.UNKNOWN, safe: false, why: "unrecognised interpreter path shape" };
}

/**
 * Does the Gateway actually run the interpreter that was certified?
 *
 * Asked of the RUNNING process, not of the plist: a plist is an intention, and
 * the whole defect class here is an intention that stopped matching reality.
 * An absent expectation is UNMEASURED and constrains — never "probably fine".
 */
export function certifyInterpreter({ expectedVersion = null, actualVersion = null, plistPath = null, actualPath = null } = {}) {
  const pathClass = classifyInterpreterPath(plistPath);
  if (!expectedVersion || !actualVersion) {
    return { certified: false, outcome: OUTCOME.UNMEASURED, constrained: true, path_class: pathClass.class,
      reason: "the certified or the running Node identity was not measured; the host stays constrained rather than inheriting an unknown interpreter" };
  }
  if (String(expectedVersion) !== String(actualVersion)) {
    return { certified: false, outcome: OUTCOME.FAIL, constrained: true, path_class: pathClass.class,
      expected: String(expectedVersion), actual: String(actualVersion),
      reason: `the Gateway is running Node ${actualVersion}; ${expectedVersion} was certified` };
  }
  return {
    certified: true, outcome: OUTCOME.PASS, constrained: false,
    path_class: pathClass.class, path_safe: pathClass.safe, path_why: pathClass.why,
    expected: String(expectedVersion), actual: String(actualVersion),
    actual_path: actualPath || null,
    reason: pathClass.safe
      ? `Node ${actualVersion} matches the certified identity and the launch path is ${pathClass.class}`
      : `Node ${actualVersion} matches, but the launch path is ${pathClass.class}: ${pathClass.why}`,
  };
}

/* ── L: a planned reboot is not a host failure ──────────────────────────── */

/**
 * A MAINTENANCE REBOOT MUST NOT LOOK LIKE LOSING THE PRIMARY.
 *
 * DevOps 10's standby watches for a primary that stops answering. A planned
 * reboot makes the primary stop answering for several minutes, which is exactly
 * the observation that opens a takeover question — and a standby that took over
 * during scheduled maintenance would fence the very host that is about to come
 * back, for no reason.
 *
 * The distinction is declared, not inferred from timing: an open maintenance
 * window in a rebooting phase is an EXPECTED absence, and leadership is retained
 * across it. Everything else is unexplained and stays DevOps 10's question.
 */
export function absenceClassification({ window = null, heartbeatMissing = false } = {}) {
  if (!heartbeatMissing) return { class: "PRESENT", takeover_question: false, retain_leadership: true, reason: "the primary is answering" };
  const phase = window?.phase ?? null;
  const planned = [PHASE.READY_TO_REBOOT, PHASE.REBOOTING, PHASE.RECOVERING, PHASE.VERIFYING].includes(phase);
  if (planned) {
    return {
      class: "PLANNED_MAINTENANCE", takeover_question: false, retain_leadership: true,
      maintenance_id: window.maintenance_id ?? null, phase,
      reason: "an open maintenance window explains this absence; the primary keeps its leadership epoch across a reboot it announced",
    };
  }
  return {
    class: "UNEXPECTED_ABSENCE", takeover_question: true, retain_leadership: false,
    reason: "no maintenance window explains this absence; it is DevOps 10's question, and its own fencing law applies",
  };
}

/* ── K: the first cycle is a canary ─────────────────────────────────────── */

/**
 * THE FIRST REAL CYCLE IS OBSERVED, NOT TRUSTED.
 *
 * Fixtures prove the contracts; they cannot prove that this machine reboots,
 * that launchd brings the Gateway back, or that the collectors see the real
 * fleet. So the first cycle is attended, and a failure DISABLES unattended
 * recurrence rather than retrying next week — because the failure mode of an
 * unattended weekly reboot that does not come back is a weekly outage.
 */
export const FIRST_CYCLE = Object.freeze({
  attended: true,
  operator_visible_start: true,
  requires_preflight_report: true,
  on_failure: "disable_unattended",
  unattended_after: 2,
});

export function unattendedEligibility({ cycles = [], policy = FIRST_CYCLE } = {}) {
  if (!cycles.length) return { eligible: false, reason: "no maintenance cycle has ever completed; the first is attended" };
  const failed = cycles.filter((c) => c.certified !== true);
  if (failed.length) {
    return {
      eligible: false, disabled: true,
      reason: `${failed.length} maintenance cycle(s) did not certify; unattended reboots stay disabled until a corrected cycle is observed`,
      failures: failed.map((c) => c.maintenance_id).slice(0, 4),
    };
  }
  if (cycles.length < policy.unattended_after) {
    return { eligible: false, reason: `${cycles.length} certified cycle(s); ${policy.unattended_after} are required before unattended operation` };
  }
  return { eligible: true, reason: `${cycles.length} consecutive certified cycles; unattended weekly maintenance may be enabled` };
}

/* ── J: the activation sequence ─────────────────────────────────────────── */

/**
 * The exact post-soak order, with each step's gate.
 *
 * Ordered by dependency rather than convenience: the interpreter must be pinned
 * before a reboot is possible, because a reboot is exactly when an unpinned one
 * changes. The reboot capability is installed LAST among the enabling steps, so
 * every other gate is already proven before the host can be restarted at all.
 */
export const ACTIVATION_SEQUENCE = Object.freeze([
  Object.freeze({ step: 1, id: "toolkit_installed", gate: "the running build is the certified candidate", owner: "host.install_toolkit + toolkit-convergence" }),
  Object.freeze({ step: 2, id: "checkpoint_collectors_measurable", gate: "collectCheckpoint returns no UNMEASURED against the live fleet", owner: "maintenance-activation collectors" }),
  Object.freeze({ step: 3, id: "interpreter_pinned", gate: "the Gateway plist names a major-pinned interpreter and the running version matches", owner: "launchd plist + certifyInterpreter" }),
  Object.freeze({ step: 4, id: "push_guard_installed", gate: "core.hooksPath set and the guard proven to block and to allow", owner: "alloy-install-git-hooks" }),
  Object.freeze({ step: 5, id: "instruction_baseline_stamping", gate: "new lanes record a baseline pointer", owner: "lane bootstrap + agent-configuration" }),
  Object.freeze({ step: 6, id: "schedule_enabled", gate: "the weekly cadence is due-able on the steward cycle", owner: "host-steward-cycle" }),
  Object.freeze({ step: 7, id: "reboot_capability_installed", gate: "the sudoers drop-in verifies passwordless for exactly one command", owner: "operator, once" }),
  Object.freeze({ step: 8, id: "dry_run", gate: "vac maintenance --preflight reports drain safe and checkpoint durable", owner: "vac-maintenance" }),
  Object.freeze({ step: 9, id: "first_cycle_attended", gate: "an operator watches one full cycle including the reboot", owner: "FIRST_CYCLE" }),
  Object.freeze({ step: 10, id: "post_boot_certified", gate: "certifyPostBoot passes and admission reopens", owner: "host-maintenance" }),
]);

export function activationReadiness({ steps = {} } = {}) {
  const rows = ACTIVATION_SEQUENCE.map((s) => {
    const v = steps[s.id];
    return { ...s, outcome: v === true ? OUTCOME.PASS : v === false ? OUTCOME.FAIL : OUTCOME.UNMEASURED };
  });
  const blocked = rows.filter((r) => r.outcome !== OUTCOME.PASS);
  return {
    ready: blocked.length === 0,
    next_step: blocked.length ? blocked[0].id : null,
    rows,
    blocked: blocked.map((r) => r.id),
    reason: blocked.length ? `activation blocked at step ${blocked[0].step}: ${blocked[0].gate}` : "every activation gate has passed",
  };
}
