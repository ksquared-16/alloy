/**
 * THE TURN SUMMARY — the operator-facing result of a substantive turn.
 *
 * The Director should be able to read only this and answer six questions: did
 * it work, what changed, what is live right now, what is blocked, do I need to
 * do anything, what happens next. Everything else — logs, test names,
 * intermediate shas — stays in activity, inspector and audit.
 *
 * THE FAILURE THIS PREVENTS is not missing prose. It is BLURRED PROSE.
 * "Provider ceiling capability complete" was true of the implementation and
 * false of the running system, and the difference between those cost a lane
 * that sat blocked while its summary read as success. So the lifecycle is a
 * required, enumerated field rather than an adjective the writer chooses:
 * implemented, committed, pushed, pr_open, merged, installed, live_certified
 * are seven different facts and a summary must state which ones hold.
 *
 * The same reasoning governs the blocker. "Awaiting approval" names a feeling,
 * not a cause, and nobody can act on it. A blocker must name what is blocked,
 * who owns it, and the exact action that clears it.
 */

/** What the turn amounted to. */
export const TURN_STATUSES = Object.freeze([
  "COMPLETE", "COMPLETE_PROMOTED", "BLOCKED", "PARTIAL", "FAILED", "WAITING",
]);

/**
 * Seven distinct facts, in the order work actually travels. Claiming a later
 * stage asserts every earlier one, which is what makes the ordering load-bearing
 * rather than decorative.
 */
export const LIFECYCLE_STAGES = Object.freeze([
  "implemented", "committed", "pushed", "pr_open", "merged", "installed", "live_certified",
]);

/** Statuses that require a blocker section. */
const NEEDS_BLOCKER = new Set(["BLOCKED", "WAITING", "FAILED"]);

/**
 * PARTIAL is the case the first draft of this file got wrong: real work landed
 * AND something is blocked. Forcing that turn to choose between reporting the
 * work and reporting the blocker is how one of the two goes missing, so PARTIAL
 * may carry a blocker without requiring one. A finished turn may not: a blocker
 * on COMPLETE means the status is wrong.
 */
const MAY_CARRY_BLOCKER = new Set([...NEEDS_BLOCKER, "PARTIAL"]);

/**
 * Phrases that describe a mood rather than a cause. Each of these was an actual
 * summary that told the operator nothing they could act on.
 */
const VAGUE_BLOCKERS = [
  /^awaiting approval\.?$/i,
  /^blocked on (the )?operator\.?$/i,
  /^waiting( for input)?\.?$/i,
  /^needs director\.?$/i,
  /^operator-run install required\.?$/i,
];

const text = (v) => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);

/**
 * Is this turn worth a summary at all?
 *
 * Part 6 is explicit that a large report after every tiny command is the
 * failure mode on the other side. A turn that changed nothing and answered a
 * status question does not need the full form.
 */
export function summaryIsSubstantive(s = {}) {
  if (NEEDS_BLOCKER.has(s.status)) return true;
  return list(s.what_changed).length > 0 || list(s.verified).length > 0;
}

/**
 * Validate against the contract. Returns { ok, errors[] }.
 *
 * Every rule here exists because its absence produced a summary somebody acted
 * on wrongly. None of them are stylistic.
 */
