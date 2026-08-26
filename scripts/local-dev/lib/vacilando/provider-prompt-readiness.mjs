/**
 * Provider prompt readiness — is this pane actually at an actionable prompt?
 *
 * WHY THIS EXISTS. On 2026-08-22 Vacilando pasted an approved instruction into
 * Claude pane %13 while that pane was sitting on the "Teach auto mode about your
 * environment?" onboarding screen. tmux `paste-buffer` + `Enter` both succeeded,
 * so delivery was acknowledged, the run went EXECUTING, and the PREVIOUS turn's
 * completion output — still on screen — was read as this run finishing. An
 * instruction that was never seen by any agent was reported delivered and then
 * reported complete.
 *
 * THE LAW THIS ENCODES. A successful tmux paste is proof that keystrokes were
 * accepted by a terminal. It is NOT proof that an agent read an instruction.
 * Delivery may only be acknowledged when, immediately before the paste, the
 * pane showed an actionable provider prompt and showed no modal screen
 * (onboarding, permission, setup/theme selection, trust, update, login, resume
 * picker, or any other selection dialog).
 *
 * WHAT THIS IS. A bounded, anchored read of pane text captured immediately
 * before delivery. It is not a TUI parser. It answers exactly one question —
 * may we paste right now — and it fails closed: a screen we can read but cannot
 * recognise as a prompt is NOT ready.
 *
 * WHAT THIS IS NOT. It never decides run state from text, never classifies
 * abandonment, and never completes anything. Compare provider-health.mjs, which
 * reads the same text for an operator banner. This module refuses a send; that
 * one shows a notice.
 */

export const PROMPT_NOT_READY_ERROR = "provider_prompt_not_ready";

export const PROMPT_BLOCKER_KINDS = Object.freeze([
  "onboarding",
  "permission",
  "setup",
  "selection",
  "trust",
  "update",
  "login",
  "resume_picker",
  "error_modal",
]);

/** Readiness states. Only "ready" may be pasted into. */
export const PROMPT_READINESS_STATES = Object.freeze([
  "ready",
  "blocked",
  "busy",
  "unknown",
  "capture_unavailable",
]);

/**
 * Anchored modal signatures. Deliberately narrow: a near-miss must produce
 * nothing rather than a wrong kind. Ordered most-specific first.
 */
