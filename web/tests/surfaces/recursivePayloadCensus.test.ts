/**
 * THE MEASUREMENT THAT WAS WRONG TWICE.
 *
 * Two published retransmission figures for the provisioning answer — ~71% and 40% — were artefacts
 * of hashing large top-level subtrees. `focusPanelStageWork` is the trap: its 78KB
 * `published_stage_inputs` child never varies between subject selections, while two small siblings
 * do, so top-level hashing charges the whole 81KB to "changed".
 *
 * These tests use a fixture with exactly that shape, at the real proportions, and assert that the
 * recursive census reports ~99.6% while the top-level method reports ~41% on the same input. The
 * second function exists only to make that difference demonstrable rather than asserted.
 */

import { describe, expect, it } from "vitest";

import {
    internalDuplicationBytes,
    recursivePayloadCensus,
    topLevelPayloadCensusForComparison,
} from "@/lib/runtime/provisioning/recursivePayloadCensus";

/** A configuration blob of roughly `bytes` size, identical in every answer. */
const configOfSize = (bytes: number, seed: string) => ({
    payload: seed.repeat(Math.max(1, Math.floor(bytes / seed.length))),
});

/**
 * The real shape, at the measured proportions: a large stage-work subtree whose configuration half
 * is static and whose runtime half carries a handful of per-subject ids.
 */
function answer(subject: { id: string; email: string; dueAt: string }) {
    return {
        focusPanelStageWork: {
            // 78KB of configuration — identical between selections.
            published_stage_inputs: {
                departmentMetadata: configOfSize(32550, "dept-metadata-"),
                process: configOfSize(28741, "process-record-"),
                commandProjection: configOfSize(10139, "command-proj-"),
                operatingPlan: configOfSize(5561, "operating-plan-"),
                processKey: "enrollment",
                stageKey: "lead",
            },
            // ~3KB of runtime — a few ids change.
            stage_work_runtime: { primary: { work_id: subject.id, due_at: subject.dueAt }, filler: configOfSize(2000, "swr-") },
            work_intent_runtime: { work_id: subject.id, filler: configOfSize(1000, "wir-") },
        },
        focusPanelSummaryDoc: configOfSize(30500, "summary-doc-"),
        rows: configOfSize(14328, "queue-rows-"),
        presentation: configOfSize(6359, "presentation-"),
        subjectIdentityTruth: { "customer.id": subject.id, "person.primary_email": subject.email },
    };
}

const A = answer({ id: "1054ae3e-cc6d-4ae5-8797-92c331bb360a", email: "ada@example.invalid", dueAt: "2026-09-14" });
const B = answer({ id: "50b19065-51fd-41e4-83c9-07ba787759f0", email: "specq@example.invalid", dueAt: "2026-09-15" });

describe("recursive census charges bytes where they actually differ", () => {
    it("reports the answer as overwhelmingly identical between two subject selections", () => {
        const census = recursivePayloadCensus(A, B);
        expect(census.identicalShare).toBeGreaterThan(0.99);
        // A few hundred bytes of ids, an email and two dates — not eighty kilobytes.
        expect(census.differingBytes).toBeLessThan(1000);
    });

    it("never charges the static configuration subtree to the differing column", () => {
        const census = recursivePayloadCensus(A, B);
        const paths = census.differences.map((d) => d.path);
        expect(paths.some((p) => p.includes("published_stage_inputs"))).toBe(false);
        // What DID change is named precisely enough to act on.
        expect(paths).toContain("subjectIdentityTruth.customer.id");
        expect(paths).toContain("focusPanelStageWork.work_intent_runtime.work_id");
    });

    it("DEMONSTRATES the error: the top-level method reports a far worse answer on the same input", () => {
        const recursive = recursivePayloadCensus(A, B);
        const topLevel = topLevelPayloadCensusForComparison(A, B);
        expect(topLevel.identicalShare).toBeLessThan(0.6);
        // The whole 80KB stage-work subtree, charged to "changed" by one varying leaf.
        expect(topLevel.differingBytes).toBeGreaterThan(70_000);
        expect(recursive.identicalShare - topLevel.identicalShare).toBeGreaterThan(0.35);
    });

    it("is not fooled by key order, which a server may legitimately vary", () => {
        const reordered = { rows: A.rows, presentation: A.presentation, focusPanelStageWork: A.focusPanelStageWork, focusPanelSummaryDoc: A.focusPanelSummaryDoc, subjectIdentityTruth: A.subjectIdentityTruth };
        expect(recursivePayloadCensus(A, reordered).differingBytes).toBe(0);
    });

    it("accounts for every byte exactly once", () => {
        const census = recursivePayloadCensus(A, B);
        // Identical + differing reconstructs the payload, so nothing is double-counted or dropped.
        expect(census.identicalBytes + census.differingBytes).toBeGreaterThan(0.95 * census.bytesA);
        expect(census.identicalBytes + census.differingBytes).toBeLessThanOrEqual(census.bytesA + census.bytesB);
    });

    it("reports an identical pair as fully identical and a disjoint pair as fully different", () => {
        expect(recursivePayloadCensus(A, A).identicalShare).toBe(1);
        expect(recursivePayloadCensus({ x: "aaaa" }, { x: "bbbb" }).identicalShare).toBe(0);
    });

    it("handles arrays element-wise, and a length change as a whole", () => {
        const same = recursivePayloadCensus({ xs: [1, 2, 3] }, { xs: [1, 9, 3] });
        expect(same.differences.map((d) => d.path)).toContain("xs[1]");
        const grew = recursivePayloadCensus({ xs: [1, 2] }, { xs: [1, 2, 3] });
        expect(grew.differences[0].path).toBe("xs");
    });
});

describe("internal duplication — the same subtree carried twice in one answer", () => {
    it("finds a configuration record repeated inside a single payload", () => {
        const record = configOfSize(28741, "process-record-");
        const payload = { process: record, departmentMetadata: { lifecycle_builder_v1: { processes: [record] } } };
        const { totalDuplicatedBytes, duplicates } = internalDuplicationBytes(payload);
        expect(totalDuplicatedBytes).toBeGreaterThan(25_000);
        expect(duplicates[0].occurrences).toHaveLength(2);
        expect(duplicates[0].occurrences).toContain("process");
    });

    it("ignores small repeats, which are structure rather than waste", () => {
        const payload = { a: { state: "ready" }, b: { state: "ready" } };
        expect(internalDuplicationBytes(payload).totalDuplicatedBytes).toBe(0);
    });
});
