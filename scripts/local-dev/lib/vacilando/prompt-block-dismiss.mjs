/**
 * Operator-initiated dismissal of a RECOGNISED modal.
 *
 * WHY THIS EXISTS. Trust Runtime sat in Claude's Rewind picker while the lane
 * reported "Working". The picker's row cursor is the same `❯` glyph as the input
 * prompt, so the prompt affordance matched, the pane read READY, and the only
 * honest way out was a person at a terminal — which is precisely the thing the
 * Director should never need. "It's stuck and there's nothing I can do" was an
 * accurate description of the product.
 *
 * WHY THIS IS NOT "the agent types into modals now". The standing rule is that
 * we never type into a screen we do not understand. This does not weaken it: a
 * dismissal is offered ONLY for a blocker we positively recognised, ONLY for
 * kinds whose cancel key is known, ONLY on an explicit operator action, and it
 * can send nothing except Escape. It cannot answer a question, choose a menu
 * entry, grant a permission, or accept a prompt — the keys to do any of those
 * are not reachable from here.
 */
import { assessPanePromptReadiness } from "./provider-prompt-readiness.mjs";

/**
 * Blockers whose cancel key is known to be Escape.
 *
 * Deliberately excludes `permission`, `trust`, `onboarding`, `login` and
 * `update`: those ask a real question, and dismissing one is answering it. A
 * person decides those.
 */
export const DISMISSIBLE_BLOCKER_KINDS = Object.freeze([
  "selection",
  "resume_picker",
  "error_modal",
]);

export function blockerIsDismissible(assessment) {
  if (!assessment || assessment.state !== "blocked") return false;
  const kind = assessment.blocker?.kind || assessment.blocker_kind || null;
  return DISMISSIBLE_BLOCKER_KINDS.includes(kind);
}

/** Escape twice: the first closes the overlay, the second any turn beneath it. */
export function dismissKeysArgv(target) {
  return ["send-keys", "-t", target, "Escape", "Escape"];
}

/**
 * Dismiss a recognised modal on a lane's pane.
 *
 * Reports what it saw BEFORE and AFTER, because "the button did something" is
 * not the same as "the screen changed" — and a dismissal that silently failed
 * would put the Director back where they started with less information.
 */
export async function dismissPromptBlock(laneId, {
  root = undefined,
  capture = null,
  send = null,
} = {}) {
  const { getDurableLane } = await import("./development-lane.mjs");
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found" };

  const target = rec.binding?.tmux_pane || rec.binding?.tmux_session || null;
  if (!target) return { ok: false, error: "lane_has_no_pane" };

  const readPane = capture || (async (t) => {
    const { capturePaneText } = await import("./lanes.mjs");
    const out = await capturePaneText(t);
    return out?.ok ? out.text : "";
  });

  let before = "";
  try {
    before = String((await readPane(target)) || "");
  } catch (err) {
    return { ok: false, error: "capture_unavailable", detail: String(err?.message || err).slice(0, 200) };
  }
  const assessedBefore = assessPanePromptReadiness(before);
  if (!blockerIsDismissible(assessedBefore)) {
    // Refuse loudly. A pane that is merely busy, or blocked on a question only a
    // person can answer, must not be Escaped out from under the operator.
    return {
      ok: false,
      error: "blocker_not_dismissible",
      state: assessedBefore.state,
      blocker_kind: assessedBefore.blocker?.kind || null,
      dismissible_kinds: DISMISSIBLE_BLOCKER_KINDS,
    };
  }

  const sendKeys = send || (async (argv) => {
    const { sendPaneKeys } = await import("./lanes.mjs");
    return sendPaneKeys(argv);
  });
  const sent = await sendKeys(dismissKeysArgv(target));
  if (!sent?.ok) {
    return { ok: false, error: sent?.error || "dismiss_send_failed", blocker_kind: assessedBefore.blocker?.kind || null };
  }

  let after = "";
  try {
    after = String((await readPane(target)) || "");
  } catch {
    after = "";
  }
  const assessedAfter = after ? assessPanePromptReadiness(after) : null;

  return {
    ok: true,
    lane_id: rec.lane_id,
    blocker_kind: assessedBefore.blocker?.kind || null,
    before_state: assessedBefore.state,
    after_state: assessedAfter?.state || "capture_unavailable",
    // The honest answer to "did that work?".
    cleared: Boolean(assessedAfter && assessedAfter.state !== "blocked"),
    keys_sent: "Escape Escape",
  };
}
