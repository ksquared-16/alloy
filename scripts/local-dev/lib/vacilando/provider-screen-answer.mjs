/**
 * Answer a provider's blocking screen from Vacilando.
 *
 * THE PROBLEM. A Claude onboarding, trust or permission modal stops a lane
 * dead. Vacilando detected it correctly and said so — "this prompt has to be
 * answered in the agent's terminal" — which is honest and also a dead end: the
 * operator has to leave the app, find the tmux session, and type. On a phone
 * that is not possible at all, so a lane could be blocked with no way forward.
 *
 * THE DISTINCTION THAT MATTERS. Vacilando still does not DECIDE. It reads the
 * choices the provider is actually offering, shows them verbatim, and relays
 * the one the operator picked. Auto-answering these would be Vacilando making
 * security and setup decisions on someone's behalf — that stays forbidden, and
 * nothing here selects a default, infers an answer, or dismisses a screen the
 * operator did not look at.
 *
 * WHAT IT WILL NOT SEND. Only a choice that is visibly on screen. The index has
 * to match a parsed option, so a caller cannot post "4" at a three-option
 * dialog, and free text is never accepted.
 */
import { detectPromptBlocker, OPERATOR_TERMINAL_BLOCKERS } from "./provider-prompt-readiness.mjs";

export const SCREEN_ANSWER_MAX_OPTIONS = 9;

/**
 * Pull the question and its numbered options off the pane.
 *
 * Claude Code draws these as a title line, optional prose, then `❯ 1. Yes` for
 * the highlighted row and `  2. Not now` for the rest, ending with a hint line
 * like "Enter to confirm · Esc to cancel". The caret and the leading spaces are
 * chrome; the number and its label are the contract.
 */
export function parseBlockingScreen(text) {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  const lines = raw.split("\n");

  // Options are the numbered rows. Take the LAST contiguous run of them: an
  // earlier transcript may quote a numbered list that is not a live dialog.
  const numbered = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const m = lines[i].match(/^[ \t\u00a0]*[│|]?[ \t\u00a0]*(?:[>❯][ \t\u00a0]*)?(\d)\.[ \t\u00a0]+(\S.*?)[ \t\u00a0]*[│|]?[ \t\u00a0]*$/);
    if (m) {
      numbered.unshift({ index: Number(m[1]), label: m[2].trim().slice(0, 120), line: i, selected: /[>❯]/.test(lines[i]) });
      continue;
    }
    if (numbered.length) break;   // the run ended; everything above is context
  }
  if (numbered.length < 2) return null;
  // They must be consecutive from 1, or this is prose that happens to be numbered.
  for (let k = 0; k < numbered.length; k += 1) {
    if (numbered[k].index !== k + 1) return null;
  }
  if (numbered.length > SCREEN_ANSWER_MAX_OPTIONS) return null;

  // The question, and the prose under it.
  //
  // These dialogs are a title line then an explanatory line — "Teach auto mode
  // about your environment?" above "Auto mode works better when it knows your
  // environment." Taking the nearest line grabs the explanation and drops the
  // actual question, so prefer a line that ends in "?" within the lookback and
  // keep the rest as detail.
  const context = [];
  for (let i = numbered[0].line - 1; i >= 0 && i >= numbered[0].line - 6; i -= 1) {
    const t = lines[i].replace(/[│|]/g, "").trim();
    if (!t) continue;
    if (/^[─━=_.\-]{6,}$/.test(t)) break;            // a rule ends the dialog box
    if (/^[✔✓✻⏵⧉]/.test(t)) continue;                 // status chrome
    context.unshift(t.slice(0, 200));
  }
  if (!context.length) return null;
  const asked = context.find((t) => t.endsWith("?"));
  const question = asked || context[context.length - 1];
  const detail = context.filter((t) => t !== question).join(" ").slice(0, 300) || null;

  return {
    question,
    detail,
    options: numbered.map((o) => ({ index: o.index, label: o.label, selected: o.selected })),
    confirm_hint: lines.slice(numbered[numbered.length - 1].line + 1, numbered[numbered.length - 1].line + 3)
      .map((l) => l.trim()).find((l) => /enter to confirm/i.test(l)) || null,
  };
}

