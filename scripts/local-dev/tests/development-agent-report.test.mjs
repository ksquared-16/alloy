#!/usr/bin/env node
/**
 * Structured agent reports own the conversation.
 *
 * The Gateway used to show raw tmux pane text as the assistant message. A pane
 * capture is a bounded window onto a terminal: truncated by construction, it
 * scrolls, and it holds the PREVIOUS turn until the next one pushes it out.
 * Every failure this suite pins down came from treating that as a message —
 * a completion that vanished on the next poll, a "Complete" notification with
 * no final answer behind it, and a copy button that yielded whatever happened
 * to be on screen.
 *
 * The laws certified here:
 *   - progress updates the message and never completes the run;
 *   - needs-input stores the WHOLE question and survives new terminal output;
 *   - a completion is atomic: message durable first, COMPLETE second, notify
 *     third — there is no state where the notification exists and the message
 *     does not;
 *   - a long Markdown completion is byte-identical from CLI to clipboard;
 *   - terminal output cannot replace a stored final message;
 *   - knowing a run id is not authority.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_DEV = join(HERE, "..");
const ROOT = mkdtempSync(join(tmpdir(), "vac-agent-report-"));
const WT = mkdtempSync(join(tmpdir(), "vac-agent-report-wt-"));
const OTHER_WT = mkdtempSync(join(tmpdir(), "vac-agent-report-other-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "0";

const {
  createQueuedRun,
  getExecutionRun,
  publicExecutionRun,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} = await import("../lib/vacilando/execution-run.mjs");
const {
  AGENT_REPORT_MESSAGE_MAX,
  AGENT_REPORT_TYPES,
  currentAgentReport,
  agentReportsForRun,
  normalizeReportType,
  submitAgentReport,
} = await import("../lib/vacilando/execution-run-report.mjs");
const { assistantMessageSource, copyableOutputText, copySourcePlan, renderAssistantMessage, renderReportMarkdown, renderGatewayShell, renderTerminalDiagnostics, transcriptResponse } =
  await import("../apps/vacilando/public/gateway-view.mjs");
const { outcomePushPayload, pushRunOutcome, savePushSubscription } = await import("../lib/vacilando/lane-push.mjs");

const LANE = "alloy-identity";

/** A realistic final summary: paragraphs, headings, bullets, a table, code, blockers. */
const LONG_COMPLETION = [
  "# Structured agent reports — final report",
  "",
  "The conversation is no longer a terminal capture. What follows is the shape",
  "of message the contract must carry without losing a byte.",
  "",
  "## What changed",
  "",
  "- the assistant message is a **stored report**, bound to one run",
  "- the terminal keeps receipt, readiness, liveness and debugging",
  "- `vac run-report` takes the message from a file or stdin",
  "",
  "## Result",
  "",
  "| Surface | Before | After |",
  "|---|---|---|",
  "| Assistant bubble | bounded pane capture | stored report message |",
  "| Copy | whatever was on screen | the exact stored message |",
  "",
  "## Commits",
  "",
  "```",
  "9aa1cb544  chat-only lane page",
  "8bc48c55c  unclip the reply",
  "```",
  "",
  "Shell-hostile characters that must survive: $HOME, \"quotes\", 'single',",
  "backticks, semicolons; pipes | and a trailing backslash \\",
  "",
  "## Tests",
  "",
  "| Suite | Result |",
  "|---|---|",
  "| development-agent-report | 17/17 |",
  "| development-gateway-mobile-chat | 14/14 |",
  "| development-gateway-ui | 72/72 |",
  "| run-execution-durability-tests | 7/7 |",
  "",
  "Every one of those ran against the same store this message is written to, so",
  "a truncation anywhere between the CLI and the clipboard would have shown up",
  "as a failing assertion rather than as a quietly shortened paragraph. That is",
  "the point of using a realistic fixture instead of a short string: a bound at",
  "2,000 characters is invisible to a two-line test and fatal to a real report.",
  "",
  "## Remaining blockers",
  "",
  "1. The toolkit copy is not under version control, so `alloy-toolkit install`",
  "   would revert the running Gateway until this branch merges.",
  "2. Nothing else — closing on this run.",
].join("\n");

