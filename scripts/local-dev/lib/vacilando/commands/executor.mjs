/**
 * Vacilando Runtime — Command Executor (Slice 2).
 *
 * The single path from an operator intent to a toolkit effect. Lifecycle:
 *
 *   resolve → validate → (target) → evaluate eligibility → preview
 *          → confirm → execute → audit → refresh
 *
 * Safety invariants (all enforced here, not by convention):
 *   - the command key MUST be registered; unknown keys fail closed
 *   - input is validated against the command's schema; malformed fails closed
 *   - the executable is a FIXED basename from the registry, resolved to an
 *     absolute path under the toolkit; the request never supplies a path
 *   - argv is produced by the registry's buildArgv from VALIDATED input; no raw
 *     string from the request is ever executed
 *   - NO shell: execFile with an argument array (no interpolation, no `sh -c`)
 *   - consequential commands require explicit confirmation before execute
 *   - every execute (and every refusal/block) is audited
 */
import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getCommand, isUnsupported, validateInput } from "./registry.mjs";
import { writeAuditEvent } from "./audit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// lib/vacilando/commands → toolkit root is three levels up.
export const TOOLKIT_DIR = resolve(HERE, "..", "..", "..");

const EXEC_TIMEOUT_MS = 60000;
const MAX_BUFFER = 4 * 1024 * 1024;
const truncate = (s, n = 4000) => (typeof s === "string" && s.length > n ? s.slice(0, n) + "…[truncated]" : s || "");

function runCli(binPath, argv, cwd = TOOLKIT_DIR) {
  return new Promise((res) => {
    execFile(binPath, argv, { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_BUFFER, cwd, env: process.env, shell: false }, (err, stdout, stderr) => {
      res({ exit: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: stdout ?? "", stderr: stderr ?? "", timedOut: Boolean(err && err.killed) });
    });
  });
}

/**
 * Run a command through the lifecycle.
 *   req: { command, input, confirm, mode: "preview"|"execute", actor }
 *   ctx: { snapshot, refresh: async () => snapshot, nowMs }
 * Returns a structured result; never throws for control-flow (only truly
 * exceptional bugs would throw).
 */
