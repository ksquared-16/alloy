/**
 * Vacilando — Command Budget & Forward-Progress runtime (Worker Operating Policy).
 *
 * The runtime enforcement behind the canonical Worker Operating Policy: it turns
 * "start a long command, poll it, end the turn on 'still running'" into a bounded
 * control loop. Every Vacilando-managed slot worker (Claude/Cursor, Director-started
 * or opened directly) is governed by this — the policy text is injected into the
 * worker's instructions and the mission TURN PROTOCOL from the SAME source below.
 *
 * Pure, deterministic classification (testable) + a governed runner (a real CLI a
 * worker uses instead of raw polling) + valid-turn-end enforcement. No provider
 * coupling — a command class is a command class regardless of who runs it.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The canonical policy TEXT — one source, read by the instructions generator and the mission runtime. */
export const WORKER_POLICY = (() => {
  try { return readFileSync(join(HERE, "worker-operating-policy.md"), "utf8").trim(); }
  catch { return "Worker Operating Policy: own forward progress; 'still running' is not a valid turn end; long commands have soft/hard budgets by class; at soft diagnose, at hard take corrective action; never hand background monitoring back to the operator."; }
})();

const S = 1000, M = 60 * 1000;

/**
 * Command classes and their budgets. Not one universal timeout — different work
 * has different honest envelopes. expected < soft < hard. `progress` names what
 * counts as forward movement for this class; `fallback` is the narrower path.
 */
export const COMMAND_CLASSES = {
  targeted_test:      { expected_ms: 20 * S, soft_ms: 1 * M, hard_ms: 3 * M, progress: "new test output / a test passing or failing", fallback: "run a single test file or case", escalation: "isolate the failing test" },
  full_test_suite:    { expected_ms: 90 * S, soft_ms: 3 * M, hard_ms: 8 * M, progress: "suites/files completing in the reporter", fallback: "run the targeted suite for the changed area", escalation: "bisect to the slow/failing suite" },
  typecheck:          { expected_ms: 60 * S, soft_ms: 2 * M, hard_ms: 6 * M, progress: "files/projects checked; error count changing", fallback: "typecheck the changed package/graph only", escalation: "isolate to a package or tsconfig problem" },
  build:              { expected_ms: 90 * S, soft_ms: 3 * M, hard_ms: 10 * M, progress: "build steps/chunks completing", fallback: "build the affected target only", escalation: "identify the slow/failing build step" },
  dep_install:        { expected_ms: 60 * S, soft_ms: 3 * M, hard_ms: 10 * M, progress: "packages resolving/downloading", fallback: "install offline / from cache", escalation: "identify the network or registry problem" },
  dev_server_start:   { expected_ms: 10 * S, soft_ms: 30 * S, hard_ms: 90 * S, progress: "the server reporting a listening port / ready", fallback: "check logs for a bind/compile error", escalation: "port conflict or a startup error" },
  migration:          { expected_ms: 20 * S, soft_ms: 1 * M, hard_ms: 5 * M, progress: "statements/migrations applying", fallback: "run the single pending migration", escalation: "a DB lock or a broken migration" },
  browser_validation: { expected_ms: 30 * S, soft_ms: 2 * M, hard_ms: 6 * M, progress: "navigation/assertions advancing; screenshots captured", fallback: "a targeted page check", escalation: "a stuck route compile or auth problem" },
  default:            { expected_ms: 30 * S, soft_ms: 2 * M, hard_ms: 6 * M, progress: "new output", fallback: "a narrower command", escalation: "diagnose the stall" },
};