const BLOCKER_SIGNATURES = Object.freeze([
  {
    kind: "onboarding",
    provider: "claude",
    patterns: [
      /teach auto mode about your environment\?/i,
      /let['’]s get started[^\n]{0,40}claude code/i,
      /choose the text style that looks best/i,
      /welcome to claude code!?/i,
      /you can change this (later )?in\s*\/config/i,
      /press enter to continue[^\n]{0,40}(setup|onboarding)/i,
    ],
  },
  {
    kind: "trust",
    provider: null,
    patterns: [
      /do you trust the files in this folder\?/i,
      /trust the authors of the files in this (folder|workspace)\?/i,
    ],
  },
  {
    kind: "permission",
    provider: null,
    patterns: [
      /do you want to (allow|proceed|make this edit|create|run)\b[^\n]{0,80}\?/i,
      /\b1\.\s*yes\b[^\n]{0,60}\n[^\n]{0,80}\b2\.\s*(yes, and|no,)/i,
      /claude (code )?(needs|requests) (your )?permission to/i,
      /allow .{0,40} to (run|edit|write|read)[^\n]{0,40}\?/i,
      /grant (access|permission) to/i,
    ],
  },
  {
    kind: "login",
    provider: null,
    patterns: [
      /select login method/i,
      /paste (the )?(code|token) here/i,
      /log in with your (anthropic|claude|cursor) account/i,
      /sign in to continue/i,
      /\/login\s*(to|and) (log ?in|authenticate|continue)/i,
    ],
  },
  {
    kind: "update",
    provider: null,
    patterns: [
      /a new version (is available|of claude code is required)/i,
      /restart (claude code|cursor[- ]agent) to (apply|finish) the update/i,
      /installing update[^\n]{0,40}(please wait|do not)/i,
      /press enter to (update|upgrade)/i,
    ],
  },
  {
    kind: "resume_picker",
    provider: null,
    patterns: [
      /select a (conversation|session) to resume/i,
      /resume a previous conversation/i,
      /which (conversation|session) would you like to (resume|continue)\?/i,
    ],
  },
  {
    kind: "setup",
    provider: null,
    patterns: [
      /run\s*\/(init|terminal-setup)\s*to (finish|complete)/i,
      /finish setting up[^\n]{0,40}before/i,
      /configure your (workspace|environment) to continue/i,
    ],
  },
  {
    kind: "selection",
    provider: null,
    patterns: [
      // A cursor-marked numbered menu awaiting a choice. Anchored on the
      // selection caret so ordinary numbered prose never matches.
      /(^|\n)\s*[❯>▶]\s*\d+\.\s+\S[^\n]{0,80}(\n\s*\d+\.\s+\S)/,
      /use (the )?(arrow keys|↑\/↓)[^\n]{0,40}(to )?(select|choose)/i,
      /\(y\/n\)\s*$/i,
      /\[y\/n\]\s*$/i,
    ],
  },
  {
    kind: "error_modal",
    provider: null,
    patterns: [
      /press (enter|any key) to (dismiss|continue)/i,
      /an? (unexpected |fatal )?error occurred[^\n]{0,60}(press|restart)/i,
    ],
  },
]);

/**
 * Positive evidence that the pane is at an actionable, empty-ish input prompt.
 * The Claude Code and cursor-agent TUIs both draw a bordered composer with a
 * "> " caret plus a footer hint; either half is accepted, both are anchored to
 * the tail so scrollback cannot supply them.
 */
const PROMPT_AFFORDANCES = Object.freeze([
  // The composer caret. Claude Code draws U+276F ("❯"); other TUIs draw ">".
  // Matching only ">" false-negatives every real Claude prompt.
  //
  // A caret at the start of a line, followed by a space, IS the composer —
  // whether it is empty or the operator has already typed into it. The earlier
  // pair of patterns required either an EMPTY caret line or a caret line that
  // was the last line of the capture, and a composer holding text is neither:
  // the TUI footer always follows it. A live pane reading `❯ merge it` was
  // therefore classified "unknown" and the send refused.
  /(^|\n)[ \t]*[│|]?[ \t]*[>❯][ \t]/,
  /(^|\n)[ \t]*[│|]?[ \t]*[>❯][ \t]*(\n|$)/,
  // Footer hints. Claude Code varies this line by mode and context, so match
  // any of its stable fragments rather than one full phrasing.
  /\? for shortcuts/i,
  /\bshift\s*\+\s*tab to cycle\b/i,
  /\bauto mode (on|off)\b/i,
  /\bfor agents\b/i,
  /\bto manage\b/i,
  /type your (message|instruction|request)/i,
  /ctrl\s*\+\s*c to (quit|exit)/i,
]);

/**
 * Claude Code's STATUS FOOTER now includes "esc to interrupt" whenever a
 * background shell is running — even with an empty composer waiting for a
 * prompt. Matching that string anywhere in the pane made every live lane look
 * mid-turn: Runtime Performance showed Ready (no Execution Run) while Send
 * refused with "the agent is mid-turn (esc to interrupt)".
 *
 * The footer is not a turn. A turn is a spinner line (Thinking… / Tinkering…)
 * or "esc to interrupt" on a line that is not the mode footer.
 */
const FOOTER_LINE = /\? for shortcuts|auto mode|\bshift\s*\+\s*tab to cycle\b|\bfor agents\b|\bto manage\b/i;
const TURN_SPINNER_LINE = /^(?:[✶✽✢●✱✧⚒⚙·]\s*)?(?:Thinking|Tinkering|Doodling|Forging|Booping|Working)\s*(?:\.{2,3}|[…⋯]{1,3})/i;
const TURN_GLYPH_SPINNER = /[✶✽✢●⏺✱✧⚒⚙]\s+\S+(?:\.{2,3}|[…⋯]{1,3})\s*\(\s*\d/;
const TURN_ESC_LINE = /esc to interrupt|\(esc to (stop|cancel)\)|\btokens?\s*·\s*esc\b/i;
const GENERATING_LINE = /generating[.…]{1,3}\s*$/i;
const NARRATION_LINE = /^[ \t]*⏺/;

/**
 * Claude Code stamps the finished turn with `Cooked for …` (or Sautéed / Baked).
 * Leftover from the previous turn can still sit in a 48-line capture while a
 * new turn is already writing `⏺` below it — that is a live turn, not Ready.
 */
/**
 * "The turn finished" — matched by SHAPE, not by a list of verbs.
 *
 * This was `/(?:Cooked|Sautéed|Sauted|Baked)\s+for\s+/i`, and Claude Code also
 * ends turns with "Worked for 14s". A lane whose last turn used an unlisted verb
 * never matched, so `liveNarrationIsCurrentTurn` kept reporting the leftover ⏺
 * narration as a LIVE turn: the pane sat idle at a prompt while Vacilando called
 * it busy, and delivery refuses a busy pane. That is what stuck the
 * Communications lane — not the merge it was waiting on, which had already
 * landed.
 *
 * A completion line is `<glyph> <Verb> for <duration>`. Matching that shape
 * cannot be defeated by Claude Code adding another verb tomorrow. The glyph set
 * deliberately excludes ⏺, which prefixes narration rather than completion, so
 * "⏺ Searched for 3 files" is not a completion — and a duration needs a real
 * unit, so "for 3 files" is not one either. Accented letters are in the verb
 * class because one of the verbs Claude Code actually uses is "Sautéed".
 */
export const TURN_FINISHED_RE = /^[ \t]*(?:[✻✳✶✷✸✹✺✽*·][ \t]*)?[A-Za-z\u00C0-\u024F][a-z\u00C0-\u024F]+[ \t]+for[ \t]+\d+(?:\.\d+)?[ \t]*(?:ms|s|m|h)\b/m;

/**
 * An interruption ends a turn as surely as a completion does.
 *
 * Only the "Thinking for 12s" shape counted as a terminator, so a pane whose
 * last turn was INTERRUPTED still read as mid-turn: the `⏺` narration above the
 * interruption was newer than any completion marker, `detectProviderBusy`
 * returned it, and delivery refused with provider_prompt_not_ready. Trust
 * Runtime sat that way for 72 minutes at a live `❯` prompt with an instruction
 * queued behind it.
 */
export const TURN_INTERRUPTED_RE = /(?:^|[\s⎿])Interrupted(?:\s*[·:]|\s*$|\s+by\b)/m;

/** A turn is over when it completed OR when it was interrupted. */
function turnTerminatorAt(line) {
  return TURN_FINISHED_RE.test(line) || TURN_INTERRUPTED_RE.test(line);
}

export function liveNarrationIsCurrentTurn(text) {
  const lines = String(text ?? "").split("\n");
  let lastNarr = -1;
  let lastCooked = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (NARRATION_LINE.test(lines[i])) lastNarr = i;
    if (turnTerminatorAt(lines[i])) lastCooked = i;
  }
  return lastNarr >= 0 && lastNarr > lastCooked;
}

function lastLiveNarrationSignal(text) {
  const lines = String(text ?? "").split("\n");
  let lastCooked = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (turnTerminatorAt(lines[i])) lastCooked = i;
  }
  let last = "";
  for (let i = lastCooked + 1; i < lines.length; i += 1) {
    const m = lines[i].match(/^[ \t]*⏺[ \t]+(\S.*)$/);
    if (m) last = m[1].replace(/\s+$/, "").slice(0, 80);
  }
  return last || "live narration";
}

