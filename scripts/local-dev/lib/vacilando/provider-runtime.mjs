/**
 * Vacilando — Provider Runtime (V1).
 *
 * A first-class runtime that OWNS provider authentication, connection status,
 * capabilities, health, usage, limits, cost, and version. Workers reference a
 * provider by id; they never authenticate it and never inspect the CLI directly.
 * The Worker Runtime asks the Provider Runtime to carry a request; the Provider
 * Runtime does the single shared auth pre-check and only then dispatches through
 * the low-level transport (providers.mjs, prompt-on-stdin, fixed argv).
 *
 * Root cause this exists to fix (Phase 0):
 *   Claude OAuth lives in the per-user macOS login Keychain item
 *   "Claude Code-credentials" — a SINGLE shared credential, not per-HOME, not
 *   per-worktree, not per-worker. So auth is already global at the storage layer;
 *   there is nothing per-worker to "log into". The recurring re-login happened
 *   because Vacilando fired `claude -p` per worker with no shared auth owner and
 *   no pre-check, surfacing raw CLI auth errors as if each worker needed its own
 *   login. Provider Runtime makes auth infrastructure: one owner, one status,
 *   one reconnect that fixes every worker.
 *
 * No secrets are ever read into responses. Auth probes extract only presence
 * booleans, expiry timestamps, and the signed-in identity (email) — never tokens.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { PROVIDERS as TRANSPORT, sendInstruction } from "./providers.mjs";

const HOME = os.homedir();
const CLAUDE_KEYCHAIN_SERVICE = "Claude Code-credentials";
const PROBE_TTL_MS = 25000; // cache auth/version probes; dashboard polls frequently

// GUI-launched hosts (the Electron app) spawn this server with a truncated PATH
// that omits ~/.local/bin — where cursor-agent and claude are installed — so every
// provider probe and dispatch fails with a spurious "needs to reconnect". Ensure
// the user's local bin dirs are on PATH for this process and everything it spawns.
for (const dir of [join(HOME, ".local", "bin"), join(HOME, "bin")]) {
  const parts = (process.env.PATH || "").split(":");
  if (existsSync(dir) && !parts.includes(dir)) process.env.PATH = `${dir}:${process.env.PATH || ""}`;
}

const run = (bin, args, timeout = 8000) =>
  new Promise((res) => {
    let out = "", err = "", done = false;
    let child;
    try { child = execFile(bin, args, { timeout, windowsHide: true }, (e, so, se) => { if (done) return; done = true; res({ code: e ? (e.code ?? 1) : 0, out: so || "", err: se || (e && e.message) || "" }); }); }
    catch (e) { return res({ code: "spawn_error", out: "", err: String(e && e.message || e) }); }
    child.on?.("error", (e) => { if (done) return; done = true; res({ code: "spawn_error", out, err: String(e.code || e.message) }); });
  });

const has = (bin) => existsSync(bin) || null; // resolved below via which-like probe

// ---- capability matrix (each adapter DECLARES what it supports) ------------
export const ADAPTERS = {
  claude: {
    id: "claude", label: "Claude", bin: "claude", transport: "cli",
    auth_kind: "oauth", auth_location: `macOS login Keychain · "${CLAUDE_KEYCHAIN_SERVICE}"`,
    capabilities: { start: true, resume: true, ask: true, stream: true, cost: true, usage: true, authentication: "oauth" },
    reconnect_cmd: "claude  (then /login in the Claude CLI, or `claude` desktop sign-in)",
    login_cmd: "claude",
    disconnect_cmd: "claude  (then /logout) — clears the shared Keychain credential for every worker",
    docs: "Headless: `claude -p` (prompt on stdin). Resumable via --resume <session>. Reports authoritative cost + token usage when authenticated.",
  },
  cursor: {
    id: "cursor", label: "Cursor", bin: "cursor-agent", transport: "cli",
    auth_kind: "oauth", auth_location: "cursor-agent credential store (cursor-agent login)",
    capabilities: { start: true, resume: true, ask: true, stream: true, cost: false, usage: true, authentication: "oauth" },
    reconnect_cmd: "cursor-agent login",
    login_cmd: "cursor-agent login",
    disconnect_cmd: "cursor-agent logout",
    docs: "Headless: `cursor-agent -p --trust` (prompt on stdin). Reports token usage; no authoritative per-token price → cost unavailable.",
  },
  openai: {
    id: "openai", label: "OpenAI", bin: null, transport: "api",
    auth_kind: "api_key", auth_location: "environment variable OPENAI_API_KEY",
    capabilities: { start: false, resume: false, ask: true, stream: true, cost: true, usage: true, authentication: "api_key" },
    reconnect_cmd: "export OPENAI_API_KEY=… (configure a key)",
    disconnect_cmd: "unset OPENAI_API_KEY",
    docs: "Adapter declared but not wired for round-trips in V1. Configured when OPENAI_API_KEY is present; otherwise reported as not configured.",
  },
};

// ---- runtime facts (executable / runtime / environment), no secrets --------
function runtimeFacts() {
  return {
    home: HOME,
    node: process.version,
    server_pid: process.pid,
    // Whether this process is itself running inside a Claude Code host session —
    // a real, load-bearing fact for claude auth behavior (nested child sessions).
    inside_claude_host: process.env.CLAUDECODE === "1" || process.env.CLAUDE_CODE_ENTRYPOINT != null,
    path_head: (process.env.PATH || "").split(":").slice(0, 3).join(":"),
  };
}

// ---- per-provider probes (cached) -----------------------------------------
const cache = new Map(); // id -> { at, data }

async function whichBin(bin) {
  if (!bin) return null;
  const r = await run("/usr/bin/which", [bin], 3000);
  return r.code === 0 ? r.out.trim().split("\n")[0] : null;
}

async function probeClaude() {
  const executable = await whichBin("claude");
  if (!executable) return { state: "unavailable", reason: "binary missing", detail: "claude not found on PATH", executable: null, version: null, identity: null, expiresAt: null };
  const ver = await run("claude", ["--version"], 4000);
  const version = (ver.out || "").trim().split(/\s+/)[0] || null;
  // Read the shared Keychain credential — presence/expiry only, never tokens.
  const kc = await run("/usr/bin/security", ["find-generic-password", "-s", CLAUDE_KEYCHAIN_SERVICE, "-w"], 5000);
  let identity = null;
  try { const j = JSON.parse(readFileSync(join(HOME, ".claude.json"), "utf8")); identity = j?.oauthAccount?.emailAddress || null; } catch { /* ignore */ }
  if (kc.code !== 0 || !kc.out) {
    return { state: "needs_auth", reason: "no stored credential", detail: `no "${CLAUDE_KEYCHAIN_SERVICE}" item in the login Keychain`, executable, version, identity, expiresAt: null };
  }
  let cred = null;
  try { cred = JSON.parse(kc.out.trim()); } catch { /* opaque */ }
  const o = cred?.claudeAiOauth || cred || {};
  const hasAccess = typeof o.accessToken === "string" && o.accessToken.length > 0;
  const hasRefresh = typeof o.refreshToken === "string" && o.refreshToken.length > 0;
  const expiresAt = o.expiresAt ? Number(o.expiresAt) : null;
  const refreshExp = o.refreshTokenExpiresAt ? Number(o.refreshTokenExpiresAt) : null;
  const now = Date.now();
  if (!hasAccess && !hasRefresh) {
    return { state: "needs_auth", reason: "credential blanked", detail: "Keychain credential has empty access + refresh tokens (expiresAt=0) — the stored OAuth session was cleared; a reconnect is required.", executable, version, identity, expiresAt, subscription: o.subscriptionType || null };
  }
  const accessValid = hasAccess && (!expiresAt || expiresAt > now);
  const refreshValid = hasRefresh && (!refreshExp || refreshExp > now);
  if (accessValid || refreshValid) {
    return { state: "authenticated", reason: null, detail: accessValid ? "access token valid" : "access token expired; refresh token valid (auto-refresh on next call)", executable, version, identity, expiresAt, subscription: o.subscriptionType || null };
  }
  return { state: "needs_auth", reason: "expired", detail: "access and refresh tokens are expired", executable, version, identity, expiresAt, subscription: o.subscriptionType || null };
}

