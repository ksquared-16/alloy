/**
 * Vacilando Runtime — Provider Adapter (real Claude / Cursor communication).
 *
 * A governed adapter over the installed provider CLIs. FIXED argv only — no
 * request-supplied shell, no arbitrary executable paths. The operator's message
 * is delivered on the provider's STDIN (both `claude -p` and `cursor-agent -p`
 * read the prompt from stdin), never as a command-line argument. This is
 * deliberate: an argv-borne prompt would leak the full instruction into process
 * listings (`ps`) and is bounded by ARG_MAX; stdin has neither problem and needs
 * no temp file to clean up. Structured JSON output is parsed; usage/cost
 * surfaced when the provider reports it.
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

/**
 * Run a provider CLI with a FIXED argv. The operator's prompt is written to the
 * child's STDIN (never argv) — no ARG_MAX bound, no process-listing leak.
 */
function runProvider(bin, args, { cwd, timeout = DEFAULT_TIMEOUT, input = null } = {}) {
  return new Promise((res) => {
    const t0 = Date.now();
    let out = "", se = "", done = false;
    const child = spawn(bin, args, { stdio: [input != null ? "pipe" : "ignore", "pipe", "pipe"], cwd: cwd && existsSync(cwd) ? cwd : undefined });
    const finish = (o) => { if (done) return; done = true; clearTimeout(timer); res({ ...o, duration_ms: Date.now() - t0 }); };
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} finish({ ok: false, timed_out: true, error: "provider timed out" }); }, timeout);
    child.on("error", (e) => finish({ ok: false, error: `spawn failed: ${e.code || e.message}` }));
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { se += d; });
    child.on("close", (code) => finish({ ok: code === 0, code, stdout: out, stderr: se }));
    if (input != null) {
      // Guard against EPIPE if the child exits before consuming stdin.
      child.stdin.on("error", () => {});
      try { child.stdin.write(input); child.stdin.end(); } catch { /* close handler reports the exit */ }
    }
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
  // Prompt goes on stdin (see runProvider) — argv carries only fixed flags.
  let args;
  if (provider === "claude") {
    args = ["-p", "--output-format", "json", ...(resume ? ["--resume", resume] : [])];
  } else {
    args = ["-p", "--output-format", "json", "--trust", ...(resume ? ["--resume", resume] : [])];
  }
  const r = await runProvider(p.bin, args, { cwd, timeout, input: message });
  return normalize(provider, r);
}

/** requestStatus — a bounded read-only round-trip asking the worker to summarize. */
export async function requestStatus({ provider, cwd, resume } = {}) {
  return sendInstruction({ provider, cwd, resume, message: "In 2-3 sentences, summarize the current state of your work: what you last changed, anything blocking you, and any open question. Do not modify any files.", timeout: 120000 });
}

// ---- Mission turns (streaming, long-lived, resumable) ----------------------
/**
 * A MISSION turn differs from a Director round-trip in three load-bearing ways:
 *   1. Output format is stream-json, so the caller sees REAL provider activity
 *      as it happens (init → assistant → tool-use → result) rather than one
 *      opaque JSON blob at the very end. This is what makes elapsed time and
 *      "last activity" honest instead of faked.
 *   2. Timeouts are mission-scale and layered: a hard per-turn maximum AND an
 *      inactivity watchdog — NOT the old single 600s advisory bound.
 *   3. The session id is captured from the very first frame, so a mission that
 *      is interrupted after 10s still has a resumable session recorded.
 *
 * Governance is unchanged from sendInstruction: FIXED argv, prompt on STDIN
 * (never argv), shell:false, no request-supplied paths.
 *
 * Returns a HANDLE synchronously — { pid, kill(sig), done } — so the mission
 * executor can register the live child (for Stop) before the turn resolves.
 */
function missionArgs(provider, resume) {
  // A headless worker cannot answer interactive permission prompts, so it runs in
  // `acceptEdits` mode — file edits/writes are auto-approved (the worker must be
  // able to produce its declared deliverables) but Bash and other tools are NOT
  // auto-granted. Mission scope is bounded by the package prompt + governance
  // (no push/merge/promote); the operator gates start/stop.
  if (provider === "claude") {
    // `claude -p --output-format stream-json` requires --verbose in print mode.
    return ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", ...(resume ? ["--resume", resume] : [])];
  }
  // cursor-agent streams stream-json WITHOUT --verbose (it rejects that flag and
  // exits code 1 — "unknown option '--verbose'"). It uses --trust for headless auto-approve.
  return ["-p", "--output-format", "stream-json", "--trust", ...(resume ? ["--resume", resume] : [])];
}

/** Extract a compact, side-effect-free activity descriptor from a stream frame. */
function activityOf(obj) {
  const t = obj?.type;
  if (t === "system") return { kind: "init", subtype: obj.subtype || null, session_id: obj.session_id || null };
  if (t === "assistant") {
    const blocks = obj.message?.content;
    let text = null, tool = null;
    if (Array.isArray(blocks)) {
      for (const b of blocks) {
        if (b.type === "text" && typeof b.text === "string") text = (text ? text + " " : "") + b.text;
        else if (b.type === "tool_use") tool = b.name || "tool";
      }
    }
    return { kind: "assistant", text: text ? text.slice(0, 600) : null, tool };
  }
  if (t === "user") return { kind: "tool_result" };
  if (t === "result") return { kind: "result", is_error: Boolean(obj.is_error) };
  return { kind: t || "frame" };
}