/** Only the tail is "now". Scrollback would resurrect a screen already cleared. */
const READINESS_TAIL_CHARS = 4000;

function tailOf(text) {
  const raw = String(text ?? "");
  return raw.length > READINESS_TAIL_CHARS ? raw.slice(-READINESS_TAIL_CHARS) : raw;
}

function titleForBlocker(kind, who) {
  switch (kind) {
    case "onboarding": return `${who} is on an onboarding screen`;
    case "permission": return `${who} is waiting on a permission prompt`;
    case "setup": return `${who} has not finished setup`;
    case "selection": return `${who} is waiting on a menu selection`;
    case "trust": return `${who} is waiting on a folder-trust prompt`;
    case "update": return `${who} is waiting on an update`;
    case "login": return `${who} is on a login screen`;
    case "resume_picker": return `${who} is on a session picker`;
    case "error_modal": return `${who} is showing a modal error`;
    default: return `${who} is not at an actionable prompt`;
  }
}

/**
 * @param {string} text pane text captured immediately before delivery
 * @param {{provider?: string|null}} opts
 * @returns {null|{kind,provider,title,signal}}
 */
export function detectPromptBlocker(text, { provider = null } = {}) {
  const tail = tailOf(text);
  if (!tail.trim()) return null;
  const laneProvider = String(provider || "").toLowerCase() || null;
  for (const sig of BLOCKER_SIGNATURES) {
    if (sig.provider && laneProvider && sig.provider !== laneProvider) continue;
    for (const re of sig.patterns) {
      const m = tail.match(re);
      if (!m) continue;
      const resolved = sig.provider || laneProvider || null;
      const who = resolved === "cursor" ? "Cursor" : (resolved === "claude" ? "Claude" : "The agent");
      return {
        kind: sig.kind,
        provider: resolved,
        title: titleForBlocker(sig.kind, who),
        signal: String(m[0]).replace(/\s+/g, " ").trim().slice(0, 160),
      };
    }
  }
  return null;
}

