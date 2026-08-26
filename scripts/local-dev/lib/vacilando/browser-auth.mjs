/**
 * Operator-facing browser-authentication recovery.
 *
 * THE GAP. A lane's Playwright storage state goes stale, the app answers
 * `refresh_token_not_found`, `/workspace` bounces to `/login`, and Vacilando
 * had nothing to say about it: no lane status, no action, no way back. The only
 * route left was the Director opening a terminal, finding a slot, running
 * `alloy-agent-login`, and hoping there was a browser PID — which is the
 * operator-does-setup pattern Vacilando exists to remove.
 *
 * WHAT THIS OWNS, AND WHAT IT DOES NOT. The capture itself already exists and
 * is already safe: `alloy-agent-login <slot>` opens an isolated browser on the
 * slot's own loopback base, refuses a duplicate browser, writes storage to a
 * slot-scoped path with mode 600, and never prints a cookie or a credential.
 * This module does not reimplement any of that. It supplies the part that was
 * missing — knowing the auth is broken, saying so where the Director is
 * looking, driving the capture, verifying the result, and reporting a durable
 * outcome that carries no secret material.
 *
 * THE ONE STEP THAT IS NOT AUTOMATABLE, BY DESIGN. A person types the password.
 * Nothing here can, or should, do that: the agent must not be able to complete
 * an interactive sign-in, so the flow parks in `awaiting_operator_sign_in` and
 * waits. That is the boundary, not a limitation to engineer around.
 *
 * SECRETS. This module never reads cookie values, never logs them, never puts
 * them in a result, and never copies storage into a worktree. It reads only
 * metadata — names, counts, expiry timestamps, file mode — which is what a
 * status display actually needs.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Every state the flow can be in. Displayed verbatim; never inferred twice. */
export const BROWSER_AUTH_STATES = Object.freeze({
  VALID: "authentication_valid",
  MISSING: "authentication_missing",
  EXPIRED: "authentication_expired",
  AWAITING_OPERATOR: "awaiting_operator_sign_in",
  VERIFYING: "verifying",
  RESTORED: "restored",
  CANCELLED: "cancelled",
  TIMED_OUT: "timed_out",
  WRONG_IDENTITY: "wrong_identity",
  VERIFICATION_FAILED: "verification_failed",
});

export const BROWSER_AUTH_REFUSALS = Object.freeze({
  NON_LOOPBACK: "non_loopback_base_refused",
  UNREGISTERED_LANE: "lane_not_registered",
  WORKTREE_MISMATCH: "worktree_not_registered_for_lane",
  SLOT_MISMATCH: "slot_not_bound_to_worktree",
  PORT_MISMATCH: "port_not_expected_for_slot",
  NO_IDENTITY: "expected_identity_missing",
  CAPTURE_IN_FLIGHT: "capture_already_active_for_slot",
  AGENT_CANNOT_SIGN_IN: "interactive_sign_in_requires_operator",
});

/** Permanent slot → port. A slot never borrows another slot's port. */
export const SLOT_PORTS = Object.freeze({ 1: 3011, 2: 3012, 3: 3013, 4: 3014, 5: 3015, 6: 3016 });

export const DEFAULT_CAPTURE_TIMEOUT_MS = 10 * 60 * 1000;

// The toolkit resolves slot auth as `$ALLOY_RUNTIME_ROOT/auth/slot<N>` and does
// not special-case the gateway root. `alloy-agent-verify` therefore reads
// whatever root it is invoked with, and that read is the one that decides
// whether verification can happen at all.
//
// This used to strip a trailing `/gateway`, on the assumption that auth storage
// is machine-scoped. That made the lane report a session the verifier would
// never consult: slot 5 showed `authentication_valid` from a capture under the
// base root while `alloy-agent-verify`, running gateway-rooted, said `missing`.
// A status that disagrees with the verifier is worse than no status, so this
// now resolves exactly as the toolkit does.
function stateRoot() {
  const configured = process.env.ALLOY_RUNTIME_ROOT?.trim();
  return configured || join(homedir(), ".local", "state", "alloy-dev");
}