function newRun({ state = "EXECUTING", instruction = "do the work" } = {}) {
  const created = createQueuedRun({ laneId: LANE, instruction, worktreePath: WT, root: ROOT });
  assert.equal(created.ok, true);
  if (state !== "QUEUED") transitionExecutionRun(created.run.run_id, state, { root: ROOT });
  return getExecutionRun(created.run.run_id, ROOT);
}

const report = (runId, opts) => submitAgentReport(runId, { cwd: WT, laneId: LANE, root: ROOT, ...opts });

let pass = 0;
let fail = 0;
function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
  try {
    fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

// ------------------------------------------------------------ 1. the owner --

test("one canonical owner, four report types, stored on the run itself", () => {
  assert.deepEqual([...AGENT_REPORT_TYPES], ["progress", "needs_input", "completion", "failure"]);
  assert.equal(normalizeReportType("needs-input"), "needs_input");
  assert.equal(normalizeReportType("complete"), "completion");
  assert.equal(normalizeReportType("nonsense"), null);
  // No second run store: the report lives on the Execution Run record.
  const run = newRun();
  const out = report(run.run_id, { type: "progress", message: "working on it" });
  assert.equal(out.ok, true);
  const stored = getExecutionRun(run.run_id, ROOT);
  assert.equal(stored.agent_report.message, "working on it");
  assert.equal(stored.agent_report.run_id, run.run_id);
  assert.equal(stored.agent_report.lane_id, run.lane_id);
  assert.ok(stored.agent_report.at);
  assert.equal(publicExecutionRun(stored).agent_report.message, "working on it");
});

// --------------------------------------------------------------------- 2. --

test("progress updates the assistant message and never completes the run", () => {
  const run = newRun();
  const first = report(run.run_id, { type: "progress", message: "Reading the store", phase: "survey" });
  assert.equal(first.ok, true);
  assert.equal(first.report.revision, 1);
  assert.equal(first.report.phase, "survey");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING", "progress must not terminalize");

  const second = report(run.run_id, { type: "progress", message: "Wiring the UI" });
  assert.equal(second.report.revision, 2);
  const now = getExecutionRun(run.run_id, ROOT);
  assert.equal(now.agent_report.message, "Wiring the UI");
  assert.equal(now.state, "EXECUTING");
  // Liveness advanced, so a reporting agent is never read as an abandoned one.
  assert.ok(now.last_worker_report_at);
  assert.ok(now.worker_report_count >= 2);
  // History survives so a refresh can still show how the work got here.
  assert.equal(agentReportsForRun(now).history.length, 2);
  assert.equal(agentReportsForRun(now).current.message, "Wiring the UI");

  // An older revision is refused outright.
  const stale = report(run.run_id, { type: "progress", message: "backwards", revision: 1 });
  assert.equal(stale.ok, false);
  assert.equal(stale.error, "stale_revision");
  assert.equal(getExecutionRun(run.run_id, ROOT).agent_report.message, "Wiring the UI");
});

test("with no report yet the conversation shows Working, never terminal text", () => {
  const run = newRun();
  const lane = { lane_id: LANE, execution_run: publicExecutionRun(run) };
  const src = assistantMessageSource(lane, { outputText: "❯ some raw TUI chrome · esc to interrupt" });
  assert.equal(src.kind, "working");
  assert.equal(src.terminal, false);
  const html = renderAssistantMessage(src);
  assert.match(html, /Working/);
  assert.equal(html.includes("esc to interrupt"), false);
  assert.equal(html.includes("TUI chrome"), false);
});

// --------------------------------------------------------------------- 3. --

test("needs-input stores the whole question and drives the canonical path", () => {
  const run = newRun();
  const question = [
    "Two ways to model a stale capacity claim, and they differ in what the",
    "operator can undo:",
    "",
    "1. Cancel the admission (reversible by re-queueing).",
    "2. Fail the run as well (records why, not just that).",
    "",
    "Which do you want as the default?",
  ].join("\n");
  const out = report(run.run_id, {
    type: "needs_input",
    message: question,
    reason: "Both are defensible; the choice is yours.",
    choices: ["Cancel only", { label: "Cancel and fail", detail: "records the reason" }],
  });
  assert.equal(out.ok, true);
  assert.equal(out.transition, "NEEDS_INPUT");
  const stored = getExecutionRun(run.run_id, ROOT);
  assert.equal(stored.state, "NEEDS_INPUT");
  assert.equal(stored.agent_report.message, question, "the COMPLETE question, not a first line");
  assert.equal(stored.agent_report.blocking, true);
  assert.equal(stored.agent_report.choices.length, 2);
  assert.equal(stored.agent_report.choices[1].detail, "records the reason");

  // The notification carries the agent's own words, not a state name.
  const payload = outcomePushPayload({
    lane_id: LANE, title: "Vacilando", state: "NEEDS_INPUT", reason: stored.agent_report.message.split("\n")[0],
  });
  assert.match(payload.body, /Two ways to model/);
  assert.equal(payload.type, "execution_run.needs_input");

  // New terminal output cannot lose the question.
  const lane = { lane_id: LANE, execution_run: publicExecutionRun(stored) };
  const src = assistantMessageSource(lane, { outputText: "❯ totally different pane content now" });
  assert.equal(src.kind, "report");
  assert.equal(src.text, question);
});

test("a non-blocking question is a note: the run keeps working", () => {
  const run = newRun();
  const out = report(run.run_id, { type: "needs_input", message: "FYI: two options exist.", blocking: false });
  assert.equal(out.ok, true);
  assert.equal(out.transition, null);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING");
  assert.equal(getExecutionRun(run.run_id, ROOT).agent_report.blocking, false);
});

test("an operator reply continues the same run", async () => {
  const run = newRun();
  report(run.run_id, { type: "needs_input", message: "Which default do you want?" });
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "NEEDS_INPUT");

  const { deliverManagedLaneInstruction } = await import("../lib/vacilando/execution-run-send.mjs");
  const out = await deliverManagedLaneInstruction(LANE, "Cancel and fail, please", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: async (laneId, instruction) => ({
      ok: true, status: "delivered", lane_id: laneId, delivered_at: new Date().toISOString(),
      instruction_size: instruction.length, worktree_path: WT,
    }),
    getOutput: async () => ({ ok: true, text: "", fingerprint: "fp", captured_at: new Date().toISOString() }),
    notifyIntervalMs: 60_000,
  });
  assert.equal(out.ok, true);
  assert.equal(out.run_id, run.run_id, "the reply continues the SAME run, it does not open a new one");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING");
  // The question stays readable until the agent replaces it with its next report.
  assert.match(getExecutionRun(run.run_id, ROOT).agent_report.message, /Which default/);
});