// Class-name aliases. The policy prose writes classes hyphenated ("targeted-test",
// "full-suite"); the keys are underscored. A worker types the name it read, so resolve
// tolerantly — otherwise the advertised per-class budget silently degrades to default.
const CLASS_ALIASES = { full_suite: "full_test_suite", test: "targeted_test", tests: "targeted_test", dev_server: "dev_server_start", devserver: "dev_server_start", browser: "browser_validation", install: "dep_install" };
export function budgetFor(cls) {
  if (COMMAND_CLASSES[cls]) return COMMAND_CLASSES[cls];
  const norm = String(cls || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return COMMAND_CLASSES[norm] || COMMAND_CLASSES[CLASS_ALIASES[norm]] || COMMAND_CLASSES.default;
}

/**
 * Classify a command's live state from evidence — never from a PID or elapsed time
 * alone. `lastProgressAt` is when new evidence (output/substep) last appeared.
 */
export function classifyCommandState({ exited = false, exitCode = null, blocker = null, startedAt, now = null, lastProgressAt = null, soft_ms }) {
  if (exited) return exitCode === 0 ? "complete" : "failed";
  if (blocker) return "blocked";
  const t = now ?? startedAt;
  const sinceProgress = t - (lastProgressAt ?? startedAt);
  // Alive but no new evidence past the soft budget → stalled; otherwise progressing.
  return sinceProgress >= (soft_ms ?? budgetFor("default").soft_ms) ? "stalled" : "progressing";
}

/**
 * Assess a running command against its budget → the phase and the required directive.
 * This is what turns polling into a control loop: continue (real progress),
 * diagnose (soft exceeded), or take corrective action (hard exceeded).
 */
export function assessCommand({ cls, budget = null, startedAt, now, lastProgressAt = null, exited = false, exitCode = null, blocker = null }) {
  const b = budget || budgetFor(cls);
  const state = classifyCommandState({ exited, exitCode, blocker, startedAt, now, lastProgressAt, soft_ms: b.soft_ms });
  const elapsed = now - startedAt;
  if (state === "complete" || state === "failed" || state === "blocked") return { state, phase: "resolved", directive: state === "complete" ? "done" : state === "failed" ? "recover" : "escalate", reason: `command ${state}` };
  const phase = elapsed >= b.hard_ms ? "hard_exceeded" : elapsed >= b.soft_ms ? "soft_exceeded" : "within_budget";
  let directive;
  if (phase === "within_budget") directive = "continue";
  else if (phase === "soft_exceeded") directive = state === "stalled" ? "diagnose" : "continue_with_parallel_work";
  else directive = "corrective_action"; // hard_exceeded: terminate / narrow / replace / escalate — never keep waiting
  return { state, phase, directive, elapsed_ms: elapsed, soft_ms: b.soft_ms, hard_ms: b.hard_ms, fallback: b.fallback, escalation: b.escalation,
    reason: phase === "hard_exceeded" ? `past hard budget (${Math.round(b.hard_ms / S)}s); stop waiting and ${state === "stalled" ? "take corrective action" : "explain with evidence + set a bounded plan"}`
      : phase === "soft_exceeded" ? (state === "stalled" ? `no progress past soft budget (${Math.round(b.soft_ms / S)}s) — diagnose the stall` : `over soft budget but progressing — continue and do useful parallel work`)
      : `within budget — progressing` };
}

// ---- Valid turn-end enforcement --------------------------------------------

/** The ONLY states a worker turn may end in. */
export const VALID_TURN_ENDS = new Set(["complete", "needs_operator", "blocked", "failed", "paused"]);
// Explicitly-forbidden non-terminal "ends" — passive waiting handed back to the operator.
const FORBIDDEN_TURN_ENDS = new Set(["running", "still_running", "progressing", "waiting_for_command", "waiting_for_typecheck", "waiting_for_tests", "waiting_for_server", "monitoring", "no_errors_so_far", "will_notify", "status_unchanged", "stalled"]);

/** Whether a proposed turn-end is legitimate. A running/monitoring state is not. */
export function isValidTurnEnd(endState) {
  return VALID_TURN_ENDS.has(String(endState || "").toLowerCase());
}
/** Explain why a turn-end is rejected (for the runtime + tests). */
export function turnEndViolation(endState) {
  const s = String(endState || "").toLowerCase();
  if (isValidTurnEnd(s)) return null;
  const known = FORBIDDEN_TURN_ENDS.has(s);
  return { ok: false, endState: s, known, message: `"${endState}" is not a valid turn end. A worker owns forward progress: end only on complete / needs_operator / blocked / failed / paused — never because a command is still running.` };
}

// ---- Natural-language turn-end guard (the direct-worker seam) ----------------
// The turn-end *validator* above takes an explicit state; a directly-opened Claude
// never emits one — it just writes a final message. These recognize the FORBIDDEN
// turn-ends in prose so a Stop-hook guard can refuse the false terminal state. Same
// vocabulary as FORBIDDEN_TURN_ENDS, applied to natural language.

/** Prose that means "I'm handing background monitoring back to you." */
const PASSIVE_WAIT_PATTERNS = [
  /\bstill\s+running\b/i,
  /\b(currently|still)\s+(monitoring|watching|waiting)\b/i,
  /\bi'?ll\s+(let\s+you\s+know|notify\s+you|update\s+you|report\s+back|check\s+(back|again|on\s+it))\b/i,
  /\bkeep(ing)?\s+(you\s+)?(posted|updated)\b/i,
  /\bno\s+errors\s+so\s+far\b/i,
  /\bwaiting\s+(for|on)\s+(the\s+)?(typecheck|tests?|build|server|command|it|migration)\b/i,
  /\b(once|when|after)\s+it\s+(finishes|completes|is\s+done)\b[^.!?]*\bi'?ll\b/i,
  /\b(it'?s|its|command\s+is|test[s]?\s+(are|is)|build\s+is)\s+(still\s+)?(grinding|chugging|churning|going)\b/i,
  /\blet\s+it\s+(run|finish|cook|keep\s+going)\b/i,
  /\brunning\s+in\s+the\s+background\b[^.!?]*\b(finish|complete|done|notify|let\s+you|when)\b/i,
  /\bstatus\s+unchanged\b/i,
];
/** Evidence the worker actually resolved (took action / diagnosed / hit a real terminal). Suppresses a false positive. */
const RESOLUTION_SIGNALS = [
  /\b(terminated|killed|sigterm|sigkill|aborted)\b/i,
  /\bdiagnos(ed|is|ing)\b/i,
  /\b(isolat(ed|ing)|narrowed|bisect(ed|ing))\b/i,
  /\bblocked\s+on\b/i,
  /\bneeds?\s+(your|operator|an?\s)/i,
  /\b(the\s+\w+\s+)?failed\b/i,
  /\b(it|the\s+\w+|suite|run|typecheck|build|tests?)\s+(completed|passed|finished\s+(in|with)|is\s+green)\b/i,
  /\bi\s+(ran|reran|replaced|switched|verified|terminated|isolated|narrowed)\b/i,
  /\bcorrective\s+action\b/i,
];

/**
 * Does a worker's END-OF-TURN message hand passive monitoring back to the operator?
 * Conservative: a message that also shows resolution (diagnosis / corrective action /
 * a concrete blocker / actual completion) is NOT flagged, to avoid false positives.
 */
/** Strip quoted spans so a worker *quoting/discussing* the policy ("still running") isn't
 *  mistaken for a live status report. Detection runs on the de-quoted prose. */
function stripQuotedSpans(s) {
  return String(s)
    .replace(/`[^`]*`/g, " ")       // inline code / backticks
    .replace(/"[^"]*"/g, " ")       // straight double quotes
    .replace(/[“][^”]*[”]/g, " ") // curly double quotes
    .replace(/'[^']*'/g, " ");      // straight single quotes
}

export function classifyPassiveWaitEnding(text) {
  const s = String(text || "");
  if (!s.trim()) return { passive: false, matched: null, softened_by_resolution: false };
  const prose = stripQuotedSpans(s);           // ignore quoted mentions of the forbidden phrasing
  const hit = PASSIVE_WAIT_PATTERNS.find((re) => re.test(prose));
  if (!hit) return { passive: false, matched: null, softened_by_resolution: false };
  const resolved = RESOLUTION_SIGNALS.some((re) => re.test(s));
  return { passive: !resolved, matched: resolved ? null : (prose.match(hit)?.[0]?.trim() || null), softened_by_resolution: resolved };
}

/**
 * The Stop-hook decision. Given the worker's last message and whether a Stop guard is
 * already active (Claude Code's `stop_hook_active` — the infinite-loop backstop), decide
 * whether to BLOCK the turn-end and force forward progress. Fires at most once per stuck
 * turn: if the guard is already active we allow the stop, so it corrects rather than loops.
 */
export function buildStopDecision({ lastAssistantText = "", stopHookActive = false } = {}) {
  if (stopHookActive) return { block: false, reason: null, note: "guard already active — allowing stop to avoid a loop" };
  const c = classifyPassiveWaitEnding(lastAssistantText);
  if (!c.passive) return { block: false, reason: null };
  return {
    block: true,
    matched: c.matched,
    reason:
      `Worker Operating Policy: "still running" is not a valid state to end a turn on` +
      (c.matched ? ` (detected: "${c.matched}")` : "") +
      `. You own forward progress. Do not hand background monitoring back to the operator. ` +
      `Establish whether the command is actually progressing (new output) or stalled; at the soft budget diagnose, at the hard budget take bounded corrective action ` +
      `(terminate/narrow/replace, or run it through \`node scripts/local-dev/lib/vacilando/command-budget.mjs run <class> -- <command>\`, which never returns "still running"). ` +
      `End this turn only in a valid terminal state: complete, needs_operator, blocked, or failed.`,
  };
}

/**
 * Build the SessionStart `additionalContext` that auto-delivers a managed slot's
 * instructions (which include the Worker Operating Policy) to a freshly-opened worker.
 * Returns null when there is nothing to deliver (so the hook stays silent).
 */
export function buildSessionStartContext(instructionsText) {
  const c = String(instructionsText || "").trim();
  if (!c) return null;
  return (
    "# Managed-slot operating instructions (auto-delivered at session start)\n\n" +
    "These are YOUR operating instructions for this Vacilando-managed slot — they govern how you work, " +
    "including the Worker Operating Policy on long-running commands. Read and follow them.\n\n" +
    c
  );
}

/**
 * The GOVERNED RUNNER — the concrete enforcement a worker uses instead of raw
 * polling. Runs a command with its class budget, tracks real progress (stdout/stderr
 * growth), and NEVER returns "still running": at the hard budget it terminates a
 * stalled command and returns a diagnosed result. `onEvent` surfaces meaningful
 * state transitions only (not play-by-play).
 */
export function runGoverned({ command, args = [], cls = "default", cwd = null, budget = null, nowFn = () => Date.now(), onEvent = () => {} }) {
  const b = budget || budgetFor(cls);
  const startedAt = nowFn();
  let lastProgressAt = startedAt, out = "", err = "", softFired = false, killed = null, exited = false, exitCode = null;

  return new Promise((resolve) => {
    let child;
    try { child = spawn(command, args, { cwd: cwd || undefined, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { return resolve({ state: "failed", cls, elapsed_ms: 0, exitCode: null, error: `spawn failed: ${e.code || e.message}`, output: "" }); }

    const bump = () => { lastProgressAt = nowFn(); };
    child.stdout?.on("data", (d) => { out += d; bump(); });
    child.stderr?.on("data", (d) => { err += d; bump(); });

    const softT = setTimeout(() => {
      softFired = true;
      const a = assessCommand({ cls, budget: b, startedAt, now: nowFn(), lastProgressAt });
      onEvent({ at: "soft", ...a }); // diagnose or continue-with-parallel — the worker acts, does not just wait
    }, b.soft_ms);

    const hardT = setTimeout(() => {
      // Hard budget: passive waiting stops. Terminate a still-running command and
      // return a diagnosed, actionable result — the turn cannot end on "running".
      const a = assessCommand({ cls, budget: b, startedAt, now: nowFn(), lastProgressAt });
      killed = a.state; // "stalled" or "progressing" (ran long)
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 2000);
      onEvent({ at: "hard", ...a });
    }, b.hard_ms);

    const finish = (result) => { clearTimeout(softT); clearTimeout(hardT); resolve(result); };

    child.on("error", (e) => finish({ state: "failed", cls, elapsed_ms: nowFn() - startedAt, exitCode: null, error: `spawn failed: ${e.code || e.message}`, output: (out + err).slice(-4000) }));
    child.on("close", (code) => {
      exited = true; exitCode = code;
      const elapsed = nowFn() - startedAt;
      // If we killed it at the hard budget, report the diagnosed stall/overrun — never "running".
      const state = killed ? (killed === "stalled" ? "stalled" : "failed") : (code === 0 ? "complete" : "failed");
      finish({
        state, cls, elapsed_ms: elapsed, exitCode: code, killed_at_hard: !!killed,
        soft_exceeded: softFired, hard_ms: b.hard_ms, soft_ms: b.soft_ms,
        directive: state === "complete" ? "done" : killed ? "corrective_action" : "recover",
        fallback: b.fallback, escalation: b.escalation,
        summary: state === "complete" ? `completed in ${Math.round(elapsed / S)}s`
          : killed ? `terminated at the hard budget (${Math.round(b.hard_ms / S)}s) — ${killed}; fallback: ${b.fallback}`
          : `failed (exit ${code})`,
        output: (out + err).slice(-4000),
      });
    });
  });
}

/** Last assistant text message in a Claude Code transcript JSONL (for the Stop guard). */
function lastAssistantTextFromTranscript(transcriptPath) {
  let raw;
  try { raw = readFileSync(transcriptPath, "utf8"); } catch { return ""; }
  const lines = raw.split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let ev; try { ev = JSON.parse(lines[i]); } catch { continue; }
    const msg = ev && (ev.message || ev);
    if (!msg || msg.role !== "assistant") continue;
    const content = msg.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const text = content.filter((p) => p && p.type === "text").map((p) => p.text).join("\n").trim();
      if (text) return text;
    }
  }
  return "";
}

// ---- CLI ---------------------------------------------------------------------
// `run <class> -- <cmd...>`  — governed runner (hard seam; never returns "still running")
// `policy`                   — print the canonical Worker Operating Policy
// `session-start <file>`     — SessionStart hook: auto-deliver slot instructions (incl. policy)
// `stop-guard`               — Stop hook: refuse a passive-wait turn-end (reads hook JSON on stdin)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [sub, cls, sep, ...rest] = process.argv.slice(2);
  if (sub === "policy") { process.stdout.write(WORKER_POLICY + "\n"); process.exit(0); }

  if (sub === "session-start") {
    // Emit the slot instructions as SessionStart additionalContext. Silent (exit 0) if absent.
    const file = cls || process.env.ALLOY_AGENT_INSTRUCTIONS_FILE || "";
    let text = ""; try { text = readFileSync(file, "utf8"); } catch { process.exit(0); }
    const ctx = buildSessionStartContext(text);
    if (!ctx) process.exit(0);
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx } }));
    process.exit(0);
  }

  if (sub === "stop-guard") {
    // Read Claude Code's Stop hook payload on stdin; block a passive-wait turn-end.
    let input = ""; try { input = readFileSync(0, "utf8"); } catch {}
    let payload = {}; try { payload = JSON.parse(input || "{}"); } catch {}
    const text = payload.transcript_path ? lastAssistantTextFromTranscript(payload.transcript_path) : "";
    const decision = buildStopDecision({ lastAssistantText: text, stopHookActive: !!payload.stop_hook_active });
    if (decision.block) process.stdout.write(JSON.stringify({ decision: "block", reason: decision.reason }));
    // else: emit nothing → allow the stop.
    process.exit(0);
  }

  if (sub !== "run" || sep !== "--" || rest.length === 0) {
    process.stderr.write("usage: command-budget.mjs run <class> -- <command...>   |   policy   |   session-start <file>   |   stop-guard\n");
    process.stderr.write("classes: " + Object.keys(COMMAND_CLASSES).join(", ") + "\n");
    process.exit(2);
  }
  runGoverned({ command: rest[0], args: rest.slice(1), cls, onEvent: (e) => process.stderr.write(`[budget:${e.at}] ${e.reason}\n`) })
    .then((r) => {
      process.stderr.write(`[budget:end] state=${r.state} · ${r.summary}\n`);
      if (r.output) process.stdout.write(r.output.endsWith("\n") ? r.output : r.output + "\n");
      // Exit non-zero on anything that isn't a clean completion, so callers can't treat a stall as success.
      process.exit(r.state === "complete" ? 0 : 1);
    });
}
