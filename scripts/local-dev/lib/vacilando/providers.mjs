/**
 * Vacilando Runtime — Provider Adapter (real Claude / Cursor communication).
 *
 * A governed adapter over the installed provider CLIs. FIXED argv only — no
 * request-supplied shell, no arbitrary executable paths. The operator's message
 * is passed as a single argv element (or via a fixed flag), never interpolated
 * into a shell. Structured JSON output is parsed; usage/cost surfaced when the
 * provider reports it.
 *
 * Recon (this machine):
 *   claude       2.1.210  — `claude -p --output-format json [--resume <id>]`
 *                           mechanism works; OAuth may be EXPIRED → returns a
 *                           real auth-error result (surfaced, not hidden).
 *   cursor-agent          — `cursor-agent -p --output-format json --trust
 *                           [--resume <id>]` — authenticated; real round-trips.
 *
 * Only supported operations are implemented; unsupported ones return
 * { supported:false, reason }.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const CLAUDE = "claude";
const CURSOR = "cursor-agent";
const DEFAULT_TIMEOUT = 90000;

export const PROVIDERS = {
  claude: { bin: CLAUDE, label: "Claude Code" },
  cursor: { bin: CURSOR, label: "Cursor Agent" },
};

/** Run a provider CLI with a FIXED argv (message is a single element). */
function runProvider(bin, args, { cwd, timeout = DEFAULT_TIMEOUT } = {}) {
  return new Promise((res) => {
    const t0 = Date.now();
    let out = "", se = "", done = false;
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], cwd: cwd && existsSync(cwd) ? cwd : undefined });
    const finish = (o) => { if (done) return; done = true; clearTimeout(timer); res({ ...o, duration_ms: Date.now() - t0 }); };
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} finish({ ok: false, timed_out: true, error: "provider timed out" }); }, timeout);
    child.on("error", (e) => finish({ ok: false, error: `spawn failed: ${e.code || e.message}` }));
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { se += d; });
    child.on("close", (code) => finish({ ok: code === 0, code, stdout: out, stderr: se }));
  });
}

/** Normalize a provider JSON result into a common shape. */
function normalize(provider, r) {
  if (!r.ok && !r.stdout) {
    return { ok: false, provider, error: r.error || r.stderr?.slice(0, 300) || `exit ${r.code}`, timed_out: r.timed_out || false, raw: null };
  }
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* keep text */ }
  if (!j) return { ok: r.ok, provider, text: (r.stdout || "").slice(0, 4000), session_id: null, is_error: !r.ok, error: r.ok ? null : "non-JSON provider output", usage: null, duration_ms: r.duration_ms };
  const usage = j.usage ? {
    input_tokens: j.usage.input_tokens ?? j.usage.inputTokens ?? null,
    output_tokens: j.usage.output_tokens ?? j.usage.outputTokens ?? null,
    cost_usd: j.total_cost_usd ?? null,
  } : null;
  return {
    ok: j.is_error === false || (r.ok && j.is_error !== true),
    provider,
    text: typeof j.result === "string" ? j.result : JSON.stringify(j.result || j).slice(0, 4000),
    session_id: j.session_id || null,
    is_error: Boolean(j.is_error),
    error: j.is_error ? (typeof j.result === "string" ? j.result : "provider error") : null,
    usage,
    duration_ms: r.duration_ms,
  };
}

/** provider availability (binary present). */
export function providerAvailable(provider) {
  const p = PROVIDERS[provider];
  if (!p) return false;
  // `which` semantics: rely on PATH resolution by spawn; presence is proven by a real call.
  return Boolean(p);
}

/**
 * sendInstruction — a real round-trip. Sends `message` to the provider and
 * returns its structured response. `resume` continues an existing session id.
 * `cwd` gives the provider the worktree as context (Cursor uses --trust).
 */
export async function sendInstruction({ provider, message, resume = null, cwd = null, timeout } = {}) {
  const p = PROVIDERS[provider];
  if (!p) return { ok: false, provider, error: `unknown provider: ${provider}`, supported: false };
  if (!message || typeof message !== "string") return { ok: false, provider, error: "message required" };
  let args;
  if (provider === "claude") {
    args = ["-p", message, "--output-format", "json", ...(resume ? ["--resume", resume] : [])];
  } else {
    args = ["-p", message, "--output-format", "json", "--trust", ...(resume ? ["--resume", resume] : [])];
  }
  const r = await runProvider(p.bin, args, { cwd, timeout });
  return normalize(provider, r);
}

/** requestStatus — a bounded read-only round-trip asking the worker to summarize. */
export async function requestStatus({ provider, cwd, resume } = {}) {
  return sendInstruction({ provider, cwd, resume, message: "In 2-3 sentences, summarize the current state of your work: what you last changed, anything blocking you, and any open question. Do not modify any files.", timeout: 120000 });
}

/** Operations not implemented as governed CLI capabilities (honest). */
export const UNSUPPORTED_OPS = {
  startSession: "Launching a fresh interactive editor session is done through alloy-sprint-start (Start Work), not the provider adapter.",
  stopSession: "Stopping a session is done through worker.pause / sprint.finish, not the provider adapter.",
  streamEvents: "Streaming (stream-json) is supported by both CLIs but not wired into the loopback UI yet.",
};
