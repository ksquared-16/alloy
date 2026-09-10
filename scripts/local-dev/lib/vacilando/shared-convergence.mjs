/**
 * HOW A SHARED CHANGE REACHES A LANE — AND WHERE IT STOPS.
 *
 * ── THE PROBLEM THIS ANSWERS ──
 *
 * Vacilando's shared code is promoted once and then has to arrive in a dozen
 * places that restart on different schedules: a Gateway supervisor, its child
 * server, eleven provider sessions, eleven dev servers, eleven worktrees. The
 * Director has repeatedly been left holding the difference, because "installed"
 * reads like "in effect" and is not.
 *
 * MEASURED, live, while writing this: promoted ccebf644dc3d, installed
 * ccebf644dc3d, running fd27ee82c3bf. The symlink had moved and the code had
 * not. That is not an edge case — it is the normal state for the minutes or
 * hours between an install and a restart, and every capability below inherits
 * a different version of it.
 *
 * ── WHY CLASSIFICATION IS BY OWNERSHIP, NOT BY GUESS ──
 *
 * Every entry names the process boundary the change must cross and the evidence
 * for it. A capability whose boundary has not actually been established is
 * UNKNOWN, and stays UNKNOWN: a plausible-looking guess here becomes a lane
 * that Vacilando believes is current and is not, which is worse than an honest
 * gap because nobody goes looking for it.
 */

/** How a promoted change reaches the thing that runs it. Exactly one applies. */
export const PROPAGATION = Object.freeze({
  /** Read from durable state on each use. A change is in effect immediately. */
  LIVE_SHARED: "LIVE_SHARED",
  /** Loaded into the Gateway supervisor or its child server at start. */
  GATEWAY_RESTART_REQUIRED: "GATEWAY_RESTART_REQUIRED",
  /** Carried by a long-lived provider session; new code applies to new sessions. */
  PROVIDER_RESTART_REQUIRED: "PROVIDER_RESTART_REQUIRED",
  /** Served by a lane's dev server; applies when that server restarts. */
  DEV_SERVER_RESTART_REQUIRED: "DEV_SERVER_RESTART_REQUIRED",
  /** Lives in the lane's own checkout; arrives when the branch takes staging. */
  WORKTREE_CONVERGENCE_REQUIRED: "WORKTREE_CONVERGENCE_REQUIRED",
  /** Needs the lane record itself moved or re-registered. */
  LANE_MIGRATION_REQUIRED: "LANE_MIGRATION_REQUIRED",
  /** Superseded and deliberately not propagated. */
  FROZEN_LEGACY: "FROZEN_LEGACY",
  /** The boundary has not been established. Not a synonym for "probably fine". */
  UNKNOWN: "UNKNOWN",
});

/**
 * The shared capabilities, each classified from a measured boundary.
 *
 * `evidence` is the observation that settles it. Where the evidence is a source
 * location, it is named precisely enough to re-check: a classification nobody
 * can re-derive is an opinion with a schema.
 */
