/**
 * The turn summary contract.
 *
 * The failure being prevented is blurred prose, not missing prose. "Provider
 * ceiling capability complete" was true of the implementation and false of the
 * running system, and a lane sat blocked while its summary read as success.
 */
import test from "node:test";
import assert from "node:assert/strict";

const S = await import("../lib/vacilando/turn-summary.mjs");

const good = {
  status: "PARTIAL",
  what_changed: ["Registered host.install_toolkit as a governed action."],
  current_state: ["branch feat/governed-provider-ceiling @ d36a1544e", "staging 684153774"],
  lifecycle: ["implemented", "committed"],
  verified: ["tested: 15/0 toolkit-convergence"],
  remaining: ["Install promoted staging."],
  next_automatic_action: "Request governed convergence once the action is installed.",
};

test("a well-formed summary validates", () => {
  assert.deepEqual(S.validateTurnSummary(good), { ok: true, errors: [] });
});

test("status must come from the vocabulary", () => {
  const r = S.validateTurnSummary({ ...good, status: "DONE" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("status must be one of")));
});

test("COMPLETE_PROMOTED cannot be claimed without merged, installed and certified", () => {
  const r = S.validateTurnSummary({
    ...good, status: "COMPLETE_PROMOTED", lifecycle: ["implemented", "committed", "pushed", "pr_open", "merged"],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("installed")));
  assert.ok(r.errors.some((e) => e.includes("live_certified")));
});

test("COMPLETE_PROMOTED passes once every stage is claimed", () => {
  const r = S.validateTurnSummary({
    ...good, status: "COMPLETE_PROMOTED", lifecycle: [...S.LIFECYCLE_STAGES],
  });
  assert.equal(r.ok, true);
});

test("the lifecycle is ordered — merged without pushed is impossible", () => {
  const r = S.validateTurnSummary({ ...good, lifecycle: ["implemented", "committed", "merged"] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("without 'pushed'")));
});

test("a blocked turn must name what, who, and the exact clearing action", () => {
  const r = S.validateTurnSummary({ ...good, status: "BLOCKED" });
  assert.equal(r.ok, false);
  assert.equal(r.errors.filter((e) => e.includes("requires blocker")).length, 3);
});

test("a blocker that names a mood rather than a cause is refused", () => {
  for (const vague of ["Awaiting approval", "waiting", "operator-run install required"]) {
    const r = S.validateTurnSummary({
      ...good, status: "BLOCKED",
      blocker: { what: vague, owner: "operator", clearing_action: "do the thing" },
    });
    assert.equal(r.ok, false, `'${vague}' should be refused`);
    assert.ok(r.errors.some((e) => e.includes("names a state, not a cause")));
  }
});

test("a specific blocker is accepted", () => {
  const r = S.validateTurnSummary({
    ...good, status: "BLOCKED",
    blocker: {
      what: "Installed toolkit 4ee65145 lacks capacity.set_provider_ceiling.",
      owner: "operator",
      clearing_action: "alloy-toolkit install origin/staging",
    },
    director_action: "Run the install.",
  });
  assert.deepEqual(r.errors, []);
});

test("an unblocked turn may not carry a blocker or a director action", () => {
  const withBlocker = S.validateTurnSummary({
    ...good, status: "COMPLETE", blocker: { what: "something", owner: "x", clearing_action: "y" },
  });
  assert.ok(withBlocker.errors.some((e) => e.includes("must not carry a blocker")));

  const withDirector = S.validateTurnSummary({ ...good, status: "COMPLETE", director_action: "Please look at this." });
  assert.ok(withDirector.errors.some((e) => e.includes("no blocker to act on")));
});

test("PARTIAL may carry a blocker — work landed AND something is stuck", () => {
  // Forcing this turn to choose between reporting the work and reporting the
  // blocker is how one of the two goes missing.
  const r = S.validateTurnSummary({
    ...good, status: "PARTIAL",
    blocker: {
      what: "The install command is denied by the host permission classifier.",
      owner: "operator",
      clearing_action: "Approve the command or add a Bash permission rule.",
    },
    director_action: "Approve the install.",
  });
  assert.deepEqual(r.errors, []);
});

test("a PARTIAL blocker still has to be actionable", () => {
  const r = S.validateTurnSummary({
    ...good, status: "PARTIAL", blocker: { what: "Awaiting approval" },
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("owner and clearing_action")));
  assert.ok(r.errors.some((e) => e.includes("names a state, not a cause")));
});

test("next_automatic_action is always required", () => {
  const { next_automatic_action, ...rest } = good;
  const r = S.validateTurnSummary(rest);
  assert.ok(r.errors.some((e) => e.includes("next_automatic_action")));
});

test("the summary is bounded so it cannot become the log it replaces", () => {
  const many = S.validateTurnSummary({ ...good, what_changed: Array(9).fill("a change") });
  assert.ok(many.errors.some((e) => e.includes("exceeds 8 bullets")));

  const long = S.validateTurnSummary({ ...good, verified: ["x".repeat(241)] });
  assert.ok(long.errors.some((e) => e.includes("exceeds 240 characters")));
});