/** Positive prompt evidence, independent of blockers. */
export function detectPromptAffordance(text) {
  const tail = tailOf(text);
  if (!tail.trim()) return null;
  for (const re of PROMPT_AFFORDANCES) {
    const m = tail.match(re);
    if (m) return String(m[0]).replace(/\s+/g, " ").trim().slice(0, 80) || "prompt";
  }
  return null;
}

export function detectProviderBusy(text) {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  const tail = tailOf(raw);
  if (tail.trim()) {
    for (const line of tail.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (FOOTER_LINE.test(trimmed)) continue;
      if (TURN_SPINNER_LINE.test(trimmed) || TURN_GLYPH_SPINNER.test(trimmed) || GENERATING_LINE.test(trimmed)) {
        return trimmed.replace(/\s+/g, " ").slice(0, 80);
      }
      if (TURN_ESC_LINE.test(trimmed)) {
        const m = trimmed.match(TURN_ESC_LINE);
        return String(m?.[0] || trimmed).replace(/\s+/g, " ").trim().slice(0, 80);
      }
    }
  }
  // ⏺ after the last Cooked marker is this turn, even when the spinner has
  // scrolled off the 48-line capture and the leftover prompt still looks idle.
  if (liveNarrationIsCurrentTurn(raw)) return lastLiveNarrationSignal(raw);
  return null;
}

/**
 * Classify a pane for delivery. Fail-closed by construction:
 *
 *   blocked            a modal signature matched — never paste
 *   busy               the agent is mid-turn — not an actionable prompt
 *   ready              a prompt affordance matched and no modal did
 *   unknown            text was readable but showed neither — never paste
 *   capture_unavailable no text at all (dead pane / no capture transport)
 *
 * `capture_unavailable` is deliberately distinct from `unknown`: a pane we
 * cannot see is governed by the existing presence contract in
 * validateSendTarget(), which already refuses dead panes. A pane we CAN see and
 * cannot recognise is a screen we do not understand, and we do not type into
 * screens we do not understand.
 */
/**
 * Text already sitting on the composer line, unsent.
 *
 * WHY THIS IS NOT "READY". Delivery pastes into the composer and then presses
 * Enter. If the line already holds something the operator (or a previous
 * half-finished send) left there, the paste CONCATENATES onto it and Enter
 * submits the join. Observed on the Surfaces pane: the composer read
 * `❯ alloy-dev-stop wt6-surfaces-faacca` while readiness reported ready:true,
 * so the next instruction would have been submitted as that command with the
 * instruction glued to its end.
 *
 * WHY THIS DOES NOT CHANGE THE READINESS VERDICT. A merged contract says a
 * composer holding text is still an actionable prompt — that rule exists
 * because refusing one blocked a live operator from sending at all. And the
 * pane structure is identical either way (rule, caret line, rule, footer), so
 * nothing here can tell the operator's leftover text apart from a legitimate
 * one. Guessing would re-break sending.
 *
 * So this reports WHAT is on the line, and delivery clears the composer before
 * pasting. That removes the ambiguity instead of betting on it: whatever is
 * there, the paste starts from an empty line.
 */
export function residualPromptText(text) {
  const lines = String(text ?? "").split("\n");
  // Walk backwards to the last composer line; that is the live one.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const m = lines[i].match(/^[ \t\u00a0]*[│|]?[ \t\u00a0]*[>❯][ \t\u00a0]+(.*)$/);
    if (!m) continue;
    const rest = String(m[1] || "")
      // The TUI draws a right-hand border on the composer row; it is chrome.
      .replace(/[│|]\s*$/, "")
      .trim();
    if (!rest) return null;
    // A cursor block or placeholder is not operator text.
    if (/^[▏▎▍▌▋▊▉█▁_\s]+$/.test(rest)) return null;
    return rest.slice(0, 200);
  }
  return null;
}