// Where a capture taken under the base root would sit. Consulted only to
// explain a missing session — never treated as usable, because the verifier
// cannot see it.
function legacyStateRoot() {
  const configured = process.env.ALLOY_RUNTIME_ROOT?.trim();
  if (!configured) return null;
  const stripped = configured.replace(/\/gateway$/, "");
  return stripped === configured ? null : stripped;
}

export function legacySlotAuthStoragePath(slot) {
  const root = legacyStateRoot();
  return root ? join(root, "auth", `slot${slot}`, "storage-state.json") : null;
}

/**
 * The QA identity a slot signs in as.
 *
 * Asked of the TOOLKIT, which owns it: it resolves operator config and shipped
 * defaults in the right order, and parsing those files here would be a second
 * definition that could disagree with the first. Never invented, and never
 * silently substituted with another account — a null identity is displayed as
 * unknown rather than guessed.
 */
export function qaIdentityForSlot(slot) {
  const n = Number(slot);
  if (!Number.isInteger(n)) return null;
  const fromEnv = process.env[`ALLOY_SLOT_${n}_QA_IDENTITY`];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    const toolkit = join(homedir(), ".local", "share", "alloy", "toolkit", "current");
    const out = execFileSync("bash", ["-lc",
      `source "${toolkit}/lib/common.sh"; source "${toolkit}/lib/verify.sh"; ` +
      `alloy_load_config >/dev/null 2>&1; alloy_slot_qa_identity ${n}`,
    ], { encoding: "utf8", timeout: 15000 });
    const v = String(out || "").trim();
    return v || null;
  } catch {
    return null;
  }
}

export function slotAuthStoragePath(slot, { root = stateRoot() } = {}) {
  return join(root, "auth", `slot${slot}`, "storage-state.json");
}

/**
 * The last VERIFICATION verdict for a slot.
 *
 * Presence of a storage file is not proof it works — slot 5's cookies claimed
 * 2027 while the server rejected every request. Without recording what a live
 * check found, the lane card reads "present" forever and the Director is never
 * offered the recovery they need. Metadata only: a state, a time, an expected
 * identity. Never a token.
 */
export function slotVerificationPath(slot, { root = stateRoot() } = {}) {
  return join(root, "auth", `slot${slot}`, "verification.json");
}

export function readSlotVerification(slot, { root = stateRoot() } = {}) {
  try {
    const raw = JSON.parse(readFileSync(slotVerificationPath(slot, { root }), "utf8"));
    return raw && typeof raw === "object" ? raw : null;
  } catch { return null; }
}