export function validateTurnSummary(s = {}) {
  const errors = [];

  if (!TURN_STATUSES.includes(s.status)) {
    errors.push(`status must be one of ${TURN_STATUSES.join(", ")}`);
  }

  const stages = list(s.lifecycle);
  for (const stage of stages) {
    if (!LIFECYCLE_STAGES.includes(stage)) errors.push(`unknown lifecycle stage '${stage}'`);
  }

  // Part 7. The one claim that must never be made loosely: promoted AND
  // running are different, and this is the status that asserts both.
  if (s.status === "COMPLETE_PROMOTED") {
    for (const required of ["merged", "installed", "live_certified"]) {
      if (!stages.includes(required)) {
        errors.push(`COMPLETE_PROMOTED asserts ${required}; say PARTIAL or COMPLETE instead`);
      }
    }
  }

  // Lifecycle is ordered: claiming a stage claims the ones before it. A summary
  // saying "merged" but not "pushed" is describing something that cannot happen.
  const highest = stages.reduce((acc, st) => Math.max(acc, LIFECYCLE_STAGES.indexOf(st)), -1);
  for (let i = 0; i < highest; i++) {
    if (!stages.includes(LIFECYCLE_STAGES[i])) {
      errors.push(`lifecycle claims '${LIFECYCLE_STAGES[highest]}' without '${LIFECYCLE_STAGES[i]}'`);
    }
  }

  if (NEEDS_BLOCKER.has(s.status)) {
    const b = s.blocker || {};
    if (!text(b.what)) errors.push(`status ${s.status} requires blocker.what`);
    if (!text(b.owner)) errors.push(`status ${s.status} requires blocker.owner`);
    if (!text(b.clearing_action)) {
      errors.push(`status ${s.status} requires blocker.clearing_action — the exact action that clears it`);
    }
    if (VAGUE_BLOCKERS.some((re) => re.test(text(b.what)))) {
      errors.push(`blocker.what names a state, not a cause: '${text(b.what)}'`);
    }
  } else if (s.blocker && text(s.blocker.what) && !MAY_CARRY_BLOCKER.has(s.status)) {
    errors.push(`status ${s.status} must not carry a blocker`);
  }

  // A PARTIAL turn that does carry one still has to make it actionable.
  if (s.status === "PARTIAL" && s.blocker && text(s.blocker.what)) {
    if (!text(s.blocker.owner) || !text(s.blocker.clearing_action)) {
      errors.push("a PARTIAL blocker still requires owner and clearing_action");
    }
    if (VAGUE_BLOCKERS.some((re) => re.test(text(s.blocker.what)))) {
      errors.push(`blocker.what names a state, not a cause: '${text(s.blocker.what)}'`);
    }
  }

  // Part 6: the Director-action section appears only when the Director must
  // act. A standing "None" that nobody removed trains the operator to skip it.
  // Keyed to whether a blocker EXISTS rather than to the status, because that
  // is the thing that actually determines whether the Director has something
  // to do.
  if (text(s.director_action) && !(s.blocker && text(s.blocker.what))) {
    errors.push("director_action is set on a turn with no blocker to act on");
  }

  if (!text(s.next_automatic_action)) {
    errors.push("next_automatic_action is required — say what happens with no Director input");
  }

  // Part 8: this is a summary. Bound it, or it becomes the log it replaces.
  if (list(s.what_changed).length > 8) errors.push("what_changed exceeds 8 bullets");
  for (const line of [...list(s.what_changed), ...list(s.verified), ...list(s.remaining)]) {
    if (line.length > 240) errors.push(`a bullet exceeds 240 characters: '${line.slice(0, 60)}…'`);
  }

  return { ok: errors.length === 0, errors };
}

const section = (title, body) => (body && body.length ? [`${title}`, ...body, ""] : []);
const bullets = (rows) => rows.map((r) => `* ${r}`);

/** Render the operator-facing form. */
export function formatTurnSummary(s = {}) {
  const stages = list(s.lifecycle);
  const state = list(s.current_state);
  const out = ["TURN SUMMARY", "", "Status", s.status, ""];

  out.push(...section("What changed", bullets(list(s.what_changed))));

  // Lifecycle is rendered as state, not as a claim, so "merged but not
  // installed" is visible at a glance rather than inferred from prose.
  const lifecycleLine = LIFECYCLE_STAGES
    .filter((st) => stages.includes(st))
    .join(" → ") || "nothing yet";
  out.push(...section("Current state", bullets([...state, `lifecycle: ${lifecycleLine}`])));

  out.push(...section("Verified", bullets(list(s.verified))));
  out.push(...section("Remaining", bullets(list(s.remaining))));

  if (s.blocker && text(s.blocker.what)) {
    out.push("Blocker", `${text(s.blocker.what)}`,
      `Owner: ${text(s.blocker.owner)}`,
      `Clears it: ${text(s.blocker.clearing_action)}`, "");
  } else {
    out.push("Blocker", "None", "");
  }

  out.push("Next automatic action", text(s.next_automatic_action), "");
  out.push("Director action", text(s.director_action) || "None");
  return out.join("\n");
}

/**
 * Map the summary onto the EXISTING handoff orientation fields.
 *
 * Deliberately not a new store. agent-handoffs.json is already what
 * buildContinuationInstruction reads to orient the next provider, so a summary
 * written anywhere else would be a second memory that the orientation path does
 * not consult — which is the same class of bug as terminal scrollback.
 */
export function toHandoffPayload(s = {}) {
  const blocked = s.blocker && text(s.blocker.what);
  return {
    completed_work: [
      `[${s.status}]`,
      ...list(s.what_changed).map((b) => `- ${b}`),
      list(s.lifecycle).length ? `lifecycle: ${list(s.lifecycle).join(" → ")}` : "",
    ].filter(Boolean).join("\n"),
    remaining_work: [
      ...list(s.remaining).map((b) => `- ${b}`),
      blocked ? `BLOCKER: ${text(s.blocker.what)} — cleared by: ${text(s.blocker.clearing_action)} (owner: ${text(s.blocker.owner)})` : "",
    ].filter(Boolean).join("\n"),
    next_action: text(s.next_automatic_action),
    current_phase: s.status,
    turn_summary: formatTurnSummary(s),
  };
}