async function probeCursor() {
  const executable = await whichBin("cursor-agent");
  if (!executable) return { state: "unavailable", reason: "binary missing", detail: "cursor-agent not found on PATH", executable: null, version: null, identity: null };
  const ver = await run("cursor-agent", ["--version"], 4000);
  const version = (ver.out || "").trim().split(/\s+/)[0] || null;
  const st = await run("cursor-agent", ["status"], 6000);
  const text = `${st.out}${st.err}`;
  const m = text.match(/logged in as\s+([^\s]+@[^\s]+)/i);
  if (m) return { state: "authenticated", reason: null, detail: "cursor-agent reports logged in", executable, version, identity: m[1] };
  if (/not logged in|logged out|sign in|no.*auth/i.test(text)) return { state: "needs_auth", reason: "logged out", detail: "cursor-agent reports not logged in", executable, version, identity: null };
  return { state: "unknown", reason: "unclear", detail: (text || "no status output").slice(0, 120), executable, version, identity: null };
}

async function probeOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (key && key.length > 0) return { state: "configured", reason: null, detail: "OPENAI_API_KEY present (adapter not wired for round-trips in V1)", executable: null, version: null, identity: null };
  return { state: "not_configured", reason: "no api key", detail: "OPENAI_API_KEY is not set", executable: null, version: null, identity: null };
}

