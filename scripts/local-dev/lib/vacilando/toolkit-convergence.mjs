/**
 * TOOLKIT CONVERGENCE — the gap that stalled a lane indefinitely.
 *
 * The failure this fixes, exactly as it happened: staging was promoted with a
 * control-plane capability in it, the installed toolkit stayed on the previous
 * commit, and the lane that needed the capability reported "operator-run
 * install required" and stopped. Nothing was broken. Nothing retried. There was
 * simply no path from "promoted" to "installed" that did not go through a
 * human, and no signal anywhere that the two had diverged.
 *
 * Two mechanisms were missing, not one, which is why this could not be fixed by
 * enabling a policy:
 *
 *   1. NO DRIFT SIGNAL. Nothing compared the installed toolkit sha to promoted
 *      staging. control-plane-health.json carries no toolkit field at all, so
 *      the Gateway could not report that it was running old code even in
 *      principle. Step 2 of the convergence contract — "toolkit drift detected"
 *      — had no implementation.
 *
 *   2. NO ACTION TO REQUEST. The trusted-host registry had thirteen action
 *      keys and none of them installed a toolkit. So a lane could not propose
 *      the install even to be refused: evaluateDirectorAuthority would answer
 *      "no delegated policy covers this action", which reads like a policy
 *      decision and is really an absence.
 *
 * WHY THIS IS TIER A RATHER THAN AN APPROVAL. Installing the commit that is
 * already promoted staging adds no content decision — that decision was taken
 * at merge, by the certified merge gates. What remains is a mechanical question
 * with entirely measurable answers: is this really promoted staging, is the
 * artifact what it claims to be, can we go back, and is the thing healthy
 * afterwards. A human clicking yes to that supplies a measurement, not a
 * judgement, which is the exact pattern the attention model exists to remove.
 *
 * The install itself is NOT reimplemented here. It invokes canonical
 * `alloy-toolkit install`, which already holds the gateway_host_mutation guard,
 * the versioned layout and rollback. A second implementation of the same
 * operation is how the narrow governed route becomes the permissive one.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where the canonical layout lives. Mirrors alloy-toolkit's own defaults. */
export const TOOLKIT_ROOT = process.env.ALLOY_TOOLKIT_ROOT
  || join(homedir(), ".local", "share", "alloy", "toolkit");
export const CANONICAL_REPO = process.env.ALLOY_REPO || join(homedir(), "Alloy");

/** The only ref this action may install from. Not caller-supplied. */
export const CONVERGENCE_REF = "origin/staging";

/**
 * A restart budget, so "reconcile the Gateway" cannot become an unbounded
 * restart loop dressed as convergence.
 */
export const MAX_RESTARTS_PER_CONVERGENCE = 1;

const short = (sha) => String(sha || "").slice(0, 12);

function run(cmd, args, { cwd = undefined } = {}) {
  try {
    return { ok: true, out: String(execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).trim() };
  } catch (e) {
    return { ok: false, out: "", err: String(e?.stderr || e?.message || "").split("\n")[0].slice(0, 200) };
  }
}

/**
 * The running control-plane process, read from the process table.
 *
 * Matches the server rather than the host wrapper: the wrapper is routinely
 * launched through `current` and so carries no sha, while the server names the
 * toolkit it was started from.
 */