test("a status-only turn is not substantive", () => {
  assert.equal(S.summaryIsSubstantive({ status: "COMPLETE" }), false);
  assert.equal(S.summaryIsSubstantive(good), true);
  // A blocked turn is always worth reporting, even with nothing changed.
  assert.equal(S.summaryIsSubstantive({ status: "BLOCKED" }), true);
});

test("rendering shows promoted-but-not-installed at a glance", () => {
  const out = S.formatTurnSummary({
    ...good, status: "PARTIAL",
    lifecycle: ["implemented", "committed", "pushed", "pr_open", "merged"],
  });
  const lifecycleLine = out.split("\n").find((l) => l.startsWith("* lifecycle:"));
  assert.equal(lifecycleLine, "* lifecycle: implemented → committed → pushed → pr_open → merged");
  // The claim stops at merged. Prose elsewhere may use the word; the LINE may not.
  assert.doesNotMatch(lifecycleLine, /installed/);
  assert.match(out, /Director action\nNone/);
  assert.match(out, /Blocker\nNone/);
});

test("the summary feeds the EXISTING orientation fields, not a parallel store", () => {
  const payload = S.toHandoffPayload({
    ...good, status: "BLOCKED",
    blocker: {
      what: "Installed toolkit 4ee65145 lacks capacity.set_provider_ceiling.",
      owner: "operator",
      clearing_action: "alloy-toolkit install origin/staging",
    },
  });
  // These four are what buildContinuationInstruction already reads.
  for (const k of ["completed_work", "remaining_work", "next_action", "current_phase"]) {
    assert.ok(k in payload, `${k} is required by the existing handoff path`);
  }
  assert.match(payload.remaining_work, /BLOCKER:.*cleared by: alloy-toolkit install origin\/staging/);
  assert.equal(payload.current_phase, "BLOCKED");
  assert.match(payload.turn_summary, /^TURN SUMMARY/);
});

test("a next provider can orient from the payload alone", () => {
  const payload = S.toHandoffPayload(good);
  assert.match(payload.completed_work, /\[PARTIAL\]/);
  assert.match(payload.completed_work, /lifecycle: implemented → committed/);
  assert.match(payload.next_action, /Request governed convergence/);
});

/* ── Part 9: canonical facts come from their owners ──────────────────────── */

const ST = await import("../lib/vacilando/turn-summary-state.mjs");

test("git truth is read from git, not from the provider's memory", () => {
  const g = ST.gitTruth(process.cwd());
  assert.match(String(g.head), /^[0-9a-f]{40}$/);
  assert.match(String(g.staging_sha), /^[0-9a-f]{40}$/);
  assert.equal(typeof g.ahead, "number");
  assert.equal(typeof g.behind, "number");
});

test("canonical state derives the lifecycle rather than accepting a claim", () => {
  const s = ST.collectCanonicalState({ worktreePath: process.cwd() });
  assert.ok(s.lifecycle.includes("implemented"));
  assert.ok(s.lifecycle.includes("committed"));
  // This branch has unpushed commits and a drifted toolkit, so neither of these
  // may be claimed. If that ever changes, the assertion is what should change.
  if (s.git.ahead > 0) assert.equal(s.lifecycle.includes("pushed"), false);
  if (!s.convergence.converged) assert.equal(s.lifecycle.includes("installed"), false);
  assert.ok(s.current_state.some((l) => l.startsWith("branch ")));
  assert.ok(s.current_state.some((l) => /TOOLKIT|CONVERGED|GATEWAY/.test(l)));
});

test("a summary built from canonical state validates", () => {
  const s = ST.collectCanonicalState({ worktreePath: process.cwd() });
  const r = S.validateTurnSummary({
    status: "PARTIAL",
    what_changed: ["Implemented canonical state collection."],
    current_state: s.current_state,
    lifecycle: s.lifecycle,
    verified: ["tested: this assertion"],
    remaining: ["Install promoted staging."],
    next_automatic_action: "Converge once the install is cleared.",
  });
  assert.deepEqual(r.errors, []);
});

/* ── Part 11: the five-line form ─────────────────────────────────────────── */

test("the concise form answers the five questions and nothing else", () => {
  const out = S.formatTurnSummaryConcise({
    status: "PARTIAL",
    what_changed: ["Added drift detection.", "Registered the install action."],
    lifecycle: ["implemented", "committed"],
    remaining: ["Install promoted staging."],
    blocker: { what: "Install denied by the permission classifier.", owner: "operator", clearing_action: "Approve it." },
    director_action: "Approve the install.",
  });
  const lines = out.split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^PARTIAL — 2 changes/);
  assert.match(lines[2], /^Live: committed, not pushed/);
  assert.match(lines[4], /^You needed: Approve the install\./);
});

test("the concise form says no when the Director is not needed", () => {
  const out = S.formatTurnSummaryConcise({
    status: "COMPLETE", what_changed: ["One thing."], lifecycle: [...S.LIFECYCLE_STAGES], remaining: [],
  });
  assert.match(out, /Live: live-certified/);
  assert.match(out, /You needed: no/);
  assert.match(out, /Remaining: nothing/);
});
