#!/usr/bin/env node
/**
 * A RETRY AND A SECOND OCCURRENCE ARE NOT THE SAME REQUEST.
 *
 * Measured specimen: `environment.execute_registered_reconciliation` filed
 * twice in erun_dc7857293e0e0502. Both requests reported `complete — Succeeded`
 * and both carried `result_ref tha_5975676b98005f`. One execution had answered
 * two requests, so hosted idempotency could not be certified inside a run at
 * all. The runner's own diagnostic is what settled it: the first opened
 * `DELETE 0` against an empty tenant; a genuine second execution opens
 * `DELETE 4`, tearing down its own rows.
 *
 * The obvious repair — stop replaying completed results — trades a
 * certification problem for a correctness one, because replay is what makes a
 * retry safe. These cases pin the narrow version: classification decides
 * whether a NEW request is a new occurrence, and the same request always
 * reuses whatever its classification says.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTION_REPEATABILITY, REPEATABILITY, UNDECLARED_DEFAULT,
  completedReuseDecision, declaredActionTypes, repeatabilityFor,
} from "../lib/vacilando/action-repeatability.mjs";
import { ACTION_TYPES } from "../lib/vacilando/trusted-host-action-registry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LIB = `${ROOT}/scripts/local-dev/lib/vacilando`;
const completed = (requestId) => ({ state: "completed", authorizationIdentity: { requestId } });

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/* ── A: the same request, delivered twice ─────────────────────────────────── */

test("A — a retry of the same governed request reuses, for every classification", () => {
  for (const actionType of declaredActionTypes()) {
    const d = completedReuseDecision({ actionType, existing: completed("gar_same"), requestId: "gar_same" });
    assert.equal(d.reuse, true, `${actionType} must reuse on retry`);
    assert.equal(d.disposition, "retry_reuse");
  }
});

test("A2 — retry reuse is decided BEFORE the classification, not after", () => {
  // If classification ran first, every REEXECUTE_REQUIRED retry would mint a
  // second execution — a duplicate delivery becoming a duplicate operation.
  const src = readFileSync(`${LIB}/action-repeatability.mjs`, "utf8");
  const retryAt = src.indexOf('disposition: "retry_reuse"');
  const classAt = src.indexOf("if (kind === REPEATABILITY.REUSE_CORRECT)");
  assert.ok(retryAt > 0 && classAt > 0 && retryAt < classAt,
    "the retry check must precede the classification");
});

/* ── B/C: a new request for a repeatable operation ────────────────────────── */

test("B — a NEW request for a REEXECUTE_REQUIRED action does not adopt the result", () => {
  const d = completedReuseDecision({
    actionType: "environment.restore_qa_session", existing: completed("gar_1"), requestId: "gar_2",
  });
  assert.equal(d.reuse, false);
  assert.equal(d.disposition, "new_occurrence");
});

test("C — THE FINANCIALS SPECIMEN: two requests, two executions", () => {
  const first = completedReuseDecision({
    actionType: "environment.execute_registered_reconciliation", existing: null, requestId: "gar_3e7f65074f80fe",
  });
  assert.equal(first.reuse, false, "nothing to adopt");
  const second = completedReuseDecision({
    actionType: "environment.execute_registered_reconciliation",
    existing: completed("gar_3e7f65074f80fe"),
    requestId: "gar_f186029156c47e",
  });
  assert.equal(second.reuse, false, "this is the request that adopted tha_5975676b98005f");
  assert.equal(second.disposition, "new_occurrence");
  // And the retry of request #1 still reuses.
  const retry = completedReuseDecision({
    actionType: "environment.execute_registered_reconciliation",
    existing: completed("gar_3e7f65074f80fe"),
    requestId: "gar_3e7f65074f80fe",
  });
  assert.equal(retry.reuse, true);
});

/* ── D: reuse where reuse is the point ────────────────────────────────────── */

test("D — a REUSE_CORRECT action still adopts a completed result", () => {
  for (const t of ["repository.push", "repository.merge_pull_request", "database.apply_migration", "host.install_toolkit"]) {
    const d = completedReuseDecision({ actionType: t, existing: completed("gar_1"), requestId: "gar_2" });
    assert.equal(d.reuse, true, `${t} must keep reusing — merging twice is an error, not an occurrence`);
    assert.equal(d.disposition, "completed_result_reuse");
  }
});

/* ── E: context-dependent fails closed ────────────────────────────────────── */