export function recordSlotVerification(slot, { state, expectedIdentity = null, actualIdentity = null, detail = null, root = stateRoot(), nowMs = Date.now() } = {}) {
  const path = slotVerificationPath(slot, { root });
  try {
    mkdirSync(join(root, "auth", `slot${slot}`), { recursive: true });
    writeFileSync(path, `${JSON.stringify({
      schema_version: "vacilando.browser_auth_verification.v1",
      slot: Number(slot),
      state,
      expected_identity: expectedIdentity,
      actual_identity: actualIdentity,
      detail: detail ? redactAuthText(detail) : null,
      at: new Date(nowMs).toISOString(),
      secrets_recorded: false,
    }, null, 2)}\n`, "utf8");
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

export function slotBrowserProfileDir(slot, { root = stateRoot() } = {}) {
  return join(root, "browser-profiles", `slot${slot}`);
}

/**
 * Is this base one we will ever drive a browser at?
 *
 * Loopback only. A certification sign-in that can be pointed at an arbitrary
 * host is a phishing surface with a Vacilando button on it, so the refusal is on
 * the hostname and admits nothing else.
 */
export function isLoopbackBase(baseUrl) {
  let u;
  try { u = new URL(String(baseUrl || "")); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]" || u.hostname === "::1";
}

/**
 * What the stored state says about itself.
 *
 * METADATA ONLY. Names, counts and expiry — never a value. Cookie expiry alone
 * cannot prove a session is usable: slot 5's cookies claimed 2027 while the
 * server was already answering `refresh_token_not_found`. So "valid" here means
 * "present and not self-expired", and only a live check can promote it to
 * restored.
 */
export function readSlotAuthStatus(slot, { root = stateRoot(), nowMs = Date.now() } = {}) {
  const path = slotAuthStoragePath(slot, { root });
  if (!existsSync(path)) {
    // A capture under the base root is a real session, but not one the verifier
    // can reach. Name it, so the operator is told to sign in rather than left
    // wondering why a file they can see is called missing.
    const legacy = legacySlotAuthStoragePath(slot);
    const strandedAt = legacy && existsSync(legacy) ? legacy : null;
    return {
      state: BROWSER_AUTH_STATES.MISSING,
      slot,
      storage_path: path,
      exists: false,
      ...(strandedAt
        ? {
            stranded_storage_path: strandedAt,
            detail: "a session exists under the base runtime root, which alloy-agent-verify does not read; sign in again to capture it where the verifier looks",
          }
        : {}),
    };
  }
  let stat = null;
  let parsed = null;
  try {
    stat = statSync(path);
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { state: BROWSER_AUTH_STATES.EXPIRED, slot, storage_path: path, exists: true, detail: "storage state unreadable" };
  }
  const cookies = Array.isArray(parsed?.cookies) ? parsed.cookies : [];
  const expiries = cookies
    .map((c) => (typeof c?.expires === "number" && c.expires > 0 ? c.expires * 1000 : null))
    .filter((n) => n != null);
  const earliest = expiries.length ? Math.min(...expiries) : null;
  const selfExpired = earliest != null && earliest <= nowMs;
  return {
    state: selfExpired ? BROWSER_AUTH_STATES.EXPIRED : BROWSER_AUTH_STATES.VALID,
    // METADATA CANNOT PROVE A SESSION WORKS, and saying otherwise is how this
    // failure hid. Slot 5's cookies claimed 2027 while the server was already
    // answering `refresh_token_not_found`. A metadata read reports presence;
    // only verifyBrowserAuth may promote it to verified.
    state_source: "metadata",
    verified: false,
    slot,
    storage_path: path,
    exists: true,
    // Metadata a status display needs; nothing that could authenticate anyone.
    cookie_count: cookies.length,
    cookie_names: cookies.map((c) => String(c?.name || "")).filter(Boolean).slice(0, 8),
    earliest_expiry: earliest ? new Date(earliest).toISOString() : null,
    captured_at: stat ? new Date(stat.mtimeMs).toISOString() : null,
    mode: stat ? `0${(stat.mode & 0o777).toString(8)}` : null,
    // Outside every repository by construction, so it cannot reach Git.
    outside_worktree: !path.includes("/Code/alloy-worktrees/"),
  };
}

/**
 * May this lane ask for a browser-auth capture on this slot?
 *
 * Everything is bound: the lane must be registered, own that worktree, hold
 * that slot, and the slot's permanent port must be the one being driven. A
 * mismatch anywhere is refused rather than reconciled, because reconciling is
 * how one slot ends up overwriting another slot's session.
 */
export function validateBrowserAuthRequest({
  lane,
  slot,
  port = null,
  baseUrl = null,
  expectedIdentity = null,
  worktreePath = null,
} = {}) {
  if (!lane?.lane_id) {
    return { ok: false, error: BROWSER_AUTH_REFUSALS.UNREGISTERED_LANE };
  }
  const laneWorktree = lane.binding?.worktree_path || null;
  if (!laneWorktree) {
    return { ok: false, error: BROWSER_AUTH_REFUSALS.WORKTREE_MISMATCH, detail: "the lane has no worktree" };
  }
  if (worktreePath && worktreePath !== laneWorktree) {
    return {
      ok: false,
      error: BROWSER_AUTH_REFUSALS.WORKTREE_MISMATCH,
      detail: `the lane owns ${laneWorktree}`,
    };
  }
  const n = Number(slot);
  if (!Number.isInteger(n) || !SLOT_PORTS[n]) {
    return { ok: false, error: BROWSER_AUTH_REFUSALS.SLOT_MISMATCH, detail: `slot ${slot} is not a managed slot` };
  }
  const expectedPort = SLOT_PORTS[n];
  if (port != null && Number(port) !== expectedPort) {
    return {
      ok: false,
      error: BROWSER_AUTH_REFUSALS.PORT_MISMATCH,
      detail: `slot ${n} is permanently port ${expectedPort}`,
    };
  }
  const base = baseUrl || `http://127.0.0.1:${expectedPort}`;
  if (!isLoopbackBase(base)) {
    return { ok: false, error: BROWSER_AUTH_REFUSALS.NON_LOOPBACK, detail: "only a loopback base may be driven" };
  }
  if (!expectedIdentity || !/^[^@\s]+@[^@\s]+$/.test(String(expectedIdentity))) {
    return {
      ok: false,
      error: BROWSER_AUTH_REFUSALS.NO_IDENTITY,
      detail: "an expected QA identity is required; there is no silent fallback account",
    };
  }
  return {
    ok: true,
    slot: n,
    port: expectedPort,
    base_url: base,
    worktree_path: laneWorktree,
    expected_identity: String(expectedIdentity),
    lane_id: lane.lane_id,
  };
}

/**
 * The identity a captured session actually belongs to.
 *
 * Read from the app, not from the storage file: the file holds an opaque token,
 * and asking the running app who it is, is the only answer that means anything.
 */
export async function readAuthenticatedIdentity({ baseUrl, storagePath, probe = null } = {}) {
  if (probe) return probe({ baseUrl, storagePath });
  return { ok: false, error: "no_identity_probe_configured" };
}

/**
 * Verify the captured state the only way that proves anything: in a FRESH
 * browser context, against the running app.
 *
 * Delegates to `alloy-agent-verify <slot> authenticated-home`, which already
 * opens a new context with `storageState` and drives the real routes. Reusing it
 * means there is one definition of "authenticated" on this machine rather than
 * a second one here that could drift from it — and this module still never sees
 * a cookie value.
 */
export async function verifyBrowserAuth(validated, {
  spawn = null,
  verifyCommand = null,
  timeoutMs = 180_000,
} = {}) {
  const cmd = verifyCommand || join(stateRootToolkit(), "alloy-agent-verify");
  const run = spawn || defaultSpawn;
  const out = await run(cmd, [String(validated.slot), "authenticated-home"], { timeoutMs });
  const text = `${out.stdout || ""}\n${out.stderr || ""}`;

  // The app is asked who it is; the storage file is never parsed for identity.
  const m = text.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/);
  const actualIdentity = m ? m[1] : null;
  const redirected = /\/login\b/.test(text) && /redirect|redirected/i.test(text);

  if (!out.ok && !actualIdentity) {
    return {
      ok: false,
      state: BROWSER_AUTH_STATES.VERIFICATION_FAILED,
      detail: redactAuthText(out.stderr || out.error || "verification did not complete"),
      actual_identity: null,
    };
  }
  const verdict = classifyVerification({
    expectedIdentity: validated.expected_identity,
    actualIdentity,
    workspaceRedirectsToLogin: redirected,
  });
  return {
    ok: verdict.state === BROWSER_AUTH_STATES.RESTORED,
    state: verdict.state,
    detail: verdict.detail || null,
    actual_identity: actualIdentity,
  };
}

/**
 * Compare what we got against what was required.
 *
 * A different account is `wrong_identity`, never "close enough". Silently
 * accepting another QA account is how one slot's certification run starts
 * asserting against another slot's data.
 */
export function classifyVerification({ expectedIdentity, actualIdentity, workspaceRedirectsToLogin }) {
  if (workspaceRedirectsToLogin === true) {
    return { state: BROWSER_AUTH_STATES.VERIFICATION_FAILED, detail: "/workspace still redirects to /login" };
  }
  if (!actualIdentity) {
    return { state: BROWSER_AUTH_STATES.VERIFICATION_FAILED, detail: "no authenticated identity was reported" };
  }
  if (String(actualIdentity).toLowerCase() !== String(expectedIdentity).toLowerCase()) {
    return {
      state: BROWSER_AUTH_STATES.WRONG_IDENTITY,
      detail: `signed in as ${actualIdentity}, expected ${expectedIdentity}`,
    };
  }
  return { state: BROWSER_AUTH_STATES.RESTORED };
}

const activeCaptures = new Map();

/** One interactive capture per slot, ever. */
export function captureInFlight(slot) {
  return activeCaptures.get(Number(slot)) || null;
}

export function resetCapturesForTests() {
  activeCaptures.clear();
}

/**
 * Drive the interactive capture and wait for the Director.
 *
 * The agent starts it and can cancel it; the agent cannot complete it. The
 * promise settles when the Director finishes signing in, cancels, or the
 * timeout elapses.
 */
export async function beginBrowserAuthCapture(validated, {
  timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
  nowMs = Date.now(),
  spawn = null,
  loginCommand = null,
} = {}) {
  const slot = validated.slot;
  if (activeCaptures.has(slot)) {
    return {
      ok: false,
      error: BROWSER_AUTH_REFUSALS.CAPTURE_IN_FLIGHT,
      state: BROWSER_AUTH_STATES.AWAITING_OPERATOR,
      started_at: activeCaptures.get(slot).started_at,
    };
  }
  const record = {
    slot,
    state: BROWSER_AUTH_STATES.AWAITING_OPERATOR,
    started_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + timeoutMs).toISOString(),
    cancel: null,
  };
  activeCaptures.set(slot, record);

  const cmd = loginCommand || join(stateRootToolkit(), "alloy-agent-login");
  const run = spawn || defaultSpawn;
  try {
    const out = await run(cmd, [String(slot)], { timeoutMs });
    if (out.cancelled) return { ok: false, state: BROWSER_AUTH_STATES.CANCELLED, slot };
    if (out.timedOut) return { ok: false, state: BROWSER_AUTH_STATES.TIMED_OUT, slot, waited_ms: timeoutMs };
    if (!out.ok) {
      return { ok: false, state: BROWSER_AUTH_STATES.VERIFICATION_FAILED, slot, detail: redactAuthText(out.stderr || out.error) };
    }
    return { ok: true, state: BROWSER_AUTH_STATES.VERIFYING, slot };
  } finally {
    activeCaptures.delete(slot);
  }
}

