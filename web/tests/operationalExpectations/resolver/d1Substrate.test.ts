/**
 * P1 · Wave D · D1 — Effective Expectation Resolver substrate certification.
 *
 * Proves the invariant substrate behavior that holds across the whole wave:
 * create-only lineage resolution, org + lineage isolation, deterministic
 * ordering, Standing reuse, and the PERMANENT fail-closed on the unratified
 * cancellation / replacement transitions.
 */

import { describe, expect, it } from "vitest";
import {
    resolveEffectiveExpectation,
    resolveEffectiveExpectations,
} from "@/lib/operationalExpectations/resolver/resolveEffectiveExpectation";
import { row, shuffled } from "./fixtures";

describe("D1 · create-only lineage resolution", () => {
    it("resolves a single create as effective within its authored window", () => {
        const rows = [row({ id: "e1", valid_from: "2026-01-01T00:00:00Z", valid_to: "2026-02-01T00:00:00Z" })];
        const res = resolveEffectiveExpectation(rows, {
            orgId: "org-1",
            lineageRootId: "e1",
            asOf: { validTime: "2026-01-15T00:00:00Z" },
        });
        expect(res.kind).toBe("resolved");
        if (res.kind !== "resolved") return;
        expect(res.effective.effectiveExpectationId).toBe("e1");
        expect(res.effective.effectiveFrom).toBe("2026-01-01T00:00:00Z");
        expect(res.effective.effectiveTo).toBe("2026-02-01T00:00:00Z");
        expect(res.effective.lineagePath).toEqual(["e1"]);
    });

    it("is `none` before valid_from and at/after valid_to (half-open [from,to))", () => {
        const rows = [row({ id: "e1", valid_from: "2026-01-01T00:00:00Z", valid_to: "2026-02-01T00:00:00Z" })];
        const q = (validTime: string) =>
            resolveEffectiveExpectation(rows, { orgId: "org-1", lineageRootId: "e1", asOf: { validTime } });
        expect(q("2025-12-31T23:59:59Z").kind).toBe("none");
        expect(q("2026-02-01T00:00:00Z").kind).toBe("none"); // end-exclusive
        expect(q("2026-01-01T00:00:00Z").kind).toBe("resolved"); // start-inclusive
    });

    it("treats null valid_to as open-ended", () => {
        const rows = [row({ id: "e1", valid_to: null })];
        const res = resolveEffectiveExpectation(rows, {
            orgId: "org-1",
            lineageRootId: "e1",
            asOf: { validTime: "2030-01-01T00:00:00Z" },
        });
        expect(res.kind).toBe("resolved");
        if (res.kind === "resolved") expect(res.effective.effectiveTo).toBeNull();
    });
});

describe("D1 · Standing reuse (resolveEffectiveStanding, not reproduced)", () => {
    it("proposed → binding only with a ratification; predicted/model never binds", () => {
        const rows = [row({ id: "e1", standing: "proposed" })];
        const base = { orgId: "org-1", lineageRootId: "e1", asOf: { validTime: "2026-01-15T00:00:00Z" } };

        const unratified = resolveEffectiveExpectation(rows, base);
        expect(unratified.kind === "resolved" && unratified.effective.effectiveStanding).toBe("proposed");

        const ratified = resolveEffectiveExpectation(rows, { ...base, ratifiedExpectationIds: new Set(["e1"]) });
        expect(ratified.kind === "resolved" && ratified.effective.effectiveStanding).toBe("binding");

        const model = resolveEffectiveExpectation([row({ id: "e1", standing: "model" })], {
            ...base,
            ratifiedExpectationIds: new Set(["e1"]),
        });
        expect(model.kind === "resolved" && model.effective.effectiveStanding).toBe("model");
    });
});

