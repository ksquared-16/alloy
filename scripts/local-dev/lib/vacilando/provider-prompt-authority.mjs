/**
 * Provider-native permission prompts, decided by Vacilando.
 *
 * THE DEFECT. A managed Trust Runtime session sat blocked on Claude Code's own
 * auto-mode classifier asking "Do you want to proceed?" for
 * `ls ~/.local/share/alloy/toolkit/<sha>/` — a read-only listing of the very
 * toolkit path Vacilando's own run instruction tells that agent to invoke.
 * Vacilando saw the block, failed the run with
 * `undelivered_provider_prompt_block`, created NO decision record, and told the
 * operator to go and type into tmux.
 *
 * WHY THAT IS WRONG IN PRINCIPLE. Vacilando already owns lane authority,
 * Director policy, governed actions, operator approval and exact execution
 * authorization. A provider's native confirmation is a SECOND governance system
 * layered on top, and where the two disagree the provider's wins by default —
 * because it holds the keyboard. That inverts the model. A provider prompt is
 * an execution-adapter concern.
 *
 * WHAT THIS MODULE IS. Pure classification and authority resolution. It decides
 * WHAT a prompt is asking and WHETHER Vacilando has already authorized it. It
 * sends nothing; the adapter is the only thing that touches a session.
 *
 * FAIL CLOSED. The allowlist is the whole safety property. Anything not
 * positively recognised is `unsafe_or_unknown_provider_prompt` and is never
 * auto-answered — surfaced in Vacilando, but never answered on a guess.
 */
import { createHash } from "node:crypto";

export const PROVIDER_PROMPT_SCHEMA = "vacilando.provider_prompt.v1";

/**
 * The four things a provider prompt can be. Collapsing these into
 * `needs_operator_input` is what produced "go to the terminal" for an `ls`.
 */
export const PROMPT_CLASSES = Object.freeze([
  "routine_tool_permission",
  "governed_operator_decision",
  "unsafe_or_unknown_provider_prompt",
  "informational_input",
]);

/**
 * Commands Vacilando considers routine for a managed session: read-only, and
 * incapable of changing repository, host or provider state.
 *
 * ANCHORED AT THE START OF THE COMMAND. A substring match would accept
 * `rm -rf / && ls`, which is the entire risk of doing this at all.
 */
export const ROUTINE_READ_COMMANDS = Object.freeze([
  /^ls(\s|$)/, /^cat(\s|$)/, /^head(\s|$)/, /^tail(\s|$)/, /^wc(\s|$)/, /^file(\s|$)/,
  /^stat(\s|$)/, /^readlink(\s|$)/, /^basename(\s|$)/, /^dirname(\s|$)/, /^pwd(\s|$)/,
  /^grep(\s|$)/, /^rg(\s|$)/, /^find(\s|$)/, /^which(\s|$)/, /^echo(\s|$)/,
  /^git\s+(status|log|diff|show|rev-parse|branch|worktree\s+list|remote|for-each-ref|ls-remote|merge-base|cat-file|rev-list)(\s|$)/,
  /^node\s+--check(\s|$)/,
]);

/**
 * Shell constructs that make a command line more than the command it appears to
 * be. Any of these forces the prompt out of the routine class, whatever the
 * leading verb looks like.
 */