export function assessPanePromptReadiness(text, { provider = null, captured = undefined } = {}) {
  const raw = String(text ?? "");
  const didCapture = captured === undefined ? Boolean(raw.trim()) : Boolean(captured);
  if (!didCapture || !raw.trim()) {
    return {
      ready: false,
      state: "capture_unavailable",
      provider: provider || null,
      blocker: null,
      evidence: null,
      summary: "Pane text could not be captured before delivery.",
    };
  }
  const blocker = detectPromptBlocker(raw, { provider });
  if (blocker) {
    return {
      ready: false,
      state: "blocked",
      provider: blocker.provider || provider || null,
      blocker,
      evidence: null,
      summary: `${blocker.title}: "${blocker.signal}"`,
    };
  }
  const busy = detectProviderBusy(raw);
  if (busy) {
    return {
      ready: false,
      state: "busy",
      provider: provider || null,
      blocker: null,
      evidence: busy,
      summary: `The agent is mid-turn ("${busy}"), not at an actionable prompt.`,
    };
  }
  const affordance = detectPromptAffordance(raw);
  if (affordance) {
    return {
      ready: true,
      state: "ready",
      provider: provider || null,
      blocker: null,
      evidence: affordance,
      summary: "Pane is at an actionable prompt.",
    };
  }
  return {
    ready: false,
    state: "unknown",
    provider: provider || null,
    blocker: null,
    evidence: null,
    summary: "Pane showed no actionable prompt and no recognised screen.",
  };
}

/**
 * Delivery policy. `capture_unavailable` defers to the existing pane-presence
 * contract rather than inventing a second one; every other non-ready state
 * refuses. Set `strictCapture` to also refuse when nothing could be captured.
 */
export function promptReadinessAllowsSend(assessment, { strictCapture = false } = {}) {
  if (!assessment) return { allow: false, error: PROMPT_NOT_READY_ERROR, reason: "not_assessed" };
  if (assessment.state === "ready") return { allow: true, error: null, reason: "ready" };
  if (assessment.state === "capture_unavailable" && !strictCapture) {
    return { allow: true, error: null, reason: "capture_unavailable" };
  }
  return { allow: false, error: PROMPT_NOT_READY_ERROR, reason: assessment.state };
}

/** One-line operator string. Never contains pane text beyond the matched signal. */
export function promptReadinessSummary(assessment) {
  if (!assessment) return "Prompt readiness was not assessed.";
  return String(assessment.summary || `Pane state: ${assessment.state}.`);
}

/** Public, bounded shape stored on the run's delivery record. */
/**
 * Blocker kinds that need a human AT THE TERMINAL. None of them can be answered
 * from the Vacilando composer — typing there would paste an instruction into a
 * dialog, not answer it. A send blocked by one of these is not "needs input";
 * it is undelivered.
 */
export const OPERATOR_TERMINAL_BLOCKERS = Object.freeze([
  "permission", "onboarding", "setup", "trust", "update", "login", "resume_picker", "selection", "error_modal",
]);

/**
 * Is this refusal a standing dialog, or a passing condition?
 *
 * A modal waits for a person at the keyboard and will not clear on its own — a
 * run parked on one must fail rather than sit protected forever. `busy`,
 * `unknown` and `capture_unavailable` are transient: the agent is mid-turn, or
 * the screen was briefly unreadable, and a later retry is the right answer.
 */
export function promptBlockNeedsTerminalOperator(assessment) {
  if (!assessment) return false;
  if (assessment.state !== "blocked") return false;
  const kind = assessment.blocker?.kind || assessment.blocker_kind || null;
  return OPERATOR_TERMINAL_BLOCKERS.includes(kind);
}

export function publicPromptReadiness(assessment) {
  if (!assessment) return null;
  return {
    ready: Boolean(assessment.ready),
    state: assessment.state,
    provider: assessment.provider || null,
    blocker_kind: assessment.blocker?.kind || null,
    needs_terminal_operator: promptBlockNeedsTerminalOperator(assessment),
    signal: assessment.blocker?.signal || assessment.evidence || null,
    summary: promptReadinessSummary(assessment),
  };
}
