/**
 * Decision Delivery V1.
 *
 * One product rule, tested from both ends: if Vacilando says work is blocked on
 * a human decision, that decision must be actionable in Vacilando — and if it
 * is not a real decision, Vacilando must not claim it is.
 *
 * The prompt half is a security boundary. The allowlist IS the safety property,
 * so most of what follows is about what must NOT be auto-answered.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const A = await import("../lib/vacilando/provider-prompt-authority.mjs");
const AD = await import("../lib/vacilando/provider-prompt-adapter.mjs");
const D = await import("../lib/vacilando/operator-decisions.mjs");
const RD = await import("../lib/vacilando/provider-prompt-readiness.mjs");

const root = () => mkdtempSync(join(tmpdir(), "decdel-"));

/** The real pane captured from the blocked Trust Runtime session. */
const REAL_PANE = `
⏺ Listing toolkit commands
  ⎿  $ ls /Users/Kelly/.local/share/alloy/toolkit/3c07d1074460/

────────────────────────────────────────────────────────────────
 Bash command

   ls /Users/Kelly/.local/share/alloy/toolkit/3c07d1074460/
   List toolkit commands

 │ Auto mode classifier requires confirmation for this command.
 │ 3 consecutive actions were blocked. Please review the transcript before
 │ continuing.

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, allow reading from
      /Users/Kelly/.local/share/alloy/toolkit/3c07d1074460 from this project
   3. No

 Esc to cancel · Tab to amend · ctrl+e to explain
`;

const paneFor = (command, opts = "") => `
 Bash command

   ${command}
   some description

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and don't ask again for this project${opts}
   3. No
`;

/* ── The live case ────────────────────────────────────────────────────────── */

await test("the real Trust Runtime prompt is routine and auto-answerable", () => {
  const c = A.classifyProviderPrompt({ paneText: REAL_PANE, sessionId: "%16", runId: "erun_x" });
  assert.equal(c.classification, "routine_tool_permission");
  assert.equal(c.auto_answerable, true);
  assert.equal(c.requested.command, "ls /Users/Kelly/.local/share/alloy/toolkit/3c07d1074460/");
  assert.match(c.authority, /instructed Vacilando path/);
});

await test("NC-perm — permission is no longer an operator-terminal blocker", () => {
  // The precise line that produced "answer it in the agent's terminal" for an ls.
  assert.ok(!RD.OPERATOR_TERMINAL_BLOCKERS.includes("permission"));
  assert.ok(RD.ADAPTER_OWNED_BLOCKERS.includes("permission"));
  assert.equal(RD.promptBlockNeedsTerminalOperator({ state: "blocked", blocker: { kind: "permission" } }), false);
  assert.equal(RD.promptBlockIsAdapterOwned({ state: "blocked", blocker: { kind: "permission" } }), true);
  // Genuine provider-account state still belongs to a person.
  for (const kind of ["onboarding", "login", "trust"]) {
    assert.equal(RD.promptBlockNeedsTerminalOperator({ state: "blocked", blocker: { kind } }), true, kind);
  }
});

await test("the narrowest affirmative is chosen, never the permission-widening one", () => {
  const opt = A.affirmativeOption(REAL_PANE);
  assert.equal(opt.option, 1);
  assert.equal(opt.label, "Yes");
  assert.equal(opt.widens_permissions, false);
});

/* ── NEGATIVE CONTROLS ────────────────────────────────────────────────────── */

await test("NC1 — a routine prompt cannot bypass Vacilando authority: reads outside instructed paths refuse", () => {
  const c = A.classifyProviderPrompt({ paneText: paneFor("ls /Users/Kelly/Documents/private") });
  assert.equal(c.classification, "unsafe_or_unknown_provider_prompt");
  assert.equal(c.auto_answerable, false);
  assert.match(c.reason, /did not instruct/);
});

await test("NC3 — an operator-capability request is never auto-answered", () => {
  for (const cmd of [
    "git push origin main",
    "gh pr merge 591",
    "git push --delete origin agent/x",
    "docker stop alloy-cert",
    "psql -c 'drop table users'",
    "git worktree remove /Users/Kelly/Code/alloy-worktrees/wt1-x",
  ]) {
    const c = A.classifyProviderPrompt({ paneText: paneFor(cmd) });
    assert.equal(c.auto_answerable, false, cmd);
    assert.ok(["governed_operator_decision", "unsafe_or_unknown_provider_prompt"].includes(c.classification), cmd);
  }
});

await test("NC3b — an ALREADY-authorized governed capability is still not adapter business", () => {
  // Having authority to push does not make a raw terminal prompt the place to
  // exercise it. The governed flow answers; the adapter never guesses.
  const c = A.classifyProviderPrompt({
    paneText: paneFor("git push origin agent/x"),
    authorizedCapabilities: ["repository.push"],
  });
  assert.equal(c.classification, "governed_operator_decision");
  assert.equal(c.auto_answerable, false);
  assert.equal(c.already_authorized, true);
});