export const SHARED_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "gateway_toolkit",
    name: "Gateway / toolkit",
    owner: "gateway supervisor (vacilando-gateway-host.mjs) and its child vacilando-server.mjs",
    propagation: PROPAGATION.GATEWAY_RESTART_REQUIRED,
    evidence: "The supervisor computes SERVER from its own directory and spawns the child on that ABSOLUTE resolved path, so moving toolkit/current reaches neither — not even across the supervisor's own DIRECTOR_REFRESH_EXIT respawn, which re-spawns the same resolved path. Observed live: installed ccebf644dc3d while both supervisor and child ran fd27ee82c3bf.",
    restart_owner: "gateway supervisor",
  }),
  Object.freeze({
    id: "scheduler",
    name: "Scheduler / dispatch",
    owner: "child server process",
    propagation: PROPAGATION.GATEWAY_RESTART_REQUIRED,
    evidence: "vacilando-server.mjs imports scheduler.mjs statically at module load; assignment-dispatch.mjs is reached by dynamic import, which is also cached for the life of the process. Either way the code is fixed at server start.",
    restart_owner: "gateway supervisor",
  }),
  Object.freeze({
    id: "operator_state_projection",
    name: "Operator-state projection",
    owner: "browser, from files served by the child server",
    propagation: PROPAGATION.GATEWAY_RESTART_REQUIRED,
    evidence: "vacilando-ui-model.mjs and gateway-view.mjs are static assets served out of the running server's own toolkit directory. A browser reload cannot fetch a file the server does not have, so the Gateway must be running the new toolkit first; the reload is necessary after that, not instead of it.",
    restart_owner: "gateway supervisor, then a browser reload",
  }),
  Object.freeze({
    id: "notifications",
    name: "Notification production and delivery",
    owner: "child server process; service worker in the browser",
    propagation: PROPAGATION.GATEWAY_RESTART_REQUIRED,
    evidence: "The durable record, delivery policy and push payload all live in lib/vacilando/lane-push.mjs and lane-notifications.mjs, in-process. sw.js is browser-side and updates on its own lifecycle, but it can only tag what the payload carries, so the payload change gates it.",
    restart_owner: "gateway supervisor",
  }),
  Object.freeze({
    id: "provider_lifecycle",
    name: "tmux / provider lifecycle",
    owner: "long-lived tmux provider sessions",
    propagation: PROPAGATION.PROVIDER_RESTART_REQUIRED,
    evidence: "A provider session is a tmux process started with whatever launch behaviour existed at session start. Changing how sessions are created cannot reach a session that already exists; it applies to the next one.",
    restart_owner: "the lane's provider session",
  }),
  Object.freeze({
    id: "browser_session_infra",
    name: "Browser-session infrastructure",
    owner: "child server process; the session itself is a browser profile on disk",
    propagation: PROPAGATION.GATEWAY_RESTART_REQUIRED,
    evidence: "vacilando-server.mjs imports browser-auth.mjs statically, so the code that mints and repairs sessions is fixed at server start. The stored session is durable state and survives independently — a restart changes the CODE, not the signed-in state.",
    restart_owner: "gateway supervisor",
  }),
  Object.freeze({
    id: "managed_slots",
    name: "Managed slots",
    owner: "gateway supervisor AND child server",
    propagation: PROPAGATION.GATEWAY_RESTART_REQUIRED,
    evidence: "managed-slots.mjs is imported by BOTH vacilando-gateway-host.mjs and vacilando-server.mjs, so a slot or port change is fixed in the supervisor too. Restarting only the child would leave the supervisor's port resolution stale — this is the one entry where the supervisor specifically, not merely 'the Gateway', has to go.",
    restart_owner: "gateway supervisor (not the child alone)",
  }),
  Object.freeze({
    id: "tailnet_serve",
    name: "Tailnet Serve mapping",
    owner: "tailscaled, reconciled by the child server",
    propagation: PROPAGATION.GATEWAY_RESTART_REQUIRED,
    evidence: "The serve mapping is external state in tailscaled and is reconciled at runtime, so a mapping change takes effect without any Vacilando restart. A change to the RECONCILER (tailnet-serve.mjs) is in-process and does not. Classified by how a promoted change propagates, which is the reconciler.",
    restart_owner: "gateway supervisor",
  }),
  Object.freeze({
    id: "supabase_browser_transport",
    name: "Supabase browser transport",
    owner: "each lane's own checkout, compiled by its dev server",
    propagation: PROPAGATION.WORKTREE_CONVERGENCE_REQUIRED,
    evidence: "It is application code under web/, which exists per worktree. A lane receives it only when its branch takes staging; no Gateway restart can deliver it. The dev server must then rebuild, but that is the second step, not the boundary that blocks.",
    restart_owner: "the lane's branch, then its dev server",
  }),
  Object.freeze({
    id: "provider_ceiling",
    name: "Provider ceiling",
    owner: "~/.config/alloy-dev/config, read per admission decision",
    propagation: PROPAGATION.LIVE_SHARED,
    evidence: "resolveProviderCeiling() reads the config file at call time, which is exactly the repair made after a governed raise landed in the config while the gate kept enforcing the old value from process.env. The VALUE is live; only a change to the policy code would need a restart.",
    restart_owner: null,
  }),
  Object.freeze({
    id: "dev_server_env",
    name: "Dev-server environment / config",
    owner: "each lane's dev server process",
    propagation: PROPAGATION.DEV_SERVER_RESTART_REQUIRED,
    evidence: "Environment and config are read by the dev server at start; a running Next server keeps the environment it was launched with.",
    restart_owner: "the lane's dev server",
  }),
  Object.freeze({
    id: "lane_metadata",
    name: "Lane metadata",
    owner: "durable lane registry, read per request",
    propagation: PROPAGATION.LIVE_SHARED,
    evidence: "listDurableLanes() reads the registry file on each call rather than caching it in the process, so a metadata change is visible to the next reader.",
    restart_owner: null,
  }),
]);

export function capability(id) {
  return SHARED_CAPABILITIES.find((c) => c.id === id) || null;
}

