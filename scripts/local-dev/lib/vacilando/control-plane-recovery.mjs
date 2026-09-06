/**
 * Control-plane recovery — diagnose, bounded repair, verify, escalate.
 *
 * THE GOAL IS NOT AUTOMATIC RESTART. A restart loop is worse than an outage:
 * it looks like the system is trying, it destroys the evidence of why, and it
 * can mask a crash into what appears to be failing hardware. The finding this
 * phase answers, `director-forced-to-mac-mini`, records the other half of the
 * same problem — launchd restarts a dead PROCESS, and nothing supervises a
 * Gateway that is alive and not serving.
 *
 * COMPOSITION, NOT REIMPLEMENTATION. Every recovery ACTION already has an
 * owner:
 *
 *   process identity + owned restart  control-plane-health.mjs
 *   loopback health                   control-plane-health.probeVacilandoAccepting
 *   installed/running convergence     toolkit-convergence.mjs
 *   tailnet address + retry policy    vacilando-tailscale-bind.mjs
 *   attempts, cooldown, audit         host-steward-cycle.mjs
 *   durable problem memory            operational-findings.mjs
 *
 * This module observes through those owners, decides WHICH failure it is looking
 * at, and selects the smallest bounded action appropriate to that class. It
 * performs no repair it could delegate, and it never invents lane, run or
 * process truth.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CONTROL_PLANE_RECOVERY_SCHEMA = "vacilando.control_plane_recovery.v1";

/**
 * Failure classes.
 *
 * The point of keeping these separate is that they have DIFFERENT recoveries. A
 * dead process wants a restart; an alive-unhealthy one may want a restart but
 * only after proving it is not merely slow; drift wants convergence, not a
 * restart; a route failure means the Gateway is fine and the path to it is not,
 * so restarting the Gateway would destroy a healthy service to fix a network.
 */
export const FAILURE_CLASSES = Object.freeze([
  "HEALTHY",
  "PROCESS_DEAD",
  "PROCESS_ALIVE_UNHEALTHY",
  "TOOLKIT_DRIFT",
  "TAILSCALE_FAILURE",
  "SERVE_ROUTE_FAILURE",
  "SUPERVISOR_FAILURE",
  "HOST_UNREACHABLE",
  "UNKNOWN",
]);

/** Recovery levels. Higher means less autonomy and more Director involvement. */
export const RECOVERY_LEVELS = Object.freeze({
  L0_NORMAL: 0,
  L1_LOCAL_RECONCILIATION: 1,
  L2_BOUNDED_SERVICE_RECOVERY: 2,
  L3_TOOLKIT_CONVERGENCE: 3,
  L4_REMOTE_DIRECTOR: 4,
  L5_PHYSICAL_ACCESS: 5,
});

/**
 * Attempt ceilings, per class.
 *
 * Deliberately small. The purpose of a ceiling is not to keep trying until it
 * works; it is to bound how long the system may believe its own theory of the
 * failure before handing the problem to someone who can form a better one.
 */
export const ATTEMPT_CEILINGS = Object.freeze({
  PROCESS_DEAD: 3,
  PROCESS_ALIVE_UNHEALTHY: 2,
  TOOLKIT_DRIFT: 2,
  SERVE_ROUTE_FAILURE: 2,
  SUPERVISOR_FAILURE: 2,
  TAILSCALE_FAILURE: 0,          // credentials/judgment; never autonomous
  HOST_UNREACHABLE: 0,           // nothing local can act
  UNKNOWN: 0,                    // fails closed by construction
});

/** How long an unhealthy-but-alive Gateway must stay unhealthy before it counts. */
export const UNHEALTHY_CONFIRM_MS = 60_000;
/** Minimum spacing between recovery attempts within one episode. */
export const ATTEMPT_COOLDOWN_MS = 2 * 60_000;

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim() || join(homedir(), ".local", "state", "alloy-dev");
}

export function recoveryEpisodePath(root = runtimeRoot()) {
  return join(root, "vacilando", "control-plane-recovery", "episode.json");
}