// --------------------------------------------------------------------- 4. --

test("a completion is atomic: message durable, then COMPLETE", () => {
  const run = newRun();
  const out = report(run.run_id, {
    type: "completion",
    message: LONG_COMPLETION,
    result: { commits: ["9aa1cb544", "8bc48c55c"], tests: "93 passing", blockers: "toolkit copy untracked" },
  });
  assert.equal(out.ok, true);
  assert.equal(out.transition, "COMPLETE");
  const stored = getExecutionRun(run.run_id, ROOT);
  assert.equal(stored.state, "COMPLETE");
  assert.equal(stored.agent_report.message, LONG_COMPLETION);
  assert.equal(stored.agent_report.type, "completion");
  assert.deepEqual(stored.agent_report.result.commits, ["9aa1cb544", "8bc48c55c"]);
  // The bounded row summary is a SEPARATE field; it never shortens the message.
  assert.ok(stored.completion_report.summary.length < LONG_COMPLETION.length);
  assert.equal(stored.completion_report.report_id, stored.agent_report.report_id);

  // Duplicate submission is a no-op, not a second completion or notification.
  const again = report(run.run_id, { type: "completion", message: LONG_COMPLETION, revision: out.report.revision });
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  assert.equal(getExecutionRun(run.run_id, ROOT).agent_report.message, LONG_COMPLETION);
});