describe("D1 · organization and lineage isolation", () => {
    it("never crosses org boundaries even for an identical lineage id", () => {
        const rows = [
            row({ id: "e1", org_id: "org-1", subject_kind: "room" }),
            row({ id: "e1b", org_id: "org-2", lineage_root_id: "e1", subject_kind: "vehicle" }),
        ];
        const res = resolveEffectiveExpectation(rows, {
            orgId: "org-1",
            lineageRootId: "e1",
            asOf: { validTime: "2026-01-15T00:00:00Z" },
        });
        expect(res.kind === "resolved" && res.effective.subjectKind).toBe("room");
    });

    it("resolves each lineage independently at set level", () => {
        const rows = [row({ id: "a" }), row({ id: "b", subject_kind: "child" })];
        const map = resolveEffectiveExpectations(rows, { orgId: "org-1", asOf: { validTime: "2026-01-15T00:00:00Z" } });
        expect([...map.keys()].sort()).toEqual(["a", "b"]);
        const a = map.get("a");
        const b = map.get("b");
        expect(a?.kind === "resolved" && a.effective.subjectKind).toBe("room");
        expect(b?.kind === "resolved" && b.effective.subjectKind).toBe("child");
    });
});

describe("D1 · deterministic ordering (create-only)", () => {
    it("returns the same result under shuffled input rows", () => {
        const rows = [
            row({ id: "a", subject_kind: "room" }),
            row({ id: "b", subject_kind: "child" }),
            row({ id: "c", subject_kind: "staff" }),
        ];
        const q = { orgId: "org-1", lineageRootId: "a", asOf: { validTime: "2026-01-15T00:00:00Z" } };
        const base = JSON.stringify(resolveEffectiveExpectation(rows, q));
        for (let i = 0; i < 5; i++) {
            expect(JSON.stringify(resolveEffectiveExpectation(shuffled(rows), q))).toBe(base);
        }
    });
});

describe("D1 · fail closed on UNRATIFIED transitions (permanent)", () => {
    it("cancellation fails closed with typed context and no partial resolution", () => {
        const rows = [
            row({ id: "e1" }),
            row({ id: "e2", verb: "cancel", transition_type: "cancellation", supersedes_expectation_id: "e1", lineage_root_id: "e1", authored_at: "2026-01-05T00:00:00Z" }),
        ];
        const res = resolveEffectiveExpectation(rows, {
            orgId: "org-1",
            lineageRootId: "e1",
            asOf: { validTime: "2026-01-15T00:00:00Z" },
        });
        expect(res.kind).toBe("unsupported_transition");
        if (res.kind !== "unsupported_transition") return;
        expect(res.transitionType).toBe("cancellation");
        expect(res.expectationId).toBe("e2");
        expect(res.lineageRootId).toBe("e1");
    });

    it("replacement fails closed with typed context", () => {
        const rows = [
            row({ id: "e1" }),
            row({ id: "e2", verb: "replace", transition_type: "replacement", supersedes_expectation_id: "e1", lineage_root_id: "e1", authored_at: "2026-01-05T00:00:00Z" }),
        ];
        const res = resolveEffectiveExpectation(rows, {
            orgId: "org-1",
            lineageRootId: "e1",
            asOf: { validTime: "2026-01-15T00:00:00Z" },
        });
        expect(res.kind === "unsupported_transition" && res.transitionType).toBe("replacement");
    });

    it("an unratified transition authored AFTER knownAt does not poison the as-known-at-T view", () => {
        const rows = [
            row({ id: "e1", authored_at: "2026-01-01T00:00:00Z" }),
            row({ id: "e2", verb: "cancel", transition_type: "cancellation", supersedes_expectation_id: "e1", lineage_root_id: "e1", authored_at: "2026-01-10T00:00:00Z" }),
        ];
        const res = resolveEffectiveExpectation(rows, {
            orgId: "org-1",
            lineageRootId: "e1",
            asOf: { validTime: "2026-01-15T00:00:00Z", knownAt: "2026-01-05T00:00:00Z" },
        });
        expect(res.kind).toBe("resolved"); // the cancel is not yet known
        if (res.kind === "resolved") expect(res.effective.effectiveExpectationId).toBe("e1");
    });
});
