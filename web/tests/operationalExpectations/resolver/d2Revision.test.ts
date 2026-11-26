/**
 * P1 · Wave D · D2 — Revision semantics certification.
 *
 * Frozen behavior (System Design §4.3): a revision re-plans FORWARD. The prior
 * stays valid until the revision's valid_from; the revision is effective from
 * its valid_from forward. The predecessor row is never mutated — the truncated
 * effective window is DERIVED on read.
 */

import { describe, expect, it } from "vitest";
import { resolveEffectiveExpectation } from "@/lib/operationalExpectations/resolver/resolveEffectiveExpectation";
import { row, shuffled } from "./fixtures";

// P created for [Jan1, ∞); R revises forward from Feb1.
const P = row({ id: "p", valid_from: "2026-01-01T00:00:00Z", valid_to: null, authored_at: "2026-01-01T00:00:00Z", subject_kind: "room" });
const R = row({
    id: "r",
    verb: "revise",
    transition_type: "revision",
    supersedes_expectation_id: "p",
    lineage_root_id: "p",
    valid_from: "2026-02-01T00:00:00Z",
    valid_to: null,
    authored_at: "2026-01-20T00:00:00Z",
    subject_kind: "room",
    authority_key: "user:director",
});

const q = (validTime: string) =>
    resolveEffectiveExpectation([P, R], { orgId: "org-1", lineageRootId: "p", asOf: { validTime } });

describe("D2 · revision re-plans forward, valid past intact", () => {
    it("predecessor stays effective before the revision valid_from", () => {
        const res = q("2026-01-15T00:00:00Z");
        expect(res.kind === "resolved" && res.effective.effectiveExpectationId).toBe("p");
        // derived window is truncated at the revision boundary (predecessor row unchanged).
        if (res.kind === "resolved") {
            expect(res.effective.effectiveFrom).toBe("2026-01-01T00:00:00Z");
            expect(res.effective.effectiveTo).toBe("2026-02-01T00:00:00Z");
        }
    });

    it("revision is effective from its valid_from forward", () => {
        const res = q("2026-03-01T00:00:00Z");
        expect(res.kind === "resolved" && res.effective.effectiveExpectationId).toBe("r");
        if (res.kind === "resolved") expect(res.effective.effectiveTo).toBeNull();
    });

    it("exact boundary is start-inclusive: validTime == revision valid_from → revision", () => {
        const res = q("2026-02-01T00:00:00Z");
        expect(res.kind === "resolved" && res.effective.effectiveExpectationId).toBe("r");
    });

    it("the instant before the boundary is still the predecessor", () => {
        const res = q("2026-01-31T23:59:59Z");
        expect(res.kind === "resolved" && res.effective.effectiveExpectationId).toBe("p");
    });
});

describe("D2 · chained revisions produce ordered windows", () => {
    const R2 = row({
        id: "r2",
        verb: "revise",
        transition_type: "revision",
        supersedes_expectation_id: "r",
        lineage_root_id: "p",
        valid_from: "2026-03-01T00:00:00Z",
        valid_to: null,
        authored_at: "2026-02-10T00:00:00Z",
        subject_kind: "room",
    });
    const rows = [P, R, R2];
    const qc = (validTime: string) =>
        resolveEffectiveExpectation(rows, { orgId: "org-1", lineageRootId: "p", asOf: { validTime } });

    it("[Jan1,Feb1)→p, [Feb1,Mar1)→r, [Mar1,∞)→r2", () => {
        const rEarly = qc("2026-01-15T00:00:00Z");
        expect(rEarly.kind === "resolved" && rEarly.effective.effectiveExpectationId).toBe("p");
        const rMid = qc("2026-02-15T00:00:00Z");
        expect(rMid.kind === "resolved" && rMid.effective.effectiveExpectationId).toBe("r");
        expect(rMid.kind === "resolved" && rMid.effective.effectiveFrom).toBe("2026-02-01T00:00:00Z");
        expect(rMid.kind === "resolved" && rMid.effective.effectiveTo).toBe("2026-03-01T00:00:00Z");
        const rLate = qc("2026-04-01T00:00:00Z");
        expect(rLate.kind === "resolved" && rLate.effective.effectiveExpectationId).toBe("r2");
    });

    it("is order-independent under shuffled input", () => {
        const probe = { orgId: "org-1", lineageRootId: "p", asOf: { validTime: "2026-02-15T00:00:00Z" } };
        const base = JSON.stringify(resolveEffectiveExpectation(rows, probe));
        for (let i = 0; i < 5; i++) {
            expect(JSON.stringify(resolveEffectiveExpectation(shuffled(rows), probe))).toBe(base);
        }
    });
});