test("a Complete notification cannot exist without its final message", async () => {
  const run = newRun();
  report(run.run_id, { type: "completion", message: LONG_COMPLETION });
  savePushSubscription({ endpoint: "https://push.example/x", keys: { p256dh: "p", auth: "s" } }, { root: ROOT });

  const withMessage = getExecutionRun(run.run_id, ROOT);
  const sent = [];
  const ok = await pushRunOutcome(withMessage, { root: ROOT, send: async (_s, p) => { sent.push(p); } });
  assert.equal(ok.sent, 1, "a completion with its message notifies");

  // Same run, message somehow absent: the notification is withheld rather than
  // promising the operator something they cannot read.
  const withoutMessage = { ...withMessage, run_id: "erun_missingmessage", agent_report: null };
  const held = await pushRunOutcome(withoutMessage, { root: ROOT, send: async () => { throw new Error("must not send"); } });
  assert.equal(held.sent, 0);
  assert.equal(held.skipped, "report_not_durable");
});

test("a failure report explains itself and takes the canonical FAILED path", () => {
  const run = newRun();
  const message = [
    "## Could not complete",
    "",
    "`npm run build` failed on a missing environment variable.",
    "",
    "**Next step:** set `RESEND_API_KEY` in the worktree env and resend.",
  ].join("\n");
  const out = report(run.run_id, { type: "failure", message, reason: "build_failed" });
  assert.equal(out.ok, true);
  assert.equal(out.transition, "FAILED");
  const stored = getExecutionRun(run.run_id, ROOT);
  assert.equal(stored.state, "FAILED");
  assert.equal(stored.agent_report.message, message, "the complete explanation, with the recovery step");
  assert.match(stored.agent_report.message, /Next step/);
});

test("stale progress is never shown as the final result", () => {
  const run = newRun();
  report(run.run_id, { type: "progress", message: "halfway through" });
  report(run.run_id, { type: "failure", message: "Could not finish: the broker refused." });
  const stored = getExecutionRun(run.run_id, ROOT);
  const lane = { lane_id: LANE, execution_run: publicExecutionRun(stored) };
  const src = assistantMessageSource(lane, {});
  assert.equal(src.report.type, "failure");
  assert.match(src.text, /Could not finish/);
});

// --------------------------------------------------------------------- 5. --

test("a long Markdown completion is byte-identical from CLI to clipboard", () => {
  const run = newRun();
  const file = join(ROOT, "final.md");
  writeFileSync(file, LONG_COMPLETION, "utf8");

  // Through the real CLI, message from a file — no shell quoting anywhere.
  const stdout = execFileSync(process.execPath, [
    join(LOCAL_DEV, "vac-run-report.mjs"), run.run_id, "completion",
    "--message-file", file, "--lane", LANE,
  ], { cwd: WT, env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT }, encoding: "utf8" });
  assert.match(stdout, /completion rev=\d+/);
  assert.match(stdout, /-> COMPLETE/);

  const bytes = Buffer.byteLength(LONG_COMPLETION, "utf8");
  assert.ok(bytes > 900, "the fixture must be long enough to expose a bound");

  // storage
  const stored = getExecutionRun(run.run_id, ROOT);
  assert.equal(stored.agent_report.message, LONG_COMPLETION);
  assert.equal(stored.agent_report.message_bytes, bytes);
  // re-read from disk (poll / PWA restart)
  assert.equal(getExecutionRun(run.run_id, ROOT).agent_report.message, LONG_COMPLETION);
  // API projection
  const projected = publicExecutionRun(stored, { includeInstruction: true });
  assert.equal(projected.agent_report.message, LONG_COMPLETION);
  // JSON serialization over the wire
  assert.equal(JSON.parse(JSON.stringify(projected)).agent_report.message, LONG_COMPLETION);
  // clipboard source
  const lane = { lane_id: LANE, execution_run: projected };
  assert.equal(copyableOutputText({ selectedId: LANE, output: { mode: "recent", text: "tiny pane" }, lane }), LONG_COMPLETION);
  assert.equal(copySourcePlan({ mode: "recent", truncated: true }, { lane }).needsFetch, false);
  // rendering keeps every structural element
  const html = renderAssistantMessage(assistantMessageSource(lane, {}));
  for (const fragment of ["final report", "stored report", "Assistant bubble", "9aa1cb544", "Remaining blockers", "toolkit copy"]) {
    assert.ok(html.includes(fragment), `rendered message lost: ${fragment}`);
  }
  assert.match(html, /<table class="gw-md-table">/);
  assert.match(html, /<pre class="gw-md-code">/);
  // and the message is far larger than the summary bound it used to be squeezed through
  assert.ok(bytes > 2000 || stored.completion_report.summary.length < bytes);
  assert.ok(AGENT_REPORT_MESSAGE_MAX >= 256 * 1024);
});