const PROBES = { claude: probeClaude, cursor: probeCursor, openai: probeOpenAI };

async function probe(id, { force = false } = {}) {
  const c = cache.get(id);
  if (!force && c && Date.now() - c.at < PROBE_TTL_MS) return c.data;
  const data = await (PROBES[id] || (async () => ({ state: "unknown", reason: "no probe" })))();
  cache.set(id, { at: Date.now(), data });
  return data;
}

// ---- health derivation -----------------------------------------------------
function healthOf(state) {
  if (state === "authenticated") return { level: "healthy", label: "Healthy" };
  if (state === "configured") return { level: "idle", label: "Configured" };
  if (state === "not_configured") return { level: "idle", label: "Not configured" };
  if (state === "needs_auth") return { level: "attention", label: "Authentication required" };
  if (state === "unavailable") return { level: "down", label: "Unavailable" };
  return { level: "idle", label: "Unknown" };
}

// Map a provider auth state to the operator-facing status vocabulary.
export function authLabel(state) {
  return { authenticated: "Authenticated", configured: "Configured", not_configured: "Not configured", needs_auth: "Authentication required", unavailable: "Unavailable", unknown: "Unknown" }[state] || "Unknown";
}

/**
 * Full Provider Runtime snapshot. `usage` (per provider, from the Director log)
 * and `workers` (how many active workers reference each provider) are injected
 * by the server so this module stays free of snapshot coupling.
 */
export async function getProviderRuntime({ usageByProvider = {}, workersByProvider = {}, force = false } = {}) {
  const facts = runtimeFacts();
  const providers = [];
  for (const id of Object.keys(ADAPTERS)) {
    const a = ADAPTERS[id];
    const pr = await probe(id, { force });
    const u = usageByProvider[id] || null;
    providers.push({
      id, label: a.label, transport: a.transport,
      version: pr.version || null,
      auth: {
        state: pr.state, label: authLabel(pr.state),
        kind: a.auth_kind, location: a.auth_location,
        identity: pr.identity || null, reason: pr.reason || null, detail: pr.detail || null,
        expires_at: pr.expiresAt || null, subscription: pr.subscription || null,
      },
      health: healthOf(pr.state),
      capabilities: a.capabilities,
      usage: u ? { calls: u.calls, calls_today: u.calls_today, input_tokens: u.input_tokens, output_tokens: u.output_tokens, cost: u.cost, avg_duration_ms: u.avg_duration_ms, failures: u.failures, last_success: u.last_ok } : { calls: 0, calls_today: 0, last_success: null, cost: { kind: "unavailable", value_usd: null } },
      active_workers: workersByProvider[id] || 0,
      executable: pr.executable || null,
      reconnect_cmd: a.reconnect_cmd,
      disconnect_cmd: a.disconnect_cmd,
      docs: a.docs,
      last_error: pr.state === "needs_auth" ? "Authentication required" : pr.state === "unavailable" ? (pr.detail || "Unavailable") : null,
    });
  }
  return { generated_at: new Date().toISOString(), runtime: facts, providers };
}

// ---- single request path (Worker Runtime → Provider Runtime → transport) ---
/**
 * The ONLY way a worker request reaches a provider. Does the shared auth
 * pre-check FIRST so an unauthenticated provider yields a clean
 * "Authentication required" instead of raw CLI output — and never prompts.
 */
export async function sendViaProvider({ provider, message, cwd, resume = null, timeout } = {}) {
  const a = ADAPTERS[provider];
  if (!a) return { ok: false, provider, error: `unknown provider: ${provider}`, auth_required: false, unsupported: true };
  if (a.transport !== "cli" || !TRANSPORT[provider]) {
    return { ok: false, provider, error: `${a.label} is declared but not wired for round-trips in V1`, auth_required: false, unsupported: true };
  }
  const pr = await probe(provider);
  // Block ONLY on a definite negative. On an inconclusive probe ("unknown" — e.g.
  // the auth-status command was starved under memory pressure) proceed and let the
  // real round-trip decide, so a slow probe never false-fails a send.
  if (pr.state === "needs_auth" || pr.state === "unavailable" || pr.state === "not_configured") {
    return { ok: false, provider, error: `${a.label} needs to reconnect`, auth_required: true, auth_state: pr.state, detail: pr.detail || null, reconnect_cmd: a.reconnect_cmd };
  }
  const r = await sendInstruction({ provider, message, cwd, resume, timeout });
  // A round-trip that fails with an auth error means the shared credential turned
  // over mid-flight — refresh the probe so the runtime reflects it immediately.
  if (r.ok === false && /oauth|auth|expired|log ?in|credential/i.test(r.error || "")) {
    cache.delete(provider);
    return { ...r, auth_required: true };
  }
  return r;
}

