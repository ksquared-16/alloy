#!/usr/bin/env node
/**
 * Operational findings — certification.
 *
 * The property under test is that findings become durable, deduplicated,
 * actionable knowledge rather than another inbox. So the cases that matter most
 * are the refusals: CLOSED without evidence, a second record for one cause, and
 * a test that could touch live state.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
    CONSTRAINING_SEVERITIES,
    FINDING_SEVERITIES,
    FINDING_STATUSES,
    directorAttention,
    directorObligation,
    findingId,
    findingsForSteward,
    findingsStorePath,
    getFinding,
    listFindings,
    mergeFindings,
    readFindingsStoreGuarded,
    recordObservation,
    resetFindingsForTests,
    summarizeFindings,
    transitionFinding,
} from "../lib/vacilando/operational-findings.mjs";

/** An isolated root, always. Never the live gateway. */
function freshRoot() {
    return mkdtempSync(join(tmpdir(), "vac-findings-"));
}
const obs = (root, over = {}) => recordObservation({
    subsystem: "execution-run", key: "stale-reconciliation",
    title: "Stale runs are not reconciled", root_cause: "one reconciliation defect",
    category: "defect", severity: "degrades", root, ...over,
});

/* ── 2. one cause, one finding ──────────────────────────────────────────── */

test("repeated evidence updates ONE finding rather than multiplying it", () => {
    const root = freshRoot();
    const a = obs(root, { evidence: "symptom 1" });
    const b = obs(root, { evidence: "symptom 2" });
    const c = obs(root, { evidence: "symptom 3" });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(c.created, false);
    assert.equal(listFindings(root).length, 1, "five symptoms of one defect are one finding");
    const f = getFinding(a.id, root);
    assert.equal(f.occurrences, 3, "occurrence history is preserved");
    assert.equal(f.evidence.length, 3, "and so is the evidence");
});

test("distinct root causes in the same subsystem stay distinct", () => {
    const root = freshRoot();
    obs(root);
    const other = recordObservation({
        subsystem: "execution-run", key: "phantom-run-identity",
        root_cause: "a different defect entirely", root,
    });
    assert.equal(other.created, true);
    assert.equal(listFindings(root).length, 2, "same subsystem must not merge different causes");
});

test("identity is deterministic, so next week's observation lands on the same record", () => {
    assert.equal(findingId({ subsystem: "Execution Run", key: "Stale Reconciliation" }),
        findingId({ subsystem: "execution-run", key: "stale-reconciliation" }));
    assert.equal(findingId({ subsystem: "x" }), null, "an identity needs both halves");
});

test("a later observation does not overwrite the original analysis", () => {
    const root = freshRoot();
    const a = obs(root, { root_cause: "the real cause", severity: "blocks_work" });
    obs(root, { root_cause: "a hastier guess", severity: "debt" });
    const f = getFinding(a.id, root);
    assert.equal(f.root_cause, "the real cause");
    assert.equal(f.severity, "blocks_work", "severity is characterisation, not a running vote");
});

test("an explicit id targets an existing finding instead of duplicating it", () => {
    // The store predates this module and its records carry hand-written ids that
    // do not follow the (subsystem, key) scheme. Seeding hit this immediately and
    // produced two duplicates — the exact failure the system exists to prevent.
    const root = freshRoot();
    recordObservation({ id: "legacy-hand-written-id", subsystem: "x", key: "y", root_cause: "the cause", root });
    const again = recordObservation({ id: "legacy-hand-written-id", evidence: "seen again", root });
    assert.equal(again.created, false, "an explicit id must update, not create");
    assert.equal(listFindings(root).length, 1);
    assert.equal(getFinding("legacy-hand-written-id", root).occurrences, 2);
});

test("a duplicate can be folded into the finding it should have been", () => {
    const root = freshRoot();
    const keep = recordObservation({ id: "canonical", subsystem: "s", key: "k", evidence: "first", root });
    const dup = recordObservation({ subsystem: "s", key: "k2", evidence: "second", root });
    assert.equal(listFindings(root).length, 2);
    const m = mergeFindings(dup.id, keep.id, { root });
    assert.equal(m.ok, true);
    assert.equal(listFindings(root).length, 1, "the duplicate is removed, not tombstoned");
    const f = getFinding("canonical", root);
    assert.equal(f.occurrences, 2, "occurrences are additive: both observations happened");
    assert.equal(f.evidence.length, 2, "and the evidence survives the merge");
    assert.equal(mergeFindings("canonical", "canonical", { root }).error, "cannot_merge_into_itself");
});

/* ── 1/4. lifecycle, and CLOSED requires evidence ───────────────────────── */

test("CLOSED requires verification evidence; code changing is only FIXED", () => {
    const root = freshRoot();
    const { id } = obs(root);
    const fixed = transitionFinding(id, "FIXED", { permanent_fix: "guard added", promoted_sha: "a".repeat(40), root });
    assert.equal(fixed.ok, true, "FIXED needs no proof of absence");

    const refused = transitionFinding(id, "CLOSED", { root });
    assert.equal(refused.ok, false);
    assert.equal(refused.error, "closure_evidence_required");
    assert.equal(getFinding(id, root).status, "FIXED", "and the refusal changed nothing");

    const closed = transitionFinding(id, "CLOSED", { closure_evidence: "live-certified on b126fff0d572", root });
    assert.equal(closed.ok, true);
    assert.equal(getFinding(id, root).status, "CLOSED");
});

test("every declared status is reachable and an invalid one is refused", () => {
    const root = freshRoot();
    const { id } = obs(root);
    for (const s of ["MITIGATED", "FIXED", "ACCEPTED_DEBT", "OPEN"]) {
        assert.equal(transitionFinding(id, s, { root }).ok, true, s);
    }
    assert.equal(transitionFinding(id, "WONTFIX", { root }).error, "invalid_status");
});