test("hard-wrapped source lines are one paragraph, as in Markdown", () => {
  // Emitting a <p> per source line put a gap through the middle of every
  // wrapped sentence — prose rendered as if it were broken.
  const html = renderReportMarkdown("Line one of a wrapped\nsentence that continues here.\n\nA second paragraph.");
  assert.equal((html.match(/<p class="gw-md-p">/g) || []).length, 2);
  assert.match(html, /<p class="gw-md-p">Line one of a wrapped sentence that continues here\.<\/p>/);
  // Structure still breaks a paragraph.
  const mixed = renderReportMarkdown("intro line\n- bullet\n\n## Heading\ntail");
  assert.match(mixed, /<p class="gw-md-p">intro line<\/p>/);
  assert.match(mixed, /<li>bullet<\/li>/);
  assert.match(mixed, /<h3 class="gw-md-h">Heading<\/h3>/);
  assert.match(mixed, /<p class="gw-md-p">tail<\/p>/);
});

test("a status-only lane still shows its summary — never an empty bubble", () => {
  // REGRESSION. When the conversation moved to structured reports, every lane
  // that had not adopted `vac run-report` rendered "No agent report on this run
  // yet". Observed live: the Runtime Performance lane sat at NEEDS_INPUT with a
  // real summary AND its blocking question in the store, and showed nothing.
  const run = newRun();
  transitionExecutionRun(run.run_id, "NEEDS_INPUT", {
    root: ROOT,
    origin: "agent",
    reason: "PR 495 open, 9/9 CI pass; merge not authorized by this instruction",
    progress: "Promotion complete to the merge authorization boundary",
    completion_report: { summary: "Promotion complete to the merge authorization boundary" },
  });
  const stored = publicExecutionRun(getExecutionRun(run.run_id, ROOT));
  assert.equal(stored.agent_report, null, "this lane never sent a structured report");

  const lane = { lane_id: LANE, label: "Runtime Performance", execution_run: stored };
  const src = assistantMessageSource(lane, { outputText: "❯ raw pane chrome" });
  assert.equal(src.kind, "status");
  assert.equal(src.report.type, "needs_input");
  // The reason comes FIRST: for NEEDS_INPUT it is the question the operator
  // has to answer.
  assert.match(src.text, /^PR 495 open/);
  assert.match(src.text, /Promotion complete to the merge authorization boundary/);
  // Deduplicated: latest_progress and completion_report carry the same string.
  assert.equal((src.text.match(/Promotion complete/g) || []).length, 1);
  assert.equal(src.text.includes("raw pane chrome"), false, "still never the pane");

  const html = renderAssistantMessage(src);
  assert.match(html, /data-report-source="status"/);
  assert.match(html, /status summary/);
  assert.match(html, /vac run-status/);
  assert.match(html, /Full terminal output is under Details/);
  assert.match(html, /PR 495 open/);

  // No structured facts at all is the ONLY empty case, and even it routes the
  // operator to the terminal instead of dead-ending.
  const bare = assistantMessageSource({ lane_id: LANE, execution_run: null }, {});
  assert.equal(bare.kind, "none");
  assert.match(renderAssistantMessage(bare), /Raw terminal output is under Details/);
});

test("no terminal state can render an empty assistant message", () => {
  // The law, stated once: if a run stopped, the operator is told why.
  for (const [state, opts] of [
    ["COMPLETE", { completion_report: { summary: "Shipped and verified" } }],
    ["FAILED", { reason: "build_failed" }],
    ["NEEDS_INPUT", { reason: "Which default do you want?" }],
  ]) {
    const run = newRun();
    transitionExecutionRun(run.run_id, state, { root: ROOT, origin: "agent", ...opts });
    const lane = { lane_id: LANE, execution_run: publicExecutionRun(getExecutionRun(run.run_id, ROOT)) };
    const src = assistantMessageSource(lane, {});
    assert.equal(src.kind, "status", `${state} must not fall through to an empty bubble`);
    assert.ok(src.text.trim().length > 0, `${state} rendered nothing`);
  }
});