function stateRootToolkit() {
  return join(homedir(), ".local", "share", "alloy", "toolkit", "current");
}

function defaultSpawn(cmd, argv, { timeoutMs }) {
  return new Promise((resolveP) => {
    const child = execFile(cmd, argv, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
      (err, stdout, stderr) => {
        resolveP({
          ok: !err,
          timedOut: Boolean(err && err.killed && err.signal === "SIGTERM"),
          cancelled: false,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          error: err ? String(err.message || err) : null,
        });
      });
    if (child) child.unref?.();
  });
}

/**
 * Nothing that could authenticate anyone may reach a log or a result.
 *
 * Belt and braces: the capture tool already refuses to print cookies, and this
 * strips anything that looks like one anyway, because a result is durable and a
 * mistake here is permanent.
 */
export function redactAuthText(text) {
  return String(text || "")
    .replace(/\b(sb-[a-z0-9-]+-auth-token|access_token|refresh_token|password|authorization)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "[redacted-jwt]")
    .slice(0, 2000);
}

/** The durable record. Metadata only — this is written down and kept. */
export function publicAuthOutcome({ validated, state, status = null, detail = null, nowMs = Date.now() }) {
  return {
    schema_version: "vacilando.browser_auth.v1",
    state,
    headline: state === BROWSER_AUTH_STATES.RESTORED
      ? `Browser session restored for slot ${validated.slot}`
      : browserAuthHeadline(state, validated.slot),
    lane_id: validated.lane_id,
    slot: validated.slot,
    port: validated.port,
    base_url: validated.base_url,
    worktree_path: validated.worktree_path,
    expected_identity: validated.expected_identity,
    verified_at: state === BROWSER_AUTH_STATES.RESTORED ? new Date(nowMs).toISOString() : null,
    storage_captured_at: status?.captured_at || null,
    storage_mode: status?.mode || null,
    cookie_count: status?.cookie_count ?? null,
    earliest_expiry: status?.earliest_expiry || null,
    storage_outside_worktree: status?.outside_worktree ?? true,
    detail: detail ? redactAuthText(detail) : null,
    // Stated on every outcome, because this record is durable.
    secrets_recorded: false,
  };
}