export async function runCommand(req, ctx) {
  const nowMs = ctx.nowMs ?? Date.now();
  const actor = req.actor || "operator";
  const mode = req.mode === "execute" ? "execute" : "preview";
  const snapshot = ctx.snapshot || {};

  // 1. RESOLVE (fail closed on unknown / unsupported).
  const def = getCommand(req.command);
  if (!def) {
    const reason = isUnsupported(req.command);
    if (reason) return { ok: false, stage: "resolve", code: "unsupported", command: req.command, reason };
    return { ok: false, stage: "resolve", code: "unknown_command", command: req.command };
  }

  // 2. VALIDATE (fail closed on malformed payload / unexpected fields).
  const val = validateInput(def.input || {}, req.input);
  if (!val.ok) return { ok: false, stage: "validate", code: "invalid_input", command: def.key, errors: val.errors };
  const value = val.value;

  // 3. TARGET + 4. ELIGIBILITY.
  const target = def.resolveTarget ? def.resolveTarget(value, snapshot) : null;
  const elig = def.eligibility ? def.eligibility(target, snapshot, value) : { eligible: true };
  if (!elig.eligible) {
    writeAuditEvent({ actor, command: def.key, input: value, target, preview_summary: null, confirmed: req.confirm === true, outcome: "blocked", error: elig.reason }, nowMs);
    return { ok: false, stage: "eligibility", code: "ineligible", command: def.key, target, reason: elig.reason };
  }

  // 5. PREVIEW (pure; never executes).
  const preview = def.preview ? def.preview(value, target, snapshot) : { summary: def.title, effects: [] };
  const willRun = def.execution === "cli" ? { bin: def.bin, args: def.buildArgv(value, snapshot) } : { internal: true };

  if (mode === "preview") {
    return {
      ok: true, stage: "preview", command: def.key, title: def.title, risk: def.risk,
      requires_confirmation: def.confirmation === "required",
      target, preview, will_run: willRun, refresh: def.refresh || [],
    };
  }

  // 6. CONFIRM (policy gate; cannot be bypassed for consequential commands).
  if (def.confirmation === "required" && req.confirm !== true) {
    writeAuditEvent({ actor, command: def.key, input: value, target, preview_summary: preview.summary, confirmed: false, outcome: "refused", error: "confirmation_required" }, nowMs);
    return { ok: false, stage: "confirm", code: "confirmation_required", command: def.key, target, preview, will_run: willRun };
  }
  // 6b. TYPED CONFIRM (destructive commands require the operator to type an exact phrase).
  if (def.typedConfirm) {
    const need = def.typedConfirm(value);
    if (!req.confirm_text || req.confirm_text !== need) {
      writeAuditEvent({ actor, command: def.key, input: value, target, preview_summary: preview.summary, confirmed: false, outcome: "refused", error: "typed_confirmation_required" }, nowMs);
      return { ok: false, stage: "confirm", code: "typed_confirmation_required", command: def.key, target, preview, typed_confirm_phrase: need };
    }
  }

  // 7. EXECUTE — only through the registered adapter.
  let result;
  let ok;
  if (def.execution === "internal") {
    const data = def.run ? await def.run(value, snapshot, { nowMs }) : { done: true };
    result = { kind: "internal", data };
    ok = data && data.ok === false ? false : true;
  } else {
    // Fixed bin: either a toolkit command (resolved under TOOLKIT_DIR) or an
    // allowlisted system VCS binary (git/gh, resolved from PATH by execFile).
    const SYSTEM_BINS = new Set(["git", "gh"]);
    const binPath = SYSTEM_BINS.has(def.bin) ? def.bin : join(TOOLKIT_DIR, def.bin);
    if (!SYSTEM_BINS.has(def.bin) && (!existsSync(binPath) || !statSync(binPath).isFile())) {
      writeAuditEvent({ actor, command: def.key, input: value, target, preview_summary: preview.summary, confirmed: req.confirm === true, outcome: "failed", error: `binary_missing: ${def.bin}` }, nowMs);
      return { ok: false, stage: "execute", code: "binary_missing", command: def.key, bin: def.bin };
    }
    const argv = def.buildArgv(value, snapshot);
    // gh (unlike git) has no -C flag; a command may set its spawn cwd instead.
    const runCwd = def.cwd ? def.cwd(value, snapshot) : TOOLKIT_DIR;
    const r = await runCli(binPath, argv, runCwd || TOOLKIT_DIR);
    ok = r.exit === 0;
    result = { kind: "cli", bin: def.bin, args: argv, exit: r.exit, stdout: truncate(r.stdout), stderr: truncate(r.stderr), timed_out: r.timedOut };
  }

  // 8. REFRESH the canonical projection.
  const sources_refreshed = [];
  let snapshotAfter = null;
  if ((def.refresh || []).includes("snapshot") && ctx.refresh) {
    try { snapshotAfter = await ctx.refresh(); sources_refreshed.push("snapshot"); } catch { /* keep result */ }
  }

  // 9. AUDIT.
  const audit = writeAuditEvent({
    actor, command: def.key, input: value, target,
    preview_summary: preview.summary, confirmed: req.confirm === true,
    outcome: ok ? "succeeded" : "failed",
    exit: result.exit ?? null, error: ok ? null : (result.stderr || "non-zero exit"),
    sources_refreshed,
  }, nowMs);

  return {
    ok, stage: "execute", command: def.key, title: def.title, target,
    result, audit: { id: audit.id, occurred_at: audit.occurred_at, outcome: audit.outcome },
    sources_refreshed, snapshot: snapshotAfter,
  };
}