/** Capabilities whose propagation is blocked by a given restart owner. */
export function capabilitiesBlockedBy(propagation) {
  return SHARED_CAPABILITIES.filter((c) => c.propagation === propagation);
}

/**
 * PROMOTED, INSTALLED, RUNNING — and the process that closes the gap.
 *
 * `convergenceStatus` already answers the three shas and refuses to call a
 * moved symlink converged. What it does not say is WHO has to restart, and
 * "the Gateway" is not actionable when the supervisor and its child are
 * separate processes and only one of them respawning would leave the other
 * stale. This adds the owner and nothing else.
 */
export function runtimeConvergence(status = {}) {
  const promoted = status.staging_sha ?? null;
  const installed = status.installed_sha ?? null;
  const running = status.gateway_executing_sha ?? null;

  const installedIsPromoted = Boolean(promoted && installed && String(promoted).startsWith(installed));
  const runningIsInstalled = running == null ? null : running === installed;

  let restartRequired;
  let reason;
  let owner = null;
  if (runningIsInstalled === null) {
    restartRequired = null;
    reason = "the executing path is not pinned to a sha, so what is running cannot be established";
  } else if (runningIsInstalled === false) {
    restartRequired = true;
    owner = "gateway supervisor";
    reason = `installed ${installed} is not running; the gateway is still executing ${running}`;
  } else if (!installedIsPromoted) {
    restartRequired = false;
    reason = `running matches installed (${installed}), but installed is behind promoted ${promoted}`;
  } else {
    restartRequired = false;
    reason = `promoted, installed and running all agree at ${installed}`;
  }

  return {
    promoted_sha: promoted,
    installed_sha: installed,
    running_sha: running,
    installed_is_promoted: installedIsPromoted,
    running_is_installed: runningIsInstalled,
    // Converged means all three agree. A moved symlink is not convergence, and
    // UNKNOWN is never converged.
    converged: installedIsPromoted && runningIsInstalled === true,
    restart_required: restartRequired,
    restart_owner: owner,
    reason,
  };
}

/**
 * MAY VACILANDO RESTART THIS BY ITSELF?
 *
 * The rule is not "is it safe in principle" but "is it safe RIGHT NOW". A
 * Gateway restart is a routine, policy-covered action on an idle host and an
 * unacceptable one while four lanes are mid-run, and nothing about the code
 * being newer changes that.
 *
 * A newer revision alone is NOT a reason to notify anyone. The old process is
 * still correct until something needs the new behaviour; treating every
 * promotion as an obligation is how the Director learns to ignore the ones that
 * matter.
 */
export function convergencePlan({
  convergence = null,
  busyLanes = 0,
  policyCoveredRestart = true,
} = {}) {
  const c = convergence || {};
  if (c.restart_required === null) {
    return {
      action: "investigate",
      automatic: false,
      director_action_required: false,
      reason: c.reason || "convergence could not be established",
    };
  }
  if (c.restart_required !== true) {
    return {
      action: "none",
      automatic: false,
      director_action_required: false,
      reason: c.reason || "nothing to reconcile",
    };
  }
  if (Number(busyLanes) > 0) {
    return {
      action: "defer",
      automatic: false,
      director_action_required: false,
      reason: `${busyLanes} lane(s) are executing; a gateway restart would interrupt productive work`,
    };
  }
  if (!policyCoveredRestart) {
    return {
      action: "ask",
      automatic: false,
      director_action_required: true,
      reason: "a restart is required and no policy covers performing it automatically",
    };
  }
  return {
    action: "restart",
    automatic: true,
    director_action_required: false,
    owner: c.restart_owner,
    reason: "the host is idle and the restart is policy-covered",
  };
}

/** Restart classes a lane can be waiting on. */
export const RESTART_TYPE = Object.freeze({
  NONE: "none",
  GATEWAY: "gateway",
  PROVIDER: "provider",
  DEV_SERVER: "dev_server",
  WORKTREE: "worktree",
  UNKNOWN: "unknown",
});

/**
 * ONE LANE'S CONVERGENCE, JOINED FROM CANONICAL SOURCES.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──
 *
 * It does not write provider, worktree or dev-server facts into the lane
 * registry. Those have owners already, and copying them into lanes.json would
 * make the registry a second truth that drifts from the processes it describes
 * — the same shape as every other two-answers defect this system keeps paying
 * for. This is a PROJECTION: it takes what each owner says and composes.
 *
 * ── AND WHAT IT REFUSES TO GUESS ──
 *
 * Freshness is never inferred from process age. A provider started an hour ago
 * may be running current code and a provider started a minute ago may not; the
 * question is which revision it loaded, and if that is not measurable the
 * answer is UNKNOWN. An UNKNOWN that reads as "probably current" is exactly how
 * a lane ends up quietly stale.
 *
 * ── AND WHEN IT ASKS FOR THE DIRECTOR ──
 *
 * Rarely, on purpose. A newer revision existing is not an obligation: the
 * running process is still correct until something needs the new behaviour.
 * The Director is named only when a stale component actually blocks work or
 * threatens correctness. Everything else is either reconciled automatically
 * when idle, or simply reported.
 */