export function browserAuthHeadline(state, slot) {
  switch (state) {
    case BROWSER_AUTH_STATES.VALID: return `Browser session present for slot ${slot} — not yet verified`;
    case BROWSER_AUTH_STATES.MISSING:
    case BROWSER_AUTH_STATES.EXPIRED: return "Browser session expired — Re-authentication required";
    case BROWSER_AUTH_STATES.AWAITING_OPERATOR: return `Waiting for you to sign in — slot ${slot}`;
    case BROWSER_AUTH_STATES.VERIFYING: return `Verifying the captured session — slot ${slot}`;
    case BROWSER_AUTH_STATES.RESTORED: return `Browser session restored for slot ${slot}`;
    case BROWSER_AUTH_STATES.CANCELLED: return "Sign-in cancelled";
    case BROWSER_AUTH_STATES.TIMED_OUT: return "Sign-in timed out";
    case BROWSER_AUTH_STATES.WRONG_IDENTITY: return "Signed in as the wrong account";
    case BROWSER_AUTH_STATES.VERIFICATION_FAILED: return "Sign-in could not be verified";
    default: return "Browser session status unknown";
  }
}

/** Does this state stop the lane from proceeding? */
export function blocksExecution(state) {
  return [
    BROWSER_AUTH_STATES.MISSING,
    BROWSER_AUTH_STATES.EXPIRED,
    BROWSER_AUTH_STATES.WRONG_IDENTITY,
    BROWSER_AUTH_STATES.VERIFICATION_FAILED,
    BROWSER_AUTH_STATES.TIMED_OUT,
    BROWSER_AUTH_STATES.CANCELLED,
  ].includes(state);
}

