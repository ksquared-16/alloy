/**
 * The provider prompt adapter — the only thing that answers a provider.
 *
 * Separated from classification for the reason every executor in this system is
 * separated from its policy: a module that decides must be provable without
 * side effects, and a module that acts must contain nothing else.
 *
 * RE-READS BEFORE IT ANSWERS. A pane is the most volatile thing in the system;
 * between classifying a prompt and answering it the agent may have moved on,
 * been interrupted, or be asking something entirely different. The answer is
 * bound to a fingerprint over session + run + prompt text + requested command,
 * and a mismatch refuses rather than sends.
 *
 * NEVER WIDENS PERMISSIONS. Claude's modals offer both "Yes" and "Yes, and
 * don't ask again for this project". The adapter takes the narrowest
 * affirmative only; the broad option would silently grant standing permission
 * far past the single action Vacilando authorized.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  classifyProviderPrompt, affirmativeOption, answerMatchesPrompt,
} from "./provider-prompt-authority.mjs";

export const PROMPT_DECISION_SCHEMA = "vacilando.provider_prompt_decision.v1";

export function promptDecisionStorePath(root) {
  return join(root, "provider-prompts", "decisions.json");
}

function readStore(root) {
  try {
    const j = JSON.parse(readFileSync(promptDecisionStorePath(root), "utf8"));
    return { schema_version: PROMPT_DECISION_SCHEMA, decisions: j.decisions || [] };
  } catch { return { schema_version: PROMPT_DECISION_SCHEMA, decisions: [] }; }
}

function writeStore(root, store) {
  const p = promptDecisionStorePath(root);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  store.decisions = store.decisions.slice(-200);
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(tmp, p);
}

/** Every answered prompt is recorded with the authority that justified it. */
export function recordPromptDecision({ root, decision, nowMs = Date.now() } = {}) {
  const store = readStore(root);
  store.decisions.push({ ...decision, at: new Date(nowMs).toISOString() });
  writeStore(root, store);
  return decision;
}

export function listPromptDecisions({ root } = {}) {
  return readStore(root).decisions;
}

const defaultCapture = (target) => {
  try {
    return execFileSync("/usr/local/bin/tmux", ["capture-pane", "-p", "-t", target, "-S", "-40"],
      { encoding: "utf8", timeout: 15000 });
  } catch { return null; }
};

const defaultSendKeys = (target, keys) => {
  try {
    execFileSync("/usr/local/bin/tmux", ["send-keys", "-t", target, ...keys], { timeout: 15000 });
    return true;
  } catch { return false; }
};

/**
 * Observe one managed session's prompt state.
 *
 * Returns the classification, or null when the pane holds no prompt at all.
 */
export function observeProviderPrompt({
  target, sessionId = null, runId = null, authorizedCapabilities = [], capture = defaultCapture,
} = {}) {
  const pane = capture(target);
  if (pane == null) {
    return { classification: "unsafe_or_unknown_provider_prompt", auto_answerable: false,
      reason: "the pane could not be captured", capture_failed: true, session_id: sessionId, run_id: runId };
  }
  const cls = classifyProviderPrompt({ paneText: pane, sessionId, runId, authorizedCapabilities });
  if (!cls.prompt_text && !cls.requested) return null;
  return { ...cls, pane_tail: pane.split("\n").slice(-14).join("\n") };
}

/**
 * Answer a provider prompt that Vacilando has authority to answer.
 *
 * `expect` is the classification the caller decided on. The pane is captured
 * AGAIN here and must still produce the identical fingerprint.
 */
export function answerProviderPrompt({
  root, target, expect, sessionId = null, runId = null, authorizedCapabilities = [],
  capture = defaultCapture, sendKeys = defaultSendKeys, nowMs = Date.now(),
} = {}) {
  if (!expect) return { ok: false, error: "missing_expected_decision" };
  if (!expect.auto_answerable) {
    return { ok: false, error: "not_auto_answerable", classification: expect.classification, reason: expect.reason };
  }
  if (expect.classification !== "routine_tool_permission") {
    // Only the routine class is ever adapter business. A governed decision is
    // answered after the governed flow resolves, through the same path but with
    // an authority that came from a decision record, not from this classifier.
    return { ok: false, error: "classification_not_adapter_answerable", classification: expect.classification };
  }

  const pane = capture(target);
  if (pane == null) return { ok: false, error: "pane_unreadable_at_answer_time" };

  const fresh = classifyProviderPrompt({ paneText: pane, sessionId, runId, authorizedCapabilities });
  if (!answerMatchesPrompt(expect, fresh)) {
    return {
      ok: false, error: "stale_provider_prompt",
      expected_fingerprint: expect.fingerprint, observed_fingerprint: fresh.fingerprint,
      observed_classification: fresh.classification,
    };
  }
  if (!fresh.auto_answerable || fresh.classification !== "routine_tool_permission") {
    return { ok: false, error: "prompt_no_longer_auto_answerable", observed_classification: fresh.classification };
  }

  const option = affirmativeOption(pane);
  if (!option) return { ok: false, error: "no_narrow_affirmative_option" };
  if (option.widens_permissions) return { ok: false, error: "refused_permission_widening_option" };

  const sent = sendKeys(target, [String(option.option), "Enter"]);
  if (!sent) return { ok: false, error: "send_failed" };

  const decision = {
    schema_version: PROMPT_DECISION_SCHEMA,
    session_id: sessionId, run_id: runId, target,
    fingerprint: fresh.fingerprint,
    prompt_text: fresh.prompt_text,
    requested: fresh.requested,
    classification: fresh.classification,
    authority: fresh.authority,
    reason: fresh.reason,
    answered_option: option.option,
    answered_label: option.label,
    answered_by: "vacilando_adapter",
  };
  if (root) recordPromptDecision({ root, decision, nowMs });
  return { ok: true, decision };
}

/**
 * The operator-facing sentence for a prompt Vacilando cannot answer itself.
 *
 * Never "go and type into tmux". Even the unknown case names the work, quotes
 * the prompt, and says why classification failed.
 */
export function operatorPromptSurface(cls, { laneName = null, workTitle = null } = {}) {
  if (!cls) return null;
  return {
    headline: cls.classification === "governed_operator_decision"
      ? `Provider requested ${cls.requested_capability || "a governed capability"}`
      : "Provider needs a decision",
    lane: laneName || null,
    work: workTitle || null,
    provider_prompt: cls.prompt_text,
    requested: cls.requested,
    why_not_automatic: cls.reason,
    actionable_in_vacilando: true,
    operator_action: cls.classification === "governed_operator_decision" ? "approve_or_deny" : "review_and_decide",
  };
}