/**
 * Shared auth pre-check for a MISSION turn — the same fail-closed gate
 * sendViaProvider applies, but WITHOUT dispatching a turn (the executor owns
 * the streaming child). Returns { ok:true } when it is safe to start a turn, or
 * a clean auth/unsupported refusal. An inconclusive "unknown" probe proceeds
 * (the real turn decides), so a starved probe never false-fails a mission.
 */
export async function precheckProvider(provider) {
  const a = ADAPTERS[provider];
  if (!a) return { ok: false, error: `unknown provider: ${provider}`, unsupported: true };
  if (a.transport !== "cli" || !TRANSPORT[provider]) {
    return { ok: false, error: `${a.label} is declared but not wired for mission turns in V1`, unsupported: true };
  }
  const pr = await probe(provider);
  if (pr.state === "needs_auth" || pr.state === "unavailable" || pr.state === "not_configured") {
    return { ok: false, auth_required: true, auth_state: pr.state, error: `${a.label} needs to reconnect`, detail: pr.detail || null, reconnect_cmd: a.reconnect_cmd };
  }
  return { ok: true, provider, auth_state: pr.state };
}

/** An auth error surfaced by a live turn means the shared credential turned over. */
export function invalidateProviderProbe(provider) { cache.delete(provider); }

/** Whether the provider adapter DECLARES resume (--resume) support. */
export function providerResumable(provider) {
  return Boolean(ADAPTERS[provider]?.capabilities?.resume);
}

/** Verify: force a fresh probe (the "Verify" button). No round-trip cost. */
export async function verifyProvider(id) {
  if (!ADAPTERS[id]) return { ok: false, error: `unknown provider: ${id}` };
  const pr = await probe(id, { force: true });
  return { ok: true, id, state: pr.state, label: authLabel(pr.state), detail: pr.detail, identity: pr.identity || null, version: pr.version || null };
}

/** Reconnect info: the exact operator action (Vacilando cannot do interactive OAuth headlessly). */
export function reconnectInfo(id) {
  const a = ADAPTERS[id];
  if (!a) return { ok: false, error: `unknown provider: ${id}` };
  return {
    ok: true, id, label: a.label, command: a.reconnect_cmd, auth_location: a.auth_location,
    note: "Vacilando cannot perform an interactive OAuth sign-in from a governed headless command. Run the command in a terminal once; the whole Provider Runtime (and every worker) then uses it.",
  };
}

const LOGIN_CMDS = Object.freeze({
  claude: "claude",
  cursor: "cursor-agent login",
});

let loginOpenImpl = null;
export function setProviderLoginOpenImplForTests(fn) {
  loginOpenImpl = typeof fn === "function" ? fn : null;
}

/**
 * Open a Terminal window for the allowlisted login command. Vacilando cannot
 * complete OAuth itself; the operator finishes sign-in, then clicks Verify.
 */
export async function openProviderLogin(id) {
  const a = ADAPTERS[id];
  if (!a) return { ok: false, error: `unknown provider: ${id}` };
  const command = LOGIN_CMDS[id];
  if (!command) {
    return {
      ok: false,
      error: "login_not_interactive",
      id,
      label: a.label,
      command: a.reconnect_cmd,
    };
  }
  const line = `${command}; echo; echo Done — return to Vacilando Settings and click Verify.`;
  if (loginOpenImpl) return loginOpenImpl({ id, command, line, label: a.label });
  try {
    execFileSync("/usr/bin/osascript", [
      "-e", "tell application \"Terminal\" to activate",
      "-e", `tell application "Terminal" to do script ${JSON.stringify(line)}`,
    ], { timeout: 8000, stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, opened: true, id, label: a.label, command };
  } catch (e) {
    return {
      ok: true,
      opened: false,
      id,
      label: a.label,
      command,
      error: "terminal_open_failed",
      detail: String(e.stderr || e.message || e).slice(0, 240),
      note: a.reconnect_cmd,
    };
  }
}

/** Diagnostics: everything an operator needs, no secrets. */
export async function providerDiagnostics(id) {
  const a = ADAPTERS[id];
  if (!a) return { ok: false, error: `unknown provider: ${id}` };
  const pr = await probe(id, { force: true });
  return {
    ok: true, id, label: a.label,
    executable: pr.executable || null, version: pr.version || null,
    auth: { state: pr.state, label: authLabel(pr.state), location: a.auth_location, identity: pr.identity || null, reason: pr.reason || null, detail: pr.detail || null, expires_at: pr.expiresAt || null, subscription: pr.subscription || null },
    capabilities: a.capabilities, runtime: runtimeFacts(), reconnect_cmd: a.reconnect_cmd,
  };
}