test("a lane without run-report shows the agent's transcript message, not a one-liner", () => {
  // THE ACTUAL COMPLAINT. The Runtime Performance lane reported a 90-character
  // string through `vac run-status` while its real 2,862-character summary sat
  // in the session transcript. The operator asked for the summary; the bounded
  // status line is not it.
  const run = newRun();
  transitionExecutionRun(run.run_id, "NEEDS_INPUT", {
    root: ROOT, origin: "agent",
    reason: "merge not authorized by this instruction",
    completion_report: { summary: "Promotion complete to the merge authorization boundary" },
  });
  const lane = { lane_id: LANE, execution_run: publicExecutionRun(getExecutionRun(run.run_id, ROOT)) };
  const transcript = [
    "Promotion is complete to the merge authorization boundary.",
    "",
    "## PR #495",
    "",
    "| Field | Value |",
    "|---|---|",
    "| CI | 9/9 pass |",
    "",
    "**I did not merge** — the instruction ended at opening the PR.",
  ].join("\n");
  const latest = {
    ok: true, available: true, mode: "latest_response",
    source: "claude_code_session_transcript", lane_id: LANE,
    text: transcript, truncated: false, captured_at: "2026-08-22T16:16:32.746Z",
  };

  const src = assistantMessageSource(lane, { latestResponse: latest, outputText: "❯ raw pane" });
  assert.equal(src.kind, "transcript");
  assert.equal(src.text, transcript, "the whole message, verbatim");
  // The point of the fix: the operator gets the message, not the one-liner.
  const statusOnly = assistantMessageSource(lane, {}).text;
  assert.ok(src.text.length > statusOnly.length * 1.5, "the transcript message must beat the status summary");

  const html = renderAssistantMessage(src);
  assert.match(html, /data-report-source="transcript"/);
  assert.match(html, /session transcript/);
  assert.match(html, /vac run-report/);
  assert.match(html, /I did not merge/);
  assert.match(html, /<table class="gw-md-table">/);
  assert.equal(html.includes("raw pane"), false);

  // A pane capture is NOT a transcript, whatever mode it claims.
  assert.equal(transcriptResponse({ ok: true, mode: "recent", text: "pane", source: "tmux_pane" }), null);
  assert.equal(transcriptResponse({ ok: true, mode: "latest_response", available: false, text: "" }), null);
  assert.equal(transcriptResponse({ ok: false, mode: "latest_response", text: "x" }), null);
  assert.equal(transcriptResponse({ ok: true, mode: "latest_response", source: "tmux_pane", text: "x" }), null);

  // With no transcript it still falls back to the status summary, never empty.
  assert.equal(assistantMessageSource(lane, {}).kind, "status");
});

test("a structured report always outranks the status summary and the transcript", () => {
  const run = newRun();
  transitionExecutionRun(run.run_id, "EXECUTING", { root: ROOT, origin: "agent", progress: "bounded one-liner" });
  report(run.run_id, { type: "progress", message: "The full agent message." });
  const lane = { lane_id: LANE, execution_run: publicExecutionRun(getExecutionRun(run.run_id, ROOT)) };
  const latest = { ok: true, available: true, mode: "latest_response", source: "claude_code_session_transcript", lane_id: LANE, text: "an older transcript turn" };
  const src = assistantMessageSource(lane, { latestResponse: latest });
  assert.equal(src.kind, "report", "the structured report is authoritative");
  assert.equal(src.text, "The full agent message.");
});

test("markdown is escaped before it is marked up", () => {
  const html = renderReportMarkdown("<script>alert(1)</script>\n\n- **bold** and `code`");
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
});

// --------------------------------------------------------------------- 6. --