export const COMPOSITION_MARKERS = Object.freeze([
  /[;&|]/, /\$\(/, /`/, />>?/, /<{1,2}/, /\bsudo\b/, /\brm\b/, /\bmv\b/, /\bchmod\b/, /\bchown\b/,
  /\bkill\b/, /\bcurl\b/, /\bwget\b/, /\bssh\b/, /\bdocker\b/, /\bsupabase\b/, /\bnpm\s+(i|install|publish)\b/,
]);

/**
 * Paths a managed session is EXPECTED to read, because Vacilando's own run
 * instruction hands them out. This is the positive authority that makes the
 * Trust Runtime case routine rather than merely harmless.
 */
export const INSTRUCTED_PATH_PREFIXES = Object.freeze([
  "/Users/Kelly/.local/share/alloy/toolkit/",
  "/Users/Kelly/Code/alloy-worktrees/",
  "/Users/Kelly/Alloy/",
  "/Users/Kelly/.local/state/alloy-dev/",
]);

/** Capabilities that are always an operator decision, never adapter business. */
export const OPERATOR_CAPABILITIES = Object.freeze([
  "repository.push", "repository.merge_pull_request", "repository.delete_remote_branch",
  "database.apply_migration", "database.write", "credential.read", "provider.terminate",
  "worktree.remove", "docker.control",
]);

/**
 * A stable identity for one prompt.
 *
 * Bound to session, run and the prompt's own text so an answer minted for one
 * prompt can never satisfy a later, different one. The requested command is
 * included because the same question text ("Do you want to proceed?") is asked
 * about entirely different actions.
 */
export function promptFingerprint({ sessionId = null, runId = null, promptText = null, requestedCommand = null } = {}) {
  return createHash("sha256").update(JSON.stringify({
    schema: PROVIDER_PROMPT_SCHEMA,
    session: sessionId || null,
    run: runId || null,
    prompt: normalizeText(promptText),
    command: normalizeText(requestedCommand),
  })).digest("hex").slice(0, 32);
}

function normalizeText(t) {
  return String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 400) || null;
}

/**
 * Pull the requested action out of a Claude Code permission modal.
 *
 * The modal shows a tool header ("Bash command") then the command, then a
 * human description. Returning null when the shape is not recognised is the
 * point: an unparsed prompt must not be classifiable as routine.
 */
export function parseRequestedAction(paneText) {
  const text = String(paneText || "");
  const bash = text.match(/^[│|\s]*Bash command\s*\n+([\s\S]{0,400}?)\n\s*\n/m)
    || text.match(/^[│|\s]*Bash command\s*\n+\s*(.+)$/m);
  if (bash) {
    const lines = String(bash[1]).split("\n").map((l) => l.replace(/^[│|>\s]+/, "").trim()).filter(Boolean);
    if (lines.length) return { tool: "bash", command: lines[0], description: lines[1] || null };
  }
  const readTool = text.match(/^[│|\s]*(Read|Edit|Write|Glob|Grep)\s+(?:file|tool)?\s*\n+\s*(.+)$/m);
  if (readTool) return { tool: String(readTool[1]).toLowerCase(), command: String(readTool[2]).trim(), description: null };
  return null;
}

/** Every absolute path mentioned in a command. */
export function pathsIn(command) {
  return String(command || "").match(/\/[^\s"'`;|&)]+/g) || [];
}

function isInstructedPath(p) {
  return INSTRUCTED_PATH_PREFIXES.some((prefix) => String(p).startsWith(prefix));
}

/**
 * Classify one provider prompt against Vacilando's own authority.
 *
 * `authorizedCapabilities` is what the lane/Director already permits. It is
 * consulted for the governed case; the routine case does not rely on it,
 * because a read-only listing of an instructed path is authorized by the
 * instruction itself.
 */
export function classifyProviderPrompt({
  paneText = null,
  promptText = null,
  sessionId = null,
  runId = null,
  authorizedCapabilities = [],
} = {}) {
  const base = {
    schema_version: PROVIDER_PROMPT_SCHEMA,
    session_id: sessionId || null,
    run_id: runId || null,
    prompt_text: normalizeText(promptText || extractPromptQuestion(paneText)),
  };

  const action = parseRequestedAction(paneText);
  base.requested = action;
  base.fingerprint = promptFingerprint({
    sessionId, runId, promptText: base.prompt_text, requestedCommand: action?.command ?? null,
  });

  if (!action || !action.command) {
    return { ...base, classification: "unsafe_or_unknown_provider_prompt", auto_answerable: false,
      reason: "Vacilando could not determine what the provider is asking permission for" };
  }

  const command = String(action.command).trim();

  // Composition first: a compound line is not the command it looks like.
  const composed = COMPOSITION_MARKERS.find((re) => re.test(command));
  if (composed) {
    return { ...base, classification: "unsafe_or_unknown_provider_prompt", auto_answerable: false,
      reason: `the command contains shell composition or a mutating verb (${composed.source}); it is not a plain read` };
  }

  // A capability that is always the operator's, whatever it looks like.
  const cap = OPERATOR_CAPABILITIES.find((c) => command.includes(c.replace(/\./g, " ")) || commandImpliesCapability(command, c));
  if (cap) {
    const authorized = (authorizedCapabilities || []).includes(cap);
    return { ...base, classification: "governed_operator_decision", auto_answerable: false,
      requested_capability: cap, already_authorized: authorized,
      reason: authorized
        ? `${cap} is authorized for this lane but still requires a governed answer, not an adapter guess`
        : `${cap} is outside this lane's delegated authority` };
  }

  const routine = ROUTINE_READ_COMMANDS.some((re) => re.test(command));
  if (!routine) {
    return { ...base, classification: "unsafe_or_unknown_provider_prompt", auto_answerable: false,
      reason: "the command is not on the routine read-only allowlist" };
  }

  // A read is routine only where Vacilando actually sent the agent.
  const paths = pathsIn(command);
  const outside = paths.filter((p) => !isInstructedPath(p));
  if (paths.length && outside.length) {
    return { ...base, classification: "unsafe_or_unknown_provider_prompt", auto_answerable: false,
      reason: `reads a path Vacilando did not instruct: ${outside[0]}` };
  }

  return {
    ...base,
    classification: "routine_tool_permission",
    auto_answerable: true,
    authority: paths.length
      ? "lane execution policy — read-only access to an instructed Vacilando path"
      : "lane execution policy — read-only command",
    reason: `${command.split(/\s+/)[0]} is read-only and every path it names is one Vacilando instructed this session to use`,
  };
}