/**
 * The full answerable view of a pane: what is blocking, and what can be chosen.
 *
 * Returns `answerable:false` with a reason when there is nothing to answer, so
 * the UI can say why rather than showing an empty dialog.
 */
export function answerableScreen(text, { provider = null } = {}) {
  const blocker = detectPromptBlocker(text, { provider });
  const screen = parseBlockingScreen(text);
  if (!blocker && !screen) return { answerable: false, reason: "no_blocking_screen" };
  if (!screen) {
    // A blocker with no numbered choices — a spinner, a login URL, a free-text
    // field. Vacilando cannot offer buttons for something with no options.
    return {
      answerable: false,
      reason: "no_selectable_options",
      blocker,
      needs_terminal: true,
    };
  }
  return {
    answerable: true,
    kind: blocker?.kind || "selection",
    provider: blocker?.provider || provider || null,
    title: blocker?.title || "The agent is waiting on a choice",
    question: screen.question,
    detail: screen.detail || null,
    options: screen.options,
    confirm_hint: screen.confirm_hint,
    // True for the classes that used to be a dead end for the operator.
    was_terminal_only: OPERATOR_TERMINAL_BLOCKERS.includes(blocker?.kind),
  };
}

/**
 * Keys that answer a numbered dialog: type the digit, then confirm.
 *
 * Two separate sends, because tmux would otherwise interpret them as one
 * chord. The digit moves the selection; Enter commits it.
 */
export function answerKeysArgv(target, index) {
  return [
    ["send-keys", "-t", target, String(index)],
    ["send-keys", "-t", target, "Enter"],
  ];
}

/**
 * Relay the operator's choice to the pane.
 *
 * `choice` must be the index of an option that is ON SCREEN right now. The
 * screen is re-read at answer time rather than trusted from whatever the UI
 * last rendered — the dialog may have changed, and answering a dialog that is
 * no longer there could select something entirely different.
 */
export async function answerBlockingScreen(laneId, {
  choice,
  expectedQuestion = null,
  provider = null,
  capture = null,
  tmux = null,
  root = undefined,
} = {}) {
  const { getDurableLane } = await import("./development-lane.mjs");
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found" };
  const target = rec.binding?.tmux_pane || rec.binding?.tmux_session || null;
  if (!target) return { ok: false, error: "lane_has_no_pane" };

  const index = Number(choice);
  if (!Number.isInteger(index) || index < 1 || index > SCREEN_ANSWER_MAX_OPTIONS) {
    return { ok: false, error: "invalid_choice" };
  }

  // Re-read the pane NOW. Answering from a stale render could pick a different
  // option than the operator saw.
  let text = "";
  try {
    const read = capture || (await import("./lanes.mjs")).capturePaneText;
    const out = await read(target);
    text = typeof out === "string" ? out : String(out?.text || "");
  } catch (err) {
    return { ok: false, error: "capture_failed", detail: String(err?.message || err).slice(0, 200) };
  }

  const screen = answerableScreen(text, { provider: provider || rec.preferred_provider || null });
  if (!screen.answerable) {
    return { ok: false, error: screen.reason || "not_answerable", screen };
  }
  const option = screen.options.find((o) => o.index === index);
  if (!option) {
    return { ok: false, error: "choice_not_on_screen", options: screen.options };
  }
  if (expectedQuestion && screen.question !== expectedQuestion) {
    // The dialog changed under the operator between render and tap.
    return { ok: false, error: "screen_changed", question: screen.question, options: screen.options };
  }

  try {
    const send = tmux || (await import("./lanes.mjs")).sendPaneKeys;
    for (const argv of answerKeysArgv(target, index)) {
      const out = await send(argv);
      if (!out?.ok) return { ok: false, error: "answer_send_failed", detail: out?.error || null };
    }
  } catch (err) {
    return { ok: false, error: "answer_send_failed", detail: String(err?.message || err).slice(0, 200) };
  }

  return {
    ok: true,
    lane_id: rec.lane_id,
    answered: { index, label: option.label },
    question: screen.question,
    kind: screen.kind,
  };
}