await test("NC4 — an unknown or unparseable prompt is never auto-answered", () => {
  for (const pane of ["Do you want to proceed?\n 1. Yes\n 2. No", "", "something entirely unexpected"]) {
    const c = A.classifyProviderPrompt({ paneText: pane });
    assert.equal(c.auto_answerable, false);
  }
});

await test("NC4b — shell composition defeats the read-only allowlist", () => {
  for (const cmd of [
    "ls /Users/Kelly/Alloy && rm -rf /tmp/x",
    "cat /Users/Kelly/Alloy/x; curl http://evil",
    "ls $(whoami)",
    "ls /Users/Kelly/Alloy > /etc/passwd",
    "sudo ls /Users/Kelly/Alloy",
  ]) {
    const c = A.classifyProviderPrompt({ paneText: paneFor(cmd) });
    assert.equal(c.auto_answerable, false, cmd);
    assert.equal(c.classification, "unsafe_or_unknown_provider_prompt", cmd);
  }
});

await test("NC5 — a stale prompt answer is refused", () => {
  const r = root();
  const expect = A.classifyProviderPrompt({ paneText: REAL_PANE, sessionId: "%16", runId: "erun_x" });
  // The pane moved on to a different question before the answer landed.
  const out = AD.answerProviderPrompt({
    root: r, target: "%16", expect, sessionId: "%16", runId: "erun_x",
    capture: () => paneFor("cat /Users/Kelly/Alloy/README.md"),
    sendKeys: () => { throw new Error("must not send"); },
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "stale_provider_prompt");
});

await test("NC6 — an answer minted for run A cannot satisfy run B", () => {
  const a = A.classifyProviderPrompt({ paneText: REAL_PANE, sessionId: "%16", runId: "erun_A" });
  const b = A.classifyProviderPrompt({ paneText: REAL_PANE, sessionId: "%16", runId: "erun_B" });
  assert.notEqual(a.fingerprint, b.fingerprint);
  assert.equal(A.answerMatchesPrompt(a, b), false);
});

await test("NC7 — a provider session mismatch is refused", () => {
  const a = A.classifyProviderPrompt({ paneText: REAL_PANE, sessionId: "%16", runId: "erun_A" });
  const b = A.classifyProviderPrompt({ paneText: REAL_PANE, sessionId: "%99", runId: "erun_A" });
  assert.equal(A.answerMatchesPrompt(a, b), false);
});

await test("NC12 — a Director-approved action cannot fall back to a raw terminal permission", () => {
  // The adapter refuses anything that is not the routine class, so a governed
  // decision can never be resolved by typing into a pane.
  const r = root();
  const governed = A.classifyProviderPrompt({ paneText: paneFor("git push origin agent/x") });
  const out = AD.answerProviderPrompt({
    root: r, target: "%16", expect: governed,
    capture: () => paneFor("git push origin agent/x"),
    sendKeys: () => { throw new Error("must not send"); },
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "not_auto_answerable");
});

await test("an authorized routine prompt IS answered, recorded with its authority", () => {
  const r = root();
  const expect = A.classifyProviderPrompt({ paneText: REAL_PANE, sessionId: "%16", runId: "erun_x" });
  const sent = [];
  const out = AD.answerProviderPrompt({
    root: r, target: "%16", expect, sessionId: "%16", runId: "erun_x",
    capture: () => REAL_PANE,
    sendKeys: (t, keys) => { sent.push([t, keys]); return true; },
  });
  assert.equal(out.ok, true);
  assert.deepEqual(sent, [["%16", ["1", "Enter"]]], "the narrow Yes, into the right pane");
  const recorded = AD.listPromptDecisions({ root: r });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].answered_by, "vacilando_adapter");
  assert.match(recorded[0].authority, /lane execution policy/);
});

await test("NC2 — an already-authorized action does not ask the operator at all", () => {
  const surface = AD.operatorPromptSurface(
    A.classifyProviderPrompt({ paneText: REAL_PANE, sessionId: "%16", runId: "erun_x" }),
  );
  // Routine prompts never reach the operator surface as a decision.
  const c = A.classifyProviderPrompt({ paneText: REAL_PANE });
  assert.equal(c.auto_answerable, true);
  assert.ok(surface.actionable_in_vacilando, "and if it ever did, it would still be actionable here, not in tmux");
});

