import { describe, expect, it } from "vitest";
import { resolveAssignmentLifecycleState } from "@/lib/operationalAssignments/assignmentLifecycleState";

describe("resolveAssignmentLifecycleState", () => {
    it("labels proposed planning as Proposed", () => {
        const r = resolveAssignmentLifecycleState({
            commitmentKind: "proposed",
            status: "planned",
            effectiveFrom: "2026-08-01",
            asOf: "2026-08-15",
        });
        expect(r.label).toBe("Proposed");
        expect(r.tone).toBe("blue");
    });

    it("labels future proposed as Proposed (never Planned)", () => {
        const r = resolveAssignmentLifecycleState({
            commitmentKind: "proposed",
            status: "planned",
            effectiveFrom: "2026-09-01",
            asOf: "2026-08-15",
        });
        expect(r.label).toBe("Proposed");
        expect(r.tone).toBe("blue");
    });

    it("labels committed covering as-of as Active", () => {
        const r = resolveAssignmentLifecycleState({
            commitmentKind: "committed",
            status: "active",
            effectiveFrom: "2026-08-01",
            openEnded: true,
            asOf: "2026-08-15",
        });
        expect(r.label).toBe("Active");
        expect(r.tone).toBe("pine");
    });

    it("labels committed future start as Upcoming", () => {
        const r = resolveAssignmentLifecycleState({
            commitmentKind: "committed",
            status: "active",
            effectiveFrom: "2026-09-01",
            asOf: "2026-08-15",
        });
        expect(r.label).toBe("Upcoming");
    });

    it("labels past end as Completed", () => {
        const r = resolveAssignmentLifecycleState({
            commitmentKind: "committed",
            status: "ended",
            effectiveFrom: "2026-01-01",
            effectiveTo: "2026-06-01",
            asOf: "2026-08-15",
        });
        expect(r.label).toBe("Completed");
    });

    it("labels archived as Archived", () => {
        const r = resolveAssignmentLifecycleState({
            commitmentKind: "committed",
            status: "archived",
            effectiveFrom: "2026-01-01",
            asOf: "2026-08-15",
        });
        expect(r.label).toBe("Archived");
    });

    it("does not conflate proposed with active", () => {
        const r = resolveAssignmentLifecycleState({
            commitmentKind: "proposed",
            status: "active",
            effectiveFrom: "2026-08-01",
            asOf: "2026-08-15",
        });
        expect(r.label).not.toBe("Active");
        expect(r.label).toBe("Proposed");
    });
});