/**
 * Attach browser-auth status to each lane, so the recovery card can appear.
 *
 * Metadata only, and cheap: a stat and a JSON parse per lane with a slot. A lane
 * with no slot has no browser session to recover and gets nothing.
 */
export function attachLaneBrowserAuth(lanes, { root = stateRoot(), qaIdentityFor = null } = {}) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  return list.map((lane) => {
    const slot = laneSlot(lane);
    if (!slot) return lane;
    let status;
    try { status = readSlotAuthStatus(slot, { root }); } catch { return lane; }
    const identity = qaIdentityFor ? qaIdentityFor(slot) : null;
    // A RECORDED LIVE VERDICT OUTRANKS OPTIMISTIC METADATA. A present-but-broken
    // session otherwise reads as fine forever, and the lane that most needs the
    // recovery action is the one that never shows it. A verdict is only allowed
    // to make the state WORSE than metadata claimed, never better — only a fresh
    // verification may say restored.
    const verdict = readSlotVerification(slot, { root });
    const effective = verdict && blocksExecution(verdict.state) && !blocksExecution(status.state)
      ? verdict.state
      : status.state;
    return {
      ...lane,
      browser_auth: {
        state: effective,
        last_verified_state: verdict?.state || null,
        last_verified_at: verdict?.at || null,
        headline: browserAuthHeadline(effective, slot),
        blocks_execution: blocksExecution(effective),
        verified: status.verified === true,
        slot,
        port: SLOT_PORTS[slot] || null,
        base_url: SLOT_PORTS[slot] ? `http://127.0.0.1:${SLOT_PORTS[slot]}` : null,
        expected_identity: identity,
        storage_captured_at: status.captured_at || null,
        earliest_expiry: status.earliest_expiry || null,
        // Explains a state the operator can otherwise see contradicted on disk,
        // e.g. a session captured under the base runtime root that the verifier
        // does not read.
        detail: status.detail || verdict?.detail || null,
        secrets_recorded: false,
      },
    };
  });
}

/** A lane's slot, from its binding or from its worktree name. */
export function laneSlot(lane) {
  const explicit = Number(lane?.binding?.slot);
  if (Number.isInteger(explicit) && SLOT_PORTS[explicit]) return explicit;
  const m = String(lane?.binding?.worktree_path || lane?.worktree?.name || "").match(/(?:^|\/)wt(\d)-/);
  const n = m ? Number(m[1]) : null;
  return n && SLOT_PORTS[n] ? n : null;
}