test("terminal output cannot replace a stored final message", () => {
  const run = newRun();
  report(run.run_id, { type: "completion", message: LONG_COMPLETION });
  const stored = publicExecutionRun(getExecutionRun(run.run_id, ROOT));
  const lane = { lane_id: LANE, label: "Vacilando", execution_run: null, previous_run: stored, claude: { presence: "present" } };

  // A newer pane full of prompt chrome, an update banner and an OLD completion.
  const hostilePane = [
    "✔ Update installed · Restart to update",
    "⏺ Both [object Object] hits are my own instruction text",
    "❯",
    "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt",
  ].join("\n");

  const src = assistantMessageSource(lane, { outputText: hostilePane });
  assert.equal(src.kind, "report");
  assert.equal(src.text, LONG_COMPLETION);
  assert.equal(copyableOutputText({ selectedId: LANE, output: { text: hostilePane }, lane }), LONG_COMPLETION);

  const shell = renderGatewayShell({ lanes: [lane], selectedId: LANE, lane, outputText: hostilePane, listReady: true });
  // The pane is present ONLY as labelled diagnostics, inside the details panel.
  const paneIdx = shell.indexOf("Update installed");
  const panelIdx = shell.indexOf('id="gw-details-panel"');
  const threadEnd = shell.indexOf("data-gw-composer");
  assert.ok(paneIdx > panelIdx, "raw pane text must live in the details panel");
  assert.ok(paneIdx > threadEnd, "raw pane text must not be in the conversation");
  assert.match(shell, /data-gw-message-source="report"/);
  const diag = renderTerminalDiagnostics(hostilePane, { output: { truncated: true } });
  assert.match(diag, /diagnostic/);
  assert.match(diag, /Not the assistant's response/);
});

// --------------------------------------------------------------------- 7. --

test("knowing a run id is not authority", () => {
  const run = newRun();
  assert.equal(submitAgentReport(run.run_id, { type: "progress", message: "x", cwd: OTHER_WT, laneId: LANE, root: ROOT }).error, "worktree_mismatch");
  assert.equal(submitAgentReport(run.run_id, { type: "progress", message: "x", cwd: WT, laneId: "alloy-other-lane", root: ROOT }).error, "lane_mismatch");
  assert.equal(submitAgentReport("erun_doesnotexist", { type: "progress", message: "x", cwd: WT, root: ROOT }).error, "run_not_found");
  assert.equal(report(run.run_id, { type: "progress", message: "   " }).error, "message_empty");
  assert.equal(report(run.run_id, { type: "wat", message: "x" }).error, "invalid_report_type");
  const huge = "x".repeat(AGENT_REPORT_MESSAGE_MAX + 1);
  assert.equal(report(run.run_id, { type: "progress", message: huge }).error, "message_too_large");
  // A finished run does not get a new story.
  report(run.run_id, { type: "completion", message: LONG_COMPLETION });
  assert.equal(report(run.run_id, { type: "progress", message: "late" }).error, "run_already_terminal");
});

test("the CLI refuses a report from the wrong worktree", () => {
  const run = newRun();
  let code = 0;
  try {
    execFileSync(process.execPath, [
      join(LOCAL_DEV, "vac-run-report.mjs"), run.run_id, "progress", "--message", "from elsewhere", "--lane", LANE,
    ], { cwd: OTHER_WT, env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT }, encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    code = e.status;
    assert.match(String(e.stderr), /worktree_mismatch/);
  }
  assert.equal(code, 4);
  assert.equal(getExecutionRun(run.run_id, ROOT).agent_report, null);
});

test("the CLI takes multiline Markdown from stdin without shell corruption", () => {
  const run = newRun();
  const stdout = execFileSync(process.execPath, [
    join(LOCAL_DEV, "vac-run-report.mjs"), run.run_id, "progress", "--message-file", "-", "--lane", LANE,
  ], { cwd: WT, env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT }, input: LONG_COMPLETION, encoding: "utf8" });
  assert.match(stdout, /progress rev=1/);
  assert.equal(getExecutionRun(run.run_id, ROOT).agent_report.message, LONG_COMPLETION);
});

test("the vac dispatcher exposes run-report", () => {
  const vac = readFileSync(join(LOCAL_DEV, "vac"), "utf8");
  assert.match(vac, /run-report\)/);
  assert.match(vac, /vac-run-report\.mjs/);
  assert.match(vac, /vac run-report <run_id> <type>/);
});

process.stdout.write(`\n1..${pass + fail}\npass ${pass}\nfail ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