/**
 * EPISODE STATE MUST OUTLIVE THE PROCESS IT RESTARTS.
 *
 * This is the part that could not be composed. Every existing attempt counter
 * lives in the Gateway's own runtime, and the Gateway is the thing being
 * restarted — so a restart loop would reset its own memory of looping every
 * time round, which is precisely how a loop becomes infinite while each
 * individual iteration looks like a first attempt.
 *
 * The episode is written to disk BEFORE the action that may kill the writer.
 */
export function readEpisode(root = runtimeRoot()) {
  const p = recoveryEpisodePath(root);
  if (!existsSync(p)) return { ok: true, episode: null, absent: true };
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    if (!raw || typeof raw !== "object") return { ok: false, error: "episode_malformed", episode: null };
    return { ok: true, episode: raw };
  } catch (e) {
    // Absent and unreadable are different answers — the Capacity V2 lesson.
    return { ok: false, error: "episode_unreadable", detail: e?.message || String(e), episode: null };
  }
}

export function writeEpisode(episode, root = runtimeRoot()) {
  const p = recoveryEpisodePath(root);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(episode, null, 2)}\n`, "utf8");
  renameSync(tmp, p);
  return episode;
}

/**
 * Open or continue an episode for this failure class.
 *
 * An episode is keyed by CLASS, not by attempt: repeated symptoms of one
 * unhealthy control plane are one episode with several attempts, not several
 * episodes with one attempt each. A different class opens a new episode,
 * because it is a different theory of what is wrong.
 */
export function openOrContinueEpisode(failureClass, { root = runtimeRoot(), nowMs = Date.now() } = {}) {
  const read = readEpisode(root);
  if (!read.ok) return { ok: false, error: read.error };
  const prev = read.episode;
  if (prev && prev.failure_class === failureClass && !prev.resolved_at) {
    return { ok: true, episode: prev, continued: true };
  }
  const episode = {
    schema_version: CONTROL_PLANE_RECOVERY_SCHEMA,
    episode_id: `cpr_${Math.floor(nowMs / 1000).toString(36)}`,
    failure_class: failureClass,
    first_observed_at: new Date(nowMs).toISOString(),
    attempts: [],
    level: levelForClass(failureClass, 0),
    escalated: false,
    resolved_at: null,
    last_known_good: prev?.last_known_good ?? null,
  };
  return { ok: true, episode, continued: false };
}

/** Attempts already made in this episode for a given action. */
export function attemptsUsed(episode, action = null) {
  if (!episode) return 0;
  return (episode.attempts || []).filter((a) => !action || a.action === action).length;
}

/**
 * Level for a class given how many attempts it has already consumed.
 *
 * Escalation is a function of exhausted authority, not of elapsed frustration.
 * Once a class has spent its ceiling, the next level up is L4 — the Director —
 * because the system has demonstrated that its own theory did not work.
 */
export function levelForClass(failureClass, used = 0) {
  const L = RECOVERY_LEVELS;
  if (failureClass === "HEALTHY") return L.L0_NORMAL;
  const ceiling = ATTEMPT_CEILINGS[failureClass] ?? 0;
  if (ceiling === 0) {
    // No autonomous authority for this class at all.
    return failureClass === "HOST_UNREACHABLE" ? L.L5_PHYSICAL_ACCESS : L.L4_REMOTE_DIRECTOR;
  }
  if (used >= ceiling) return L.L4_REMOTE_DIRECTOR;
  switch (failureClass) {
    case "PROCESS_DEAD":
    case "PROCESS_ALIVE_UNHEALTHY":
    case "SUPERVISOR_FAILURE":
      return L.L2_BOUNDED_SERVICE_RECOVERY;
    case "TOOLKIT_DRIFT":
      return L.L3_TOOLKIT_CONVERGENCE;
    case "SERVE_ROUTE_FAILURE":
      return L.L1_LOCAL_RECONCILIATION;
    default:
      return L.L4_REMOTE_DIRECTOR;
  }
}

/**
 * Gather the canonical observation.
 *
 * COMPOSED FROM EXISTING OWNERS, and deliberately NOT reduced to a boolean.
 * Each signal is measured separately and may be null, because "unmeasured" is
 * the distinction the classifier needs in order to fail closed. A single
 * `healthy: false` would erase exactly the evidence that separates a dead
 * process from a slow one from a broken route.
 *
 * Every probe is individually guarded: one unavailable signal must degrade the
 * observation, never abort it, because a partial observation still supports a
 * correct UNKNOWN.
 */
export async function observeControlPlane({
  root = runtimeRoot(),
  nowMs = Date.now(),
  execFile = null,
  probeLoopback = null,
} = {}) {
  const { execFileSync } = await import("node:child_process");
  const run = execFile || ((cmd, args) => execFileSync(cmd, args, { encoding: "utf8", timeout: 10_000 }));
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback === undefined ? undefined : fallback; } };

  const psOut = safe(() => run("ps", ["-eo", "pid,command"]), null);
  const processExists = psOut == null ? null : /vacilando-server\.mjs/.test(psOut);
  const runningSha = psOut == null ? null
    : (psOut.match(/toolkit\/([0-9a-f]{12})\/lib\/vacilando-server\.mjs/) || [])[1] ?? null;

  const launchdOut = safe(() => run("launchctl", ["print", `gui/${process.getuid()}/com.alloy.vacilando-gateway`]), null);
  const launchdLoaded = launchdOut == null ? null : /state = /.test(launchdOut);

  let installedSha = null;
  try {
    const { readlinkSync } = await import("node:fs");
    installedSha = readlinkSync(join(homedir(), ".local", "share", "alloy", "toolkit", "current")).split("/").pop();
  } catch { installedSha = null; }

  const toolkitDrift = (installedSha && runningSha) ? installedSha !== runningSha : null;

  let loopbackHealthy = null;
  if (probeLoopback) {
    loopbackHealthy = await safeAsync(() => probeLoopback());
  } else {
    /*
     * A SERVICE THAT DID NOT ANSWER IS A MEASUREMENT, NOT A BLIND SPOT.
     *
     * Found during live certification. curl exits non-zero when the connection
     * fails, so wrapping it in the generic guard turned "the Gateway did not
     * respond" into "loopback was not measured" — and the classifier, correctly,
     * refused to diagnose. A SIGSTOPped Gateway therefore read as UNKNOWN rather
     * than PROCESS_ALIVE_UNHEALTHY, which is exactly the conflation this model
     * exists to prevent, reproduced in its own observer.
     *
     * `--write-out` still prints a code on connection failure (000), so the
     * distinction is available: a printed code is an answer, and only curl
     * itself being unusable is genuinely unmeasured.
     */
    const token = safe(() => readFileSync(join(root, "vacilando", "api-token"), "utf8").trim(), "");
    const probe = safe(() => run("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "8",
      "--retry", "0", "-H", `Authorization: Bearer ${token}`,
      "http://127.0.0.1:3030/api/control-plane/health"]), undefined);
    if (probe === undefined) {
      // curl could not be executed at all: genuinely unmeasured.
      loopbackHealthy = null;
    } else {
      loopbackHealthy = String(probe ?? "").trim() === "200";
    }
  }

  const tsOut = safe(() => run("tailscale", ["status", "--json"]), null);
  const tailscaleUp = tsOut == null ? null : /"BackendState"\s*:\s*"Running"/.test(tsOut);

  return {
    schema_version: CONTROL_PLANE_RECOVERY_SCHEMA,
    now_ms: nowMs,
    host_reachable: true,                 // this code is running ON the host
    launchd_job_loaded: launchdLoaded,
    process_exists: processExists,
    running_sha: runningSha,
    installed_sha: installedSha,
    toolkit_drift: toolkitDrift,
    loopback_healthy: loopbackHealthy,
    director_route_healthy: null,         // measured by the caller that owns the route
    tailscale_up: tailscaleUp,
    supervisor_healthy: null,             // owned by host-steward-cycle.stewardStatus
  };
}

async function safeAsync(fn) { try { return await fn(); } catch { return null; } }

/**
 * Classify a control-plane observation.
 *
 * ORDER MATTERS, and it is not the order of severity — it is the order of
 * certainty. Host reachability is decided first because nothing else can be
 * trusted without it; a missing process is decided before health because a dead
 * process cannot answer a probe and would otherwise look "unhealthy"; drift is
 * decided before route failure because a Gateway running the wrong toolkit may
 * serve loopback perfectly and still be wrong.
 *
 * DO NOT RESTART ON health=false ALONE. A slow bind, a probe that has not been
 * attempted, and a genuinely wedged process are three different things, and
 * only the third wants a restart.
 */
export function classifyControlPlane(obs = {}) {
  const ev = { ...obs };
  const unknown = (why) => ({ failure_class: "UNKNOWN", why, evidence: ev });

  if (obs.host_reachable === false) {
    return { failure_class: "HOST_UNREACHABLE", why: "the host itself did not respond", evidence: ev };
  }
  // Incomplete evidence is not a diagnosis. Fail closed rather than guess.
  if (obs.launchd_job_loaded == null && obs.process_exists == null) {
    return unknown("neither the launchd job nor the process could be observed");
  }
  if (obs.process_exists === false) {
    return { failure_class: "PROCESS_DEAD", why: "no Gateway process is running", evidence: ev };
  }
  if (obs.process_exists == null) {
    return unknown("the process table could not be read, so absence cannot be distinguished from blindness");
  }
  // Alive from here on.
  if (obs.toolkit_drift === true) {
    return { failure_class: "TOOLKIT_DRIFT", why: "the running toolkit is not the installed one", evidence: ev };
  }
  if (obs.loopback_healthy === false) {
    if (!obs.unhealthy_since_ms || (obs.now_ms - obs.unhealthy_since_ms) < UNHEALTHY_CONFIRM_MS) {
      // A single failed probe is not a wedged process. Slow bind looks identical.
      return { failure_class: "UNKNOWN", why: "loopback failed once; not yet confirmed unhealthy", evidence: ev };
    }
    return { failure_class: "PROCESS_ALIVE_UNHEALTHY", why: "the process is alive and loopback health has stayed down", evidence: ev };
  }
  if (obs.loopback_healthy == null) {
    return unknown("loopback health was not measured");
  }
  // Loopback is healthy: the service works, so anything still failing is the path to it.
  if (obs.director_route_healthy === false) {
    if (obs.tailscale_up === false) {
      return { failure_class: "TAILSCALE_FAILURE", why: "the tailnet is down; the Gateway itself is healthy", evidence: ev };
    }
    return { failure_class: "SERVE_ROUTE_FAILURE", why: "loopback is healthy but the Director route is not", evidence: ev };
  }
  if (obs.supervisor_healthy === false) {
    return { failure_class: "SUPERVISOR_FAILURE", why: "the Steward has not completed a cycle within its window", evidence: ev };
  }
  if (obs.director_route_healthy == null && obs.loopback_healthy === true) {
    // Local health proven, remote unmeasured: healthy locally, and say so.
    return { failure_class: "HEALTHY", why: "loopback healthy; Director route unmeasured", evidence: ev, partial: true };
  }
  return { failure_class: "HEALTHY", why: "every measured signal is healthy", evidence: ev };
}

/**
 * The action a class authorises, and who owns performing it.
 *
 * Every entry names an existing owner. Nothing here performs the repair; this
 * says which bounded repair is appropriate and what must be true first.
 */
export const RECOVERY_POLICY = Object.freeze({
  PROCESS_DEAD: {
    action: "restart_owned_gateway",
    owner: "control-plane-health.recoverOwnedVacilandoProcess",
    requires: ["process_exists === false", "launchd job loaded or owner record present"],
    prohibited: ["no recorded owner pid (would become a generic kill)"],
    blast_radius: "the Gateway process only; never another pid",
    verify: ["process returns", "loopback healthy", "durable lane and run state intact"],
    max_attempts: ATTEMPT_CEILINGS.PROCESS_DEAD,
    level: RECOVERY_LEVELS.L2_BOUNDED_SERVICE_RECOVERY,
  },
  PROCESS_ALIVE_UNHEALTHY: {
    action: "restart_owned_gateway",
    owner: "control-plane-health.recoverOwnedVacilandoProcess",
    requires: [`unhealthy sustained >= ${UNHEALTHY_CONFIRM_MS}ms`, "owned pid proven"],
    prohibited: ["a single failed probe", "slow bind still within its window"],
    blast_radius: "the Gateway process only",
    verify: ["loopback healthy after restart"],
    max_attempts: ATTEMPT_CEILINGS.PROCESS_ALIVE_UNHEALTHY,
    level: RECOVERY_LEVELS.L2_BOUNDED_SERVICE_RECOVERY,
  },
  TOOLKIT_DRIFT: {
    action: "converge_toolkit_then_restart",
    owner: "toolkit-convergence + host.install_toolkit governed action",
    requires: ["installed sha known", "provenance valid", "previous toolkit retained"],
    prohibited: ["unknown convergence target", "oscillation between two versions"],
    blast_radius: "the toolkit symlink and the Gateway process",
    verify: ["running argv names the installed sha", "loopback healthy", "Director route healthy"],
    max_attempts: ATTEMPT_CEILINGS.TOOLKIT_DRIFT,
    level: RECOVERY_LEVELS.L3_TOOLKIT_CONVERGENCE,
  },
  SERVE_ROUTE_FAILURE: {
    action: "reconcile_serve_mapping",
    owner: "vacilando-tailscale-bind",
    requires: ["loopback healthy", "tailscale up"],
    prohibited: ["restarting the Gateway (it is healthy; the path is not)"],
    blast_radius: "the Serve mapping only",
    verify: ["Director route healthy"],
    max_attempts: ATTEMPT_CEILINGS.SERVE_ROUTE_FAILURE,
    level: RECOVERY_LEVELS.L1_LOCAL_RECONCILIATION,
  },
  SUPERVISOR_FAILURE: {
    action: "restart_steward",
    owner: "host-steward lifecycle",
    requires: ["steward stale beyond its window", "Gateway healthy"],
    prohibited: ["restarting the Gateway to fix the Steward"],
    blast_radius: "the Steward cycle only",
    verify: ["a cycle completes"],
    max_attempts: ATTEMPT_CEILINGS.SUPERVISOR_FAILURE,
    level: RECOVERY_LEVELS.L2_BOUNDED_SERVICE_RECOVERY,
  },
  TAILSCALE_FAILURE: {
    action: null,
    owner: "Director",
    requires: [],
    prohibited: ["any autonomous action — the tailnet may be the only recovery channel"],
    blast_radius: "none",
    verify: [],
    max_attempts: 0,
    level: RECOVERY_LEVELS.L4_REMOTE_DIRECTOR,
  },
  HOST_UNREACHABLE: {
    action: null,
    owner: "Director, physically",
    requires: [],
    prohibited: ["everything; nothing local is running to act"],
    blast_radius: "none",
    verify: [],
    max_attempts: 0,
    level: RECOVERY_LEVELS.L5_PHYSICAL_ACCESS,
  },
  UNKNOWN: {
    action: null,
    owner: "investigation",
    requires: [],
    prohibited: ["every repair; the diagnosis is not established"],
    blast_radius: "none",
    verify: [],
    max_attempts: 0,
    level: RECOVERY_LEVELS.L4_REMOTE_DIRECTOR,
  },
});

/**
 * Decide what to do, without doing it.
 *
 * Returns the action a caller is authorised to take, or a refusal with the
 * reason. Kept pure so the decision can be certified without restarting
 * anything, and so the caller that performs the action is visibly a different
 * thing from the logic that chose it.
 */
export function planRecovery(observation, { root = runtimeRoot(), nowMs = Date.now() } = {}) {
  const classified = classifyControlPlane({ ...observation, now_ms: observation?.now_ms ?? nowMs });
  const cls = classified.failure_class;
  if (cls === "HEALTHY") {
    return { ok: true, failure_class: cls, level: RECOVERY_LEVELS.L0_NORMAL, action: null, reason: classified.why, escalate: false };
  }
  const opened = openOrContinueEpisode(cls, { root, nowMs });
  if (!opened.ok) {
    return { ok: false, failure_class: cls, level: RECOVERY_LEVELS.L4_REMOTE_DIRECTOR, action: null,
      reason: `recovery memory is unreadable (${opened.error}); refusing to act without it`, escalate: true };
  }
  const episode = opened.episode;
  const policy = RECOVERY_POLICY[cls];
  const used = attemptsUsed(episode, policy?.action || null);
  const level = levelForClass(cls, used);

  if (!policy?.action) {
    return { ok: true, failure_class: cls, level, action: null, episode, attempts_used: used,
      reason: classified.why, escalate: true };
  }
  if (used >= policy.max_attempts) {
    return { ok: true, failure_class: cls, level: RECOVERY_LEVELS.L4_REMOTE_DIRECTOR, action: null, episode,
      attempts_used: used, attempts_allowed: policy.max_attempts,
      reason: `autonomous authority exhausted after ${used} attempt(s); the theory did not work`, escalate: true };
  }
  const last = (episode.attempts || [])[episode.attempts.length - 1];
  if (last && (nowMs - Date.parse(last.at)) < ATTEMPT_COOLDOWN_MS) {
    return { ok: true, failure_class: cls, level, action: null, episode, attempts_used: used,
      reason: "within attempt cooldown; a faster retry would be a loop", escalate: false, waiting: true };
  }
  return {
    ok: true, failure_class: cls, level, action: policy.action, owner: policy.owner,
    episode, attempts_used: used, attempts_allowed: policy.max_attempts,
    verify: policy.verify, blast_radius: policy.blast_radius, reason: classified.why, escalate: false,
  };
}

/**
 * Record an attempt BEFORE performing it.
 *
 * The action may kill the process holding this memory. Writing after would mean
 * a restart loop never records that it is looping.
 */
export function recordAttempt(episode, { action, nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const ep = { ...episode, attempts: [...(episode.attempts || []), { action, at: new Date(nowMs).toISOString(), verified: null }] };
  ep.level = levelForClass(ep.failure_class, ep.attempts.length);
  writeEpisode(ep, root);
  return ep;
}

/** Record what verification found after an attempt. */
export function recordVerification(episode, { ok, detail = null, nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const attempts = [...(episode.attempts || [])];
  if (attempts.length) attempts[attempts.length - 1] = { ...attempts[attempts.length - 1], verified: Boolean(ok), detail };
  const ep = { ...episode, attempts };
  if (ok) {
    ep.resolved_at = new Date(nowMs).toISOString();
    ep.last_known_good = new Date(nowMs).toISOString();
  }
  writeEpisode(ep, root);
  return ep;
}

/** The scoreboard: one place that answers whether anyone needs to do anything. */
export function controlPlaneScoreboard(observation, { root = runtimeRoot(), nowMs = Date.now() } = {}) {
  const plan = planRecovery(observation, { root, nowMs });
  const read = readEpisode(root);
  const ep = read.episode;
  return {
    schema_version: CONTROL_PLANE_RECOVERY_SCHEMA,
    healthy: plan.failure_class === "HEALTHY",
    failure_class: plan.failure_class,
    recovery_level: plan.level,
    episode_active: Boolean(ep && !ep.resolved_at),
    episode_id: ep?.episode_id ?? null,
    attempts_used: plan.attempts_used ?? 0,
    attempts_allowed: plan.attempts_allowed ?? (RECOVERY_POLICY[plan.failure_class]?.max_attempts ?? 0),
    last_local_health_ok: observation?.loopback_healthy === true,
    last_director_route_ok: observation?.director_route_healthy === true,
    expected_toolkit: observation?.installed_sha ?? null,
    running_toolkit: observation?.running_sha ?? null,
    last_autonomous_repair: (ep?.attempts || []).slice(-1)[0] ?? null,
    director_action_required: Boolean(plan.escalate),
    director_action: plan.escalate ? directorAction(plan) : null,
  };
}

function directorAction(plan) {
  const cls = plan.failure_class;
  if (cls === "HOST_UNREACHABLE") {
    return { class: "STUCK", physical: true, what: "The host is not responding on any channel. Power/network at the machine." };
  }
  if (cls === "TAILSCALE_FAILURE") {
    return { class: "STUCK", physical: false, what: "The tailnet is down while the Gateway is healthy. Restore Tailscale; this is deliberately not autonomous because the tailnet may be the only recovery channel." };
  }
  if (cls === "UNKNOWN") {
    return { class: "ATTENTION", physical: false, what: `Diagnosis not established: ${plan.reason}. Evidence preserved; no repair attempted.` };
  }
  return { class: "ATTENTION", physical: false, what: `${cls}: ${plan.reason}` };
}