/* ── 6. regression ──────────────────────────────────────────────────────── */

test("a CLOSED condition observed again is a REGRESSION, not a quiet reopen", () => {
    const root = freshRoot();
    const { id } = obs(root);
    transitionFinding(id, "CLOSED", { closure_evidence: "certified", root });
    const again = obs(root, { evidence: "it came back" });
    assert.equal(again.regressed, true, "the recurrence must be visible as such");
    const f = getFinding(id, root);
    assert.equal(f.status, "OPEN");
    assert.ok(f.regressed_at, "and dated, so it is not mistaken for a fresh finding");
    assert.ok(directorObligation(f), "a certified fix that recurred is owed the Director's attention");
});

/* ── 5/7/9. attention: a scoreboard, not an inbox ───────────────────────── */

test("ACCEPTED_DEBT stays visible but stops interrupting", () => {
    const root = freshRoot();
    const { id } = obs(root, { severity: "blocks_work" });
    assert.equal(directorAttention(root).length, 1, "it interrupted while open");
    transitionFinding(id, "ACCEPTED_DEBT", { note: "deliberately deferred", root });
    assert.equal(directorAttention(root).length, 0, "and stops once the decision is taken");
    assert.equal(summarizeFindings(root).by_status.ACCEPTED_DEBT, 1, "while remaining on the board");
});

test("routine OPEN findings do not page the Director", () => {
    const root = freshRoot();
    obs(root, { subsystem: "hygiene", key: "worktree-accumulation", severity: "debt" });
    obs(root, { subsystem: "docs", key: "stale-doctrine", severity: "degrades" });
    assert.equal(directorAttention(root).length, 0, "debt and degradation are the system's problem, not an interruption");
    assert.equal(summarizeFindings(root).total, 2, "but they are recorded");
});

test("severity is consequence, not frequency", () => {
    const root = freshRoot();
    const { id } = obs(root, { subsystem: "hygiene", key: "noisy", severity: "debt" });
    for (let i = 0; i < 25; i++) obs(root, { subsystem: "hygiene", key: "noisy" });
    const f = getFinding(id, root);
    assert.equal(f.occurrences, 26, "frequency is recorded");
    assert.equal(f.severity, "debt", "and does not inflate severity");
    assert.equal(directorObligation(f), false, "an annoyance is still not an obligation");
});

/* ── 7/8. Steward consumption and planning constraints ──────────────────── */

test("the Steward gets a read-only view and never becomes the source of truth", () => {
    const root = freshRoot();
    const blocking = obs(root, { subsystem: "gateway", key: "unhealthy-not-restarted", severity: "control_plane", affected: ["gateway"] });
    obs(root, { subsystem: "hygiene", key: "toolkits", severity: "debt" });
    const view = findingsForSteward(root);
    assert.equal(view.total, 2);
    assert.equal(view.affecting_operation.length, 2);
    assert.deepEqual(view.constraining_planning.map((c) => c.id), [blocking.id],
        "only consequential findings constrain planning");
    assert.deepEqual(view.needs_director, [blocking.id]);
    // The view is data. Nothing about it can write.
    for (const k of Object.keys(view)) assert.notEqual(typeof view[k], "function");
});

test("constraining severities are exactly the consequential ones", () => {
    assert.deepEqual([...CONSTRAINING_SEVERITIES], ["control_plane", "blocks_work"]);
    for (const s of CONSTRAINING_SEVERITIES) assert.ok(FINDING_SEVERITIES.includes(s));
});

/* ── 12. durability ─────────────────────────────────────────────────────── */

test("findings survive a Gateway restart", () => {
    const root = freshRoot();
    const { id } = obs(root, { evidence: "before the restart" });
    transitionFinding(id, "MITIGATED", { mitigation: "worked around", root });
    // A restart is a process ending; the store is on disk and reads hit disk.
    const after = getFinding(id, root);
    assert.ok(after, "the finding must not vanish with the process");
    assert.equal(after.status, "MITIGATED", "and returns in the state it was left in");
    assert.equal(after.evidence.length, 1);
});

test("an unreadable store is never reported as empty, and is never overwritten", () => {
    const root = freshRoot();
    obs(root);
    writeFileSync(findingsStorePath(root), "{ corrupted", "utf8");
    const read = readFindingsStoreGuarded(root);
    assert.equal(read.ok, false);
    assert.equal(read.error, "findings_store_malformed");
    // Every write path must refuse rather than found a new store over it.
    assert.equal(obs(root).error, "findings_store_malformed");
    assert.equal(readFileSync(findingsStorePath(root), "utf8"), "{ corrupted", "the bytes stay recoverable");
});

test("first boot with a genuinely absent store is honestly empty", () => {
    const read = readFindingsStoreGuarded(freshRoot());
    assert.equal(read.ok, true);
    assert.equal(read.absent, true);
    assert.deepEqual(read.store.findings, []);
});

/* ── 10/11. no test may touch live authoritative state ──────────────────── */

test("the reset helper refuses the live gateway root", () => {
    // The Capacity V2 lesson, applied from the start: production is not a fixture.
    assert.throws(() => resetFindingsForTests("/Users/x/.local/state/alloy-dev/gateway"), /live gateway root/);
    assert.doesNotThrow(() => resetFindingsForTests(freshRoot()));
});

test("every declared status and severity is known to the model", () => {
    assert.deepEqual([...FINDING_STATUSES], ["OPEN", "MITIGATED", "FIXED", "CLOSED", "ACCEPTED_DEBT"]);
    assert.equal(FINDING_SEVERITIES.length, 5);
});