function commandImpliesCapability(command, cap) {
  const c = String(command);
  if (cap === "repository.push") return /\bgit\s+push\b/.test(c);
  if (cap === "repository.merge_pull_request") return /\bgh\s+pr\s+merge\b|\bgit\s+merge\b/.test(c);
  if (cap === "repository.delete_remote_branch") return /push\s+--delete|branch\s+-D\b/.test(c);
  if (cap === "database.apply_migration") return /\bsupabase\b.*\bmigration\b|\bpsql\b/.test(c);
  if (cap === "worktree.remove") return /worktree\s+remove/.test(c);
  if (cap === "docker.control") return /\bdocker\b/.test(c);
  if (cap === "provider.terminate") return /\bkill\b|\bpkill\b/.test(c);
  return false;
}

/** The question line the provider is waiting on. */
export function extractPromptQuestion(paneText) {
  const m = String(paneText || "").match(/^[│|\s]*(Do you want to .+?|Would you like .+?|Continue\?.*)$/m);
  return m ? m[1].trim() : null;
}

/**
 * Which option to select for an affirmative answer.
 *
 * Deliberately the NARROWEST yes. Claude's modals commonly offer "Yes" and
 * "Yes, and don't ask again for this project" — taking the broad one would
 * silently widen the session's standing permissions far beyond the single
 * action Vacilando actually authorized.
 */
export function affirmativeOption(paneText) {
  const lines = String(paneText || "").split("\n");
  for (const line of lines) {
    const m = line.match(/^[│|\s❯>]*\s*(\d+)\.\s*(.+)$/);
    if (!m) continue;
    const label = m[2].trim();
    if (/^yes$/i.test(label) || /^yes[,.]?\s*(proceed|continue)?$/i.test(label)) {
      return { option: Number(m[1]), label, widens_permissions: false };
    }
  }
  return null;
}

/**
 * Which option DECLINES, for a prompt whose work is being done elsewhere.
 *
 * Escape is the wrong instrument here. `prompt-block-dismiss` deliberately
 * refuses to escape a `permission` modal — "those ask a real question, and
 * dismissing one is answering it" — and that is right: an escaped permission
 * prompt leaves the turn ambiguous, and the provider may simply ask again.
 *
 * "No" is not a dismissal. It is the correct NARROW answer when Vacilando has
 * decided that this provider must not run this command — either because a
 * trusted executor already performed the action, or because the operator denied
 * it. It closes the question definitely, in the provider's own vocabulary, and
 * it grants nothing.
 */
export function declineOption(paneText) {
  const lines = String(paneText || "").split("\n");
  for (const line of lines) {
    const m = line.match(/^[│|\s❯>]*\s*(\d+)\.\s*(.+)$/);
    if (!m) continue;
    const label = m[2].trim();
    if (/^no$/i.test(label) || /^no[,.]?\s*(thanks|cancel|stop)?$/i.test(label)
      || /^(cancel|decline|don'?t\s+(run|proceed))\b/i.test(label)) {
      return { option: Number(m[1]), label, grants_permission: false };
    }
  }
  return null;
}

/** A decision is only usable against the exact prompt it was minted for. */
export function answerMatchesPrompt(decision, fresh) {
  if (!decision || !fresh) return false;
  if (decision.fingerprint !== fresh.fingerprint) return false;
  if (decision.session_id !== fresh.session_id) return false;
  if (decision.run_id !== fresh.run_id) return false;
  return true;
}