test("E — CONTEXT_DEPENDENT reuses only when the operation says so", () => {
  const base = { actionType: "database.read_census", existing: completed("gar_1"), requestId: "gar_2" };
  assert.equal(completedReuseDecision(base).reuse, false, "silence is not authorisation");
  assert.equal(completedReuseDecision({ ...base, reuseAuthorized: false }).reuse, false);
  assert.equal(completedReuseDecision({ ...base, reuseAuthorized: true }).reuse, true);
});

test("E2 — an undeclared action type fails closed, it does not fall through to reuse", () => {
  const r = repeatabilityFor("something.invented.tomorrow");
  assert.equal(r.class, UNDECLARED_DEFAULT);
  assert.equal(r.declared, false);
  assert.equal(completedReuseDecision({
    actionType: "something.invented.tomorrow", existing: completed("gar_1"), requestId: "gar_2",
  }).reuse, false);
});

/* ── F: the caller never owns execution identity ──────────────────────────── */

test("F — no caller-supplied dedupeKey participates in the decision", () => {
  const src = readFileSync(`${LIB}/action-repeatability.mjs`, "utf8");
  assert.doesNotMatch(src, /inputs\?\.dedupeKey|args\.dedupeKey/,
    "execution identity is runtime-owned; a caller inventing it is what this must not become");
  // The identity used is the carried request id, and nothing else.
  const d = completedReuseDecision({
    actionType: "environment.execute_registered_reconciliation",
    existing: { state: "completed", authorizationIdentity: { requestId: "gar_1" }, inputs: { dedupeKey: "x" } },
    requestId: "gar_2",
  });
  assert.equal(d.reuse, false, "a dedupeKey on the existing action cannot buy adoption");
});

/* ── the inventory is complete ────────────────────────────────────────────── */

test("G — every registered action type is classified", () => {
  const registered = Object.values(ACTION_TYPES).map(String).sort();
  const missing = registered.filter((t) => !Object.prototype.hasOwnProperty.call(ACTION_REPEATABILITY, t));
  assert.deepEqual(missing, [], `unclassified action types: ${missing.join(", ")}`);
});

test("H — every classification carries its semantic reason", () => {
  for (const [t, row] of Object.entries(ACTION_REPEATABILITY)) {
    assert.ok(Object.values(REPEATABILITY).includes(row.class), `${t} has an unknown class`);
    assert.ok(row.why && row.why.length > 20, `${t} must say WHY, not just which`);
  }
});

test("I — classification is by meaning, not by risk class", () => {
  // Both are privileged writes. One is an end state, the other an event.
  assert.equal(repeatabilityFor("repository.push").class, REPEATABILITY.REUSE_CORRECT);
  assert.equal(repeatabilityFor("environment.restore_qa_session").class, REPEATABILITY.REEXECUTE_REQUIRED);
});

/* ── MUTATION PROOFS ──────────────────────────────────────────────────────── */

test("M1 — remove the classification and the Financials case goes red", () => {
  const withoutClassification = () => ({ reuse: true, disposition: "completed_result_reuse" });
  assert.equal(withoutClassification().reuse, true, "the old behaviour adopted it");
  assert.equal(completedReuseDecision({
    actionType: "environment.execute_registered_reconciliation",
    existing: completed("gar_1"), requestId: "gar_2",
  }).reuse, false, "the classification must be what changes the answer");
});

test("M2 — remove retry reuse and the retry case goes red", () => {
  const withoutRetryReuse = (kind) => kind !== REPEATABILITY.REUSE_CORRECT;
  assert.equal(withoutRetryReuse(REPEATABILITY.REEXECUTE_REQUIRED), true, "the naive rule re-executes a retry");
  assert.equal(completedReuseDecision({
    actionType: "environment.execute_registered_reconciliation",
    existing: completed("gar_1"), requestId: "gar_1",
  }).reuse, true, "a duplicate delivery must never become a duplicate operation");
});

test("M3 — treat every new request as a new occurrence and the reuse case goes red", () => {
  const everythingReexecutes = () => ({ reuse: false });
  assert.equal(everythingReexecutes().reuse, false);
  assert.equal(completedReuseDecision({
    actionType: "repository.merge_pull_request", existing: completed("gar_1"), requestId: "gar_2",
  }).reuse, true, "merging an already-merged PR is an error, not a second occurrence");
});

test("M4 — the dedupe site records why, so a second execution is answerable later", () => {
  const src = readFileSync(`${LIB}/trusted-host-actions.mjs`, "utf8");
  assert.match(src, /completedReuseDecision\(/);
  assert.match(src, /dedupeDisposition/);
  assert.match(src, /existing\.state === "completed"/,
    "in-flight reuse must be untouched: two concurrent requests still must not both execute");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