export function laneConvergence({
  lane = null,
  runtime = null,
  runState = null,
  providerState = null,
  providerRevision = undefined,
  devServerState = null,
  devServerRevision = undefined,
  browserSessionState = null,
  worktreeHeadSha = null,
  worktreeContainsPromoted = null,
} = {}) {
  const binding = lane?.binding || {};
  const executing = ["EXECUTING", "VALIDATING", "RECOVERING"].includes(String(runState || "").toUpperCase());

  const reasons = [];
  let restartType = RESTART_TYPE.NONE;
  let restartRequired = false;

  // The shared runtime is host-wide: every lane inherits it, so a Gateway that
  // is behind its install makes every lane's shared behaviour stale at once.
  if (runtime?.restart_required === true) {
    restartRequired = true;
    restartType = RESTART_TYPE.GATEWAY;
    reasons.push(runtime.reason);
  } else if (runtime?.restart_required === null) {
    restartType = RESTART_TYPE.UNKNOWN;
    reasons.push(runtime?.reason || "shared runtime convergence is not established");
  }

  // The worktree is the lane's own. It is REPORTED, never demanded: a lane
  // legitimately sits on its own branch, and being behind staging is normal
  // work in progress rather than a fault.
  if (worktreeContainsPromoted === false && restartType === RESTART_TYPE.NONE) {
    restartType = RESTART_TYPE.WORKTREE;
    reasons.push("the lane's checkout does not contain the promoted revision");
  }

  const providerCurrent = providerRevision === undefined
    ? null
    : (providerRevision === runtime?.running_sha);
  const devServerCurrent = devServerRevision === undefined
    ? null
    : (devServerRevision === runtime?.running_sha);

  // SAFE means safe right now. Idle is the whole condition: a restart that
  // interrupts productive work is not made acceptable by the code being newer.
  const safeToRestart = restartRequired ? !executing : null;

  // THE DIRECTOR IS NOT THE FALLBACK FOR "BUSY".
  //
  // This first read: stale shared runtime + cannot restart because the lane is
  // executing => the Director must act. Running it against the real host showed
  // why that is wrong. Two lanes were mid-run on the previous toolkit, working
  // perfectly, and the model demanded a person for both — while the host-level
  // plan said, correctly, "defer: a restart would interrupt productive work".
  // The rule fired precisely when the staleness was LEAST of a problem, which is
  // the shape of an alarm the Director learns to scroll past.
  //
  // A lane running old-but-valid code is not an obligation. Staleness becomes
  // one only when it actually blocks work or threatens correctness, and this
  // projection cannot observe that — so it does not claim it. The single
  // host-level decision belongs to convergencePlan, which asks only when a
  // required restart is not policy-covered.
  const directorActionRequired = false;

  return {
    lane_id: lane?.lane_id ?? null,
    lane_name: lane?.name ?? null,
    worktree: binding.worktree_path ?? null,
    worktree_name: binding.worktree_name ?? null,
    branch: binding.branch ?? null,
    worktree_revision: worktreeHeadSha,
    worktree_contains_promoted: worktreeContainsPromoted,
    run_state: runState ?? null,
    executing,
    provider_session: binding.tmux_session ?? null,
    provider_state: providerState,
    provider_revision: providerRevision === undefined ? null : providerRevision,
    provider_current: providerCurrent,
    dev_server_state: devServerState,
    dev_server_revision: devServerRevision === undefined ? null : devServerRevision,
    dev_server_current: devServerCurrent,
    browser_session_state: browserSessionState,
    shared_runtime: {
      promoted: runtime?.promoted_sha ?? null,
      installed: runtime?.installed_sha ?? null,
      running: runtime?.running_sha ?? null,
      converged: runtime?.converged ?? null,
    },
    restart_required: restartRequired,
    restart_type: restartType,
    restart_owner: restartRequired && restartType === RESTART_TYPE.GATEWAY ? "gateway supervisor" : null,
    safe_to_restart: safeToRestart,
    director_action_required: directorActionRequired,
    reason: reasons.length ? reasons.join("; ") : "nothing is known to be stale for this lane",
  };
}