function defaultGatewayPs() {
  try {
    const out = String(execFileSync("ps", ["-Ao", "pid,command"], { encoding: "utf8" }));
    const rows = out.split("\n").filter((l) => /vacilando-server\.mjs/.test(l) && !/\bgrep\b/.test(l));
    const row = rows.find((l) => /\/toolkit\/[0-9a-f]{12}\//.test(l)) || rows[0];
    return row ? row.trim() : null;
  } catch {
    return null;
  }
}

/** The sha the `current` symlink resolves to, or null when unreadable. */
export function installedToolkitSha({ toolkitRoot = TOOLKIT_ROOT, readLink = null } = {}) {
  try {
    const link = readLink ? readLink(join(toolkitRoot, "current")) : null;
    if (link) return short(link.split("/").pop());
    const manifest = readFileSync(join(toolkitRoot, "current", "INSTALL-MANIFEST"), "utf8");
    const m = manifest.match(/^source_commit=([0-9a-f]{40})$/m);
    return m ? short(m[1]) : null;
  } catch {
    return null;
  }
}

/** What the manifest claims about where the installed tree came from. */
export function installedManifest({ toolkitRoot = TOOLKIT_ROOT } = {}) {
  try {
    const text = readFileSync(join(toolkitRoot, "current", "INSTALL-MANIFEST"), "utf8");
    const out = {};
    for (const line of text.split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Measure convergence.
 *
 * Every field is an observation or null. Null means NOT MEASURED and, as
 * everywhere else in this model, an unmeasured gate escalates rather than
 * passes — an install that cannot prove where it is going is precisely the one
 * that must not run unattended.
 */
export function measureToolkitConvergence({
  toolkitRoot = TOOLKIT_ROOT,
  canonicalRepo = CANONICAL_REPO,
  ref = CONVERGENCE_REF,
  exec = run,
  exists = existsSync,
  readLink = null,
  restartsThisConvergence = 0,
} = {}) {
  const ev = {
    convergence_ref: ref,
    installed_toolkit_sha: installedToolkitSha({ toolkitRoot, readLink }),
    promoted_staging_sha: null,
    toolkit_drift: null,
    source_is_promoted_staging: null,
    artifact_provenance_valid: null,
    previous_toolkit_retained: null,
    gateway_restart_bounded: restartsThisConvergence <= MAX_RESTARTS_PER_CONVERGENCE,
    current_toolkit_readable: null,
  };

  // Provenance first: a ref that does not resolve in the canonical repo means
  // the rest of the measurement is about a commit nobody can produce.
  if (!exists(join(canonicalRepo, ".git"))) {
    ev.artifact_provenance_valid = false;
    ev.detail = `canonical repository not found at ${canonicalRepo}`;
    return ev;
  }
  const resolved = exec("git", ["-C", canonicalRepo, "rev-parse", "--verify", `${ref}^{commit}`]);
  if (!resolved.ok || !/^[0-9a-f]{40}$/.test(resolved.out)) {
    ev.artifact_provenance_valid = false;
    ev.detail = `cannot resolve ${ref} in ${canonicalRepo}`;
    return ev;
  }
  ev.promoted_staging_sha = short(resolved.out);
  ev.promoted_staging_sha_full = resolved.out;

  // The subdirectory the toolkit is built from must exist AT that commit, not
  // merely in the working tree — the working tree is not what gets installed.
  const subdir = exec("git", ["-C", canonicalRepo, "cat-file", "-t", `${resolved.out}:scripts/local-dev`]);
  ev.artifact_provenance_valid = subdir.ok && subdir.out === "tree";
  if (!ev.artifact_provenance_valid) ev.detail = "scripts/local-dev is not a tree at the resolved commit";

  ev.current_toolkit_readable = ev.installed_toolkit_sha != null;
  ev.toolkit_drift = ev.installed_toolkit_sha == null
    ? null
    : ev.installed_toolkit_sha !== ev.promoted_staging_sha;

  // The install target IS promoted staging by construction — the ref is not a
  // caller input. Stating it as measured evidence anyway keeps the gate honest
  // if that ever becomes configurable.
  ev.source_is_promoted_staging = ref === CONVERGENCE_REF;

  // Rollback is only real if the tree we are leaving still exists on disk
  // afterwards. The versioned layout keeps every install, so this is a check
  // that the layout has not been pruned out from under us.
  ev.previous_toolkit_retained = ev.installed_toolkit_sha == null
    ? null
    : exists(join(toolkitRoot, ev.installed_toolkit_sha));

  return ev;
}

/**
 * What should happen, given the measurement.
 *
 * Deliberately three outcomes and not two. "Converged" and "install required"
 * are the ordinary ones; "blocked" exists so an unmeasurable state cannot be
 * silently filed as either — the failure mode being a convergence loop that
 * reports success because it could not see anything wrong.
 */
export function planToolkitConvergence(ev = {}) {
  if (ev.artifact_provenance_valid === false) {
    return { state: "blocked", reason: ev.detail || "install artifact provenance could not be established", install: false };
  }
  if (ev.installed_toolkit_sha == null || ev.promoted_staging_sha == null) {
    return { state: "blocked", reason: "installed or promoted sha could not be read", install: false };
  }
  if (ev.toolkit_drift === false) {
    return { state: "converged", reason: `toolkit already at promoted staging ${ev.promoted_staging_sha}`, install: false };
  }
  if (ev.previous_toolkit_retained === false) {
    return { state: "blocked", reason: "the current toolkit tree is missing, so the install would have no rollback target", install: false };
  }
  if (ev.gateway_restart_bounded === false) {
    return { state: "blocked", reason: "gateway restart budget exhausted for this convergence", install: false };
  }
  return {
    state: "install_required",
    reason: `installed ${ev.installed_toolkit_sha} is behind promoted staging ${ev.promoted_staging_sha}`,
    install: true,
    from: ev.installed_toolkit_sha,
    to: ev.promoted_staging_sha,
  };
}

/**
 * What the Gateway is ACTUALLY executing, read from the process rather than
 * inferred from the symlink.
 *
 * This distinction is not pedantry, and the live host proves why. Two processes
 * carry two different truths:
 *
 *   pid A  .../toolkit/current/lib/vacilando-gateway-host.mjs   (unpinned)
 *   pid B  .../toolkit/<sha>/lib/vacilando-server.mjs           (pinned to a sha)
 *
 * Flipping `current` moves NEITHER. The unpinned one already has the old module
 * graph in memory; the pinned one names the old commit outright. So an install
 * that only flips the symlink leaves a Gateway running code that is no longer
 * what `current` says — and every symlink-based check would report success.
 *
 * "Installed" and "running" are therefore separate facts, which is the same
 * distinction the turn summary refuses to let anyone blur.
 */
export function observeGatewayExecution({
  ownerPath = null,
  readOwner = null,
  psRunner = null,
  toolkitRoot = TOOLKIT_ROOT,
} = {}) {
  const out = {
    gateway_pid: null,
    gateway_argv: null,
    executing_path: null,
    executing_sha: null,
    path_is_pinned: null,
    resolves_through_current: null,
  };

  let owner = null;
  try {
    owner = readOwner ? readOwner() : JSON.parse(readFileSync(ownerPath, "utf8"));
  } catch { owner = null; }

  if (owner && Array.isArray(owner.argv) && owner.argv.length > 1) {
    out.gateway_pid = owner.pid ?? null;
    out.gateway_argv = owner.argv;
    out.executing_path = owner.argv[1];
  } else {
    // THE OWNER FILE IS NOT A DEPENDABLE SOURCE OF TRUTH. It vanished across a
    // Gateway restart on this host, and the observation degraded to UNVERIFIED
    // while `ps` could see the answer the whole time. Failing closed was right;
    // depending on a file that can disappear was not. The process table is the
    // thing that cannot lie about what is executing, so it is the fallback
    // rather than an injected extra.
    const line = (psRunner || defaultGatewayPs)();
    if (line) {
      const m = String(line).trim().match(/^(\d+)\s+(.*)$/);
      if (m) {
        out.gateway_pid = Number(m[1]);
        out.gateway_argv = m[2].split(/\s+/);
        out.executing_path = out.gateway_argv[1] || null;
      }
    }
  }

  if (out.executing_path) {
    const p = String(out.executing_path);
    out.resolves_through_current = p.includes(`${toolkitRoot}/current/`) || p.includes("/toolkit/current/");
    const m = p.match(/\/toolkit\/([0-9a-f]{12})\//);
    out.executing_sha = m ? m[1] : null;
    // A path that names a sha is pinned. One that goes through `current` is not:
    // it says where to look, never what is loaded.
    out.path_is_pinned = out.executing_sha != null;
  }
  return out;
}

/**
 * The whole convergence picture in one object.
 *
 * A future old-toolkit condition has to be answerable without terminal
 * archaeology, so every fact the question needs lives here: what staging is,
 * what is installed, what is RUNNING, whether those agree, and what we would
 * roll back to.
 */
export function convergenceStatus(opts = {}) {
  const ev = measureToolkitConvergence(opts);
  const plan = planToolkitConvergence(ev);
  const gw = observeGatewayExecution(opts);

  // Installed-vs-running is its own question. Null when the executing path is
  // unpinned: not converged, not drifted — UNKNOWN, which must never read as ok.
  const gatewayMatchesInstalled = gw.executing_sha == null
    ? null
    : gw.executing_sha === ev.installed_toolkit_sha;

  return {
    schema_version: "vacilando.toolkit_convergence_status.v1",
    staging_sha: ev.promoted_staging_sha,
    installed_sha: ev.installed_toolkit_sha,
    gateway_executing_sha: gw.executing_sha,
    gateway_executing_path: gw.executing_path,
    gateway_path_is_pinned: gw.path_is_pinned,
    gateway_matches_installed: gatewayMatchesInstalled,
    converged: ev.toolkit_drift === false && gatewayMatchesInstalled === true,
    drifted: ev.toolkit_drift === true,
    rollback_target: ev.previous_toolkit_retained ? ev.installed_toolkit_sha : null,
    state: plan.state,
    reason: plan.reason,
    // The one-line form the operating model should be able to say.
    headline: ev.toolkit_drift === true
      ? `TOOLKIT DRIFT — staging ${ev.promoted_staging_sha}, installed ${ev.installed_toolkit_sha}`
      : gatewayMatchesInstalled === false
        ? `GATEWAY BEHIND INSTALL — installed ${ev.installed_toolkit_sha}, running ${gw.executing_sha}`
        : gatewayMatchesInstalled == null
          ? `TOOLKIT UNVERIFIED — gateway path is unpinned (${gw.executing_path || "unknown"})`
          : `CONVERGED — ${ev.installed_toolkit_sha}`,
  };
}

/**
 * Did the convergence actually work?
 *
 * Separate from planning on purpose. An install that reports exit 0 has proven
 * that a command ran, not that the host converged — and the failure mode being
 * guarded is the one where a half-completed install is recorded as success and
 * the next drift check is therefore never made.
 *
 * Everything is required to be POSITIVELY true. Unknown health is not healthy,
 * an unpinned Gateway path is not a matching one, and either leaves the outcome
 * unverified rather than converged. `rollback_recommended` is set when we can
 * see the host is worse off than before, which is the only case where going
 * back is better than stopping.
 */
export function verifyConvergenceOutcome({
  expectedSha = null,
  status = null,
  loopbackHealth = null,
  directorHealth = null,
} = {}) {
  const reasons = [];
  const want = short(expectedSha);
  if (!want) reasons.push("no expected sha to verify against");
  if (!status) reasons.push("convergence status unreadable");

  if (status) {
    if (status.installed_sha !== want) {
      reasons.push(`installed ${status.installed_sha || "unknown"} is not the expected ${want}`);
    }
    if (status.gateway_matches_installed !== true) {
      reasons.push(status.gateway_path_is_pinned === false || status.gateway_executing_sha == null
        ? "gateway path is unpinned, so what it is running cannot be proven"
        : `gateway is running ${status.gateway_executing_sha}, not the installed ${status.installed_sha}`);
    }
  }
  if (loopbackHealth !== 200) reasons.push(`loopback health ${loopbackHealth ?? "unmeasured"}, expected 200`);
  if (directorHealth !== 200) reasons.push(`director health ${directorHealth ?? "unmeasured"}, expected 200`);

  const healthFailed = (loopbackHealth != null && loopbackHealth !== 200)
    || (directorHealth != null && directorHealth !== 200);

  return {
    verified: reasons.length === 0,
    reasons,
    // Rolling back on an UNMEASURED health check would replace a possibly-fine
    // toolkit on no evidence. Only an observed failure justifies it.
    rollback_recommended: healthFailed,
    outcome: reasons.length === 0 ? "converged" : (healthFailed ? "failed_health" : "unverified"),
  };
}

/**
 * Validate a governed install request.
 *
 * expected_staging_sha is compare-and-set, exactly as the provider ceiling is.
 * A lane that has lost track of what staging currently is must not be the one
 * that decides what gets installed onto every other lane's machine.
 */
export function validateInstallToolkitInputs(inputs = {}, { measure = measureToolkitConvergence } = {}) {
  const expected = String(inputs.expected_staging_sha ?? inputs.expectedStagingSha ?? "").trim();
  if (!/^[0-9a-f]{7,40}$/i.test(expected)) {
    return { ok: false, error: "invalid_expected_staging_sha", detail: "expected_staging_sha must be a git sha" };
  }
  const reason = String(inputs.reason ?? "").trim();
  if (reason.length < 8) {
    return { ok: false, error: "missing_reason", detail: "state why convergence is needed" };
  }
  // The ref is not an input, for the same reason the ceiling key is not one:
  // as a parameter this becomes "install any commit", which is a different and
  // much larger capability wearing a narrow name.
  if (inputs.ref && inputs.ref !== CONVERGENCE_REF) {
    return { ok: false, error: "unsupported_ref", detail: `this action installs ${CONVERGENCE_REF} only` };
  }

  const ev = measure();
  if (ev.promoted_staging_sha == null) {
    return { ok: false, error: "promoted_staging_unreadable", detail: ev.detail || "could not resolve promoted staging" };
  }
  if (short(expected) !== ev.promoted_staging_sha) {
    return {
      ok: false,
      error: "expected_staging_sha_mismatch",
      detail: `request names ${short(expected)}; promoted staging is ${ev.promoted_staging_sha}`,
      evidence: ev,
    };
  }
  const plan = planToolkitConvergence(ev);
  if (plan.state === "blocked") {
    return { ok: false, error: "convergence_blocked", detail: plan.reason, evidence: ev };
  }

  /*
   * `normalized` IS THE CONTRACT, not a convenience.
   *
   * requestTrustedHostAction reads `validated.normalized.dedupeKey` the moment
   * validation succeeds, and stores `validated.normalized` as the action's
   * inputs. The first version of this validator returned only
   * {ok, evidence, plan} — so `validated.normalized` was undefined, reading
   * .dedupeKey off it threw a TypeError, and the governed request failed with
   * `execution_threw` before any trusted-host action was ever created. That is
   * why the failure carried no action id to inspect.
   *
   * Same shape of defect as the ceiling NaN: two halves of one path disagreeing
   * about a field name while each looks correct read on its own.
   */
  const normalized = {
    expectedStagingSha: short(expected),
    ref: CONVERGENCE_REF,
    reason,
    dedupeKey: `toolkit_install:${CONVERGENCE_REF}:${short(expected)}`,
  };
  if (plan.state === "converged") {
    // Not an error. An install that is already done is a no-op the caller
    // should be told about plainly rather than allowed to perform again.
    return { ok: true, already_converged: true, normalized, evidence: ev, plan };
  }
  return { ok: true, already_converged: false, normalized, evidence: ev, plan };
}

/**
 * Execute the install by invoking the canonical command.
 *
 * This layer adds authority, not behaviour. `alloy-toolkit install` already
 * holds the gateway_host_mutation guard, the immutable versioned layout and
 * rollback, and a second implementation here would be a more permissive copy of
 * the operation the tests actually cover.
 *
 * IT DELIBERATELY DOES NOT RESTART THE GATEWAY. The Gateway is what executes
 * this action, and restarting it from inside itself would kill the process
 * mid-write — losing the completion record of the very install that just
 * happened, which is the one audit line nobody can reconstruct afterwards. The
 * symlink flip and the process restart are therefore separate bounded steps,
 * and this returns `gateway_restart_required` so the caller can see that
 * installed and running have not yet been reconciled. That is the same
 * installed-vs-running distinction the whole module exists to keep visible.
 */
export function executeToolkitInstall({
  expectedStagingSha = null,
  toolkitRoot = TOOLKIT_ROOT,
  runner = null,
  binPath = null,
} = {}) {
  const bin = binPath || join(toolkitRoot, "current", "alloy-toolkit");
  const before = installedToolkitSha({ toolkitRoot });

  let raw = "";
  try {
    raw = String((runner || ((c, a) => execFileSync(c, a, { encoding: "utf8", timeout: 300_000 })))(
      bin, ["install", CONVERGENCE_REF],
    ));
  } catch (e) {
    return {
      ok: false,
      error: "install_command_failed",
      detail: String(e?.stderr || e?.message || "").split("\n")[0].slice(0, 300),
      previous_sha: before,
    };
  }

  // Readback, because an exit code proves a command ran and nothing else.
  const after = installedToolkitSha({ toolkitRoot });
  const want = short(expectedStagingSha);
  if (want && after !== want) {
    return {
      ok: false, error: "install_readback_mismatch",
      detail: `installed ${after || "unknown"} after installing ${CONVERGENCE_REF}, expected ${want}`,
      previous_sha: before, installed_sha: after, output: raw.slice(0, 300),
    };
  }

  const gw = observeGatewayExecution({ toolkitRoot });
  return {
    ok: true,
    previous_sha: before,
    installed_sha: after,
    already_converged: before === after,
    readback_verified: Boolean(want) && after === want,
    rollback_target: before,
    gateway_executing_sha: gw.executing_sha,
    gateway_restart_required: gw.executing_sha !== after,
  };
}