await test("an unknown prompt is surfaced in Vacilando, never as 'go to the terminal'", () => {
  const c = A.classifyProviderPrompt({ paneText: paneFor("ls /Users/Kelly/Documents/private") });
  const s = AD.operatorPromptSurface(c, { laneName: "Trust Runtime", workTitle: "Real Enrollment" });
  assert.equal(s.actionable_in_vacilando, true);
  assert.ok(s.provider_prompt);
  assert.ok(s.why_not_automatic);
  assert.equal(JSON.stringify(s).toLowerCase().includes("tmux"), false);
  assert.equal(JSON.stringify(s).toLowerCase().includes("terminal"), false);
});

/* ── PART B: the awaiting_operator invariant ──────────────────────────────── */

const action = (over = {}) => ({ request_id: "gar_1", action_key: "repository.merge_pull_request", lane_id: "lane_a", status: "awaiting_operator", ...over });

await test("NC9 — awaiting_operator with no global decision is detected", () => {
  const out = D.reconcileOperatorDecisions({ governedActions: [action()], projected: [] });
  assert.equal(out.consistent, false);
  assert.equal(out.violations[0].kind, "pending_decision_not_projected");
});

await test("NC10 — a projected decision with no canonical action is detected", () => {
  const out = D.reconcileOperatorDecisions({ governedActions: [], projected: [{ request_id: "gar_ghost" }] });
  assert.equal(out.violations[0].kind, "projected_decision_without_action");
});

await test("NC11 — a failed governed action cannot render Approve/Deny", () => {
  const out = D.reconcileOperatorDecisions({
    governedActions: [action({ status: "failed" })], projected: [{ request_id: "gar_1" }],
  });
  assert.ok(out.violations.some((v) => v.kind === "projected_decision_is_terminal"));
});

await test("NC8 — a terminal governed action cannot leave a run awaiting_operator", () => {
  const stale = D.staleHumanGates({
    governedActions: [action({ run_id: "erun_1", status: "complete" })],
    runs: [{ run_id: "erun_1", lane_id: "lane_a", state: "NEEDS_INPUT" }],
  });
  assert.equal(stale.length, 1);
  assert.equal(stale[0].instruction, "release_via_canonical_run_wait_reconciliation",
    "released through the canonical path — hand-editing runs is how the last generation of this bug survived");
});

await test("a provider blocked with no decision record is a violation", () => {
  const out = D.reconcileOperatorDecisions({
    governedActions: [], projected: [],
    providerPromptBlocks: [{ lane_id: "lane_trust", session_id: "%16", needs_decision: true, prompt_text: "Do you want to proceed?" }],
  });
  assert.equal(out.violations[0].kind, "provider_prompt_without_decision_record");
});

await test("conflicting live decisions for one exact request are detected", () => {
  const out = D.reconcileOperatorDecisions({
    governedActions: [action({ request_id: "a", content_fingerprint: "f1" }), action({ request_id: "b", content_fingerprint: "f1" })],
    projected: [{ request_id: "a" }, { request_id: "b" }],
  });
  assert.ok(out.violations.some((v) => v.kind === "conflicting_pending_decisions"));
});

await test("a consistent world reports no violations", () => {
  const out = D.reconcileOperatorDecisions({
    governedActions: [action({ run_id: "erun_1" })],
    runs: [{ run_id: "erun_1", lane_id: "lane_a", state: "NEEDS_INPUT" }],
    projected: [{ request_id: "gar_1" }],
  });
  assert.equal(out.consistent, true);
});

await test("NC13 — a TERMINAL run never counts as awaiting the operator", () => {
  // Found on the first live run of this check: it reported five violations
  // against a consistent host, because completed runs keep the state_reason
  // they ended with and several mention an operator. The reason describes what
  // happened, not what is still awaited.
  for (const state of ["COMPLETE", "FAILED", "ABANDONED", "CANCELLED"]) {
    assert.equal(
      D.runClaimsHumanGate({ run_id: "e", state, state_reason: "awaiting operator approval" }),
      false, `${state} must not claim a human gate`,
    );
  }
  assert.equal(D.runClaimsHumanGate({ run_id: "e", state: "NEEDS_INPUT" }), true);
  assert.equal(D.runClaimsHumanGate({ run_id: "e", state: "EXECUTING", state_reason: "waiting on operator approval" }), true);
  // And the same runs must not appear as stale gates needing release.
  assert.equal(D.staleHumanGates({
    governedActions: [{ request_id: "g", run_id: "e", status: "complete" }],
    runs: [{ run_id: "e", state: "COMPLETE", state_reason: "operator approved" }],
  }).length, 0);
});

await test("NC14 — provider→governed bridge failures reach operator.decisions", () => {
  const out = D.reconcileOperatorDecisions({
    governedActions: [], projected: [],
    bridgeViolations: [{ kind: "request_complete_provider_still_blocked", bridge_id: "b1",
      detail: "the governed action completed but the provider was never continued" }],
  });
  assert.equal(out.consistent, false);
  assert.ok(out.violations.some((v) => v.kind === "request_complete_provider_still_blocked"));
});