const MISSION_DEFAULT_MAX_MS = 30 * 60 * 1000; // 30 min per turn (configurable by caller)
const MISSION_DEFAULT_INACTIVITY_MS = 5 * 60 * 1000; // 5 min with no provider output

/**
 * Start a streaming mission turn. Resolves { ok, text, session_id, usage,
 * is_error, timed_out, timeout_kind, duration_ms, frames } when the turn ends.
 */
export function startMissionTurn({ provider, message, cwd = null, resume = null, maxTurnMs = MISSION_DEFAULT_MAX_MS, inactivityMs = MISSION_DEFAULT_INACTIVITY_MS, onActivity } = {}) {
  const p = PROVIDERS[provider];
  if (!p) return { pid: null, kill() {}, done: Promise.resolve({ ok: false, provider, error: `unknown provider: ${provider}`, supported: false }) };
  if (!message || typeof message !== "string") return { pid: null, kill() {}, done: Promise.resolve({ ok: false, provider, error: "message required" }) };

  const args = missionArgs(provider, resume);
  const t0 = Date.now();
  let child;
  try {
    child = spawn(p.bin, args, { stdio: ["pipe", "pipe", "pipe"], cwd: cwd && existsSync(cwd) ? cwd : undefined });
  } catch (e) {
    return { pid: null, kill() {}, done: Promise.resolve({ ok: false, provider, error: `spawn failed: ${e.code || e.message}` }) };
  }

  let done = false, buf = "", sessionId = null, finalObj = null, frames = 0, resolveDone;
  const doneP = new Promise((r) => { resolveDone = r; });
  let inactivityTimer = null, hardTimer = null;

  const finish = (o) => {
    if (done) return; done = true;
    clearTimeout(inactivityTimer); clearTimeout(hardTimer);
    resolveDone({ provider, session_id: sessionId, duration_ms: Date.now() - t0, frames, ...o });
  };
  const bumpInactivity = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} finish({ ok: false, timed_out: true, timeout_kind: "inactivity", error: `no provider activity for ${Math.round(inactivityMs / 1000)}s` }); }, inactivityMs);
  };
  hardTimer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} finish({ ok: false, timed_out: true, timeout_kind: "per_turn_max", error: `turn exceeded ${Math.round(maxTurnMs / 1000)}s` }); }, maxTurnMs);
  bumpInactivity();

  const consume = (line) => {
    if (!line.trim()) return;
    frames++;
    let obj = null; try { obj = JSON.parse(line); } catch { return; }
    if (obj.session_id && !sessionId) sessionId = obj.session_id;
    if (obj.type === "result") finalObj = obj;
    try { onActivity?.(activityOf(obj)); } catch { /* observer must never break the turn */ }
  };

  child.on("error", (e) => finish({ ok: false, error: `spawn failed: ${e.code || e.message}` }));
  child.stdout.on("data", (d) => {
    buf += d; bumpInactivity();
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, idx); buf = buf.slice(idx + 1); consume(line); }
  });
  child.stderr.on("data", () => bumpInactivity());
  child.on("close", (code) => {
    if (buf.trim()) consume(buf.trim());
    if (finalObj) {
      const usage = finalObj.usage ? {
        input_tokens: finalObj.usage.input_tokens ?? finalObj.usage.inputTokens ?? null,
        output_tokens: finalObj.usage.output_tokens ?? finalObj.usage.outputTokens ?? null,
        cost_usd: finalObj.total_cost_usd ?? null,
      } : null;
      const text = typeof finalObj.result === "string" ? finalObj.result : JSON.stringify(finalObj.result || "").slice(0, 20000);
      finish({ ok: finalObj.is_error !== true && code === 0, text, is_error: Boolean(finalObj.is_error), error: finalObj.is_error ? (typeof finalObj.result === "string" ? finalObj.result : "provider error") : null, usage, session_id: finalObj.session_id || sessionId });
    } else {
      finish({ ok: false, error: `provider exited (code ${code}) before emitting a result frame`, code });
    }
  });
  child.stdin.on("error", () => {});
  try { child.stdin.write(message); child.stdin.end(); } catch { /* close handler reports the exit */ }

  return { pid: child.pid || null, kill: (sig = "SIGTERM") => { try { child.kill(sig); } catch {} }, done: doneP };
}

/** Operations not implemented as governed CLI capabilities (honest). */
export const UNSUPPORTED_OPS = {
  startSession: "Launching a fresh interactive editor session is done through alloy-sprint-start (Start Work), not the provider adapter.",
  stopSession: "Stopping a session is done through worker.pause / sprint.finish, not the provider adapter.",
  streamEvents: "Streaming (stream-json) is supported by both CLIs but not wired into the loopback UI yet.",
};
