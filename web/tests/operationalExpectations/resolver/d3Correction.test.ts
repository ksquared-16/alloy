/**
 * P1 · Wave D · D3 — Correction semantics + two-axis as-of certification.
 *
 * Frozen behavior (System Design §4.4 + §4.2): a correction marks the prior
 * NEVER-VALID and unwinds on the CURRENT-KNOWLEDGE axis. The predecessor row is
 * unchanged and remains available for as-known-at-T audit. A correction authored
 * after transaction-time T must not change an as-known-at-T result.
 */

import { describe, expect, it } from "vitest";
import { resolveEffectiveExpectation } from "@/lib/operationalExpectations/resolver/resolveEffectiveExpectation";
import { row, shuffled } from "./fixtures";

// P asserted a (wrong) ratio for [Jan1, ∞); C corrects it — P was never valid.
const P = row({
    id: "p",
    valid_from: "2026-01-01T00:00:00Z",
    valid_to: null,
    authored_at: "2026-01-01T00:00:00Z",
    authority_key: "user:clerk",
    subject_kind: "room",
});
const C = row({
    id: "c",
    verb: "correct",
    transition_type: "correction",
    supersedes_expectation_id: "p",
    lineage_root_id: "p",
    valid_from: "2026-01-01T00:00:00Z",
    valid_to: null,
    authored_at: "2026-01-20T00:00:00Z",
    authority_key: "user:director",
    subject_kind: "room",
});
const rows = [P, C];

describe("D3 · correction unwinds on the current-knowledge (as-of-now) axis", () => {
    it("removes the predecessor from effectivity; the correction governs", () => {
        const res = resolveEffectiveExpectation(rows, {
            orgId: "org-1",
            lineageRootId: "p",
            asOf: { validTime: "2026-01-10T00:00:00Z" }, // inside the predecessor's original frame
        });
        expect(res.kind === "resolved" && res.effective.effectiveExpectationId).toBe("c");
    });

    it("the predecessor is NEVER effective on the as-of-now axis, at any valid-time it covered", () => {
        for (const vt of ["2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z", "2030-01-01T00:00:00Z"]) {
            const res = resolveEffectiveExpectation(rows, { orgId: "org-1", lineageRootId: "p", asOf: { validTime: vt } });
            expect(res.kind === "resolved" && res.effective.effectiveExpectationId).toBe("c");
        }
    });
});

describe("D3 · as-known-at-T reconstruction (audit; historical record unchanged)", () => {
    it("before the correction was authored, the predecessor still resolves", () => {
        const res = resolveEffectiveExpectation(rows, {
            orgId: "org-1",
            lineageRootId: "p",
            asOf: { validTime: "2026-01-10T00:00:00Z", knownAt: "2026-01-05T00:00:00Z" },
        });
        expect(res.kind === "resolved" && res.effective.effectiveExpectationId).toBe("p");
    });

    it("a correction authored after T does not change an as-known-at-T result", () => {
        const asKnown = (knownAt: string) =>
            resolveEffectiveExpectation(rows, {
                orgId: "org-1",
                lineageRootId: "p",
                asOf: { validTime: "2026-01-10T00:00:00Z", knownAt },
            });
        // T=Jan5 (before C@Jan20): predecessor. T=Jan21 (after C): correction.
        const before = asKnown("2026-01-05T00:00:00Z");
        const after = asKnown("2026-01-21T00:00:00Z");
        expect(before.kind === "resolved" && before.effective.effectiveExpectationId).toBe("p");
        expect(after.kind === "resolved" && after.effective.effectiveExpectationId).toBe("c");
    });
});

describe("D3 · correction and revision are observably different on equivalent fixtures", () => {
    it("same predecessor + identical successor frame, only transition_type differs → different past effectivity", () => {
        // Equivalent fixtures: same predecessor P, same successor row S with
        // valid_from Feb1; the ONLY difference is revision vs correction.
        const asRevision = [
            P,
            { ...C, id: "s", verb: "revise" as const, transition_type: "revision" as const, valid_from: "2026-02-01T00:00:00Z" },
        ];
        const asCorrection = [
            P,
            { ...C, id: "s", verb: "correct" as const, transition_type: "correction" as const, valid_from: "2026-02-01T00:00:00Z" },
        ];
        const at = (fixture: typeof asRevision, validTime: string) =>
            resolveEffectiveExpectation(fixture, { orgId: "org-1", lineageRootId: "p", asOf: { validTime } });

        // BEFORE the successor's valid_from (Jan15): revision preserves the
        // predecessor's valid past ("p"); correction marks it never-valid, and
        // the corrected frame starts Feb1, so nothing is effective ("none").
        const revPast = at(asRevision, "2026-01-15T00:00:00Z");
        const corPast = at(asCorrection, "2026-01-15T00:00:00Z");
        expect(revPast.kind === "resolved" && revPast.effective.effectiveExpectationId).toBe("p");
        expect(corPast.kind).toBe("none");
        expect(JSON.stringify(revPast)).not.toBe(JSON.stringify(corPast));

        // FROM the successor's valid_from (Feb15): both yield the successor row.
        expect(at(asRevision, "2026-02-15T00:00:00Z").kind === "resolved").toBe(true);
        expect(at(asCorrection, "2026-02-15T00:00:00Z").kind === "resolved").toBe(true);
    });
});

describe("D3 · determinism holds with corrections", () => {
    it("order-independent under shuffled input", () => {
        const probe = { orgId: "org-1", lineageRootId: "p", asOf: { validTime: "2026-01-10T00:00:00Z" } };
        const base = JSON.stringify(resolveEffectiveExpectation(rows, probe));
        for (let i = 0; i < 5; i++) {
            expect(JSON.stringify(resolveEffectiveExpectation(shuffled(rows), probe))).toBe(base);
        }
    });
});
