import { describe, it, expect } from "vitest";
import {
    resolveWorkViewStageGrains,
    stageKeysReferencedByWorkView,
    validateWorkViewGrainConsistency,
    type StageGrain,
} from "@/lib/lifecycle/stageGrainV1";
import { enrollmentStageMembership } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";

const STAGE_GRAIN_BY_KEY: Record<string, StageGrain | undefined> = {
    lead: "family",
    tour: "family",
    decision: "family",
    closed: "family",
    waitlist: "child",
    enrolling: "child",
    enrolled: "child",
    closed_withdrawn: "child",
};

describe("QA2 — Work View grain scoping (no mixed-grain for single-stage views)", () => {
    it("scopes grain to the stages a view filters to, not the whole process", () => {
        // New Leads filters stage=lead → only family grain, even though the process has child stages.
        const grains = resolveWorkViewStageGrains(
            [{ field_key: "opportunity_stage", operator: "equals", value: "lead" }],
            STAGE_GRAIN_BY_KEY,
        );
        expect(grains).toEqual(["family"]);
        expect(validateWorkViewGrainConsistency(grains).valid).toBe(true);
    });

    it("child-grain view (Waitlist) is single-grain, not mixed", () => {
        const grains = resolveWorkViewStageGrains(
            [{ field_key: "opportunity_stage", operator: "equals", value: "waitlist" }],
            STAGE_GRAIN_BY_KEY,
        );
        expect(grains).toEqual(["child"]);
        expect(validateWorkViewGrainConsistency(grains).valid).toBe(true);
    });

    it("a view explicitly spanning both grains is still flagged mixed", () => {
        const grains = resolveWorkViewStageGrains(
            [{ field_key: "opportunity_stage", operator: "is_any_of", value: ["lead", "waitlist"] }],
            STAGE_GRAIN_BY_KEY,
        );
        expect(new Set(grains)).toEqual(new Set(["family", "child"]));
        expect(validateWorkViewGrainConsistency(grains).valid).toBe(false);
    });

    it("no stage filter → spans all process grains (unchanged behavior)", () => {
        expect(stageKeysReferencedByWorkView([{ field_key: "opportunity_status", operator: "equals", value: "open" }])).toEqual([]);
        const grains = resolveWorkViewStageGrains([], STAGE_GRAIN_BY_KEY);
        expect(new Set(grains)).toEqual(new Set(["family", "child"]));
    });
});

describe("QA1 — Stage membership durable states", () => {
    it("child stages map to their durable enrollment state", () => {
        expect(enrollmentStageMembership("waitlist")).toEqual({ grain: "child", states: [{ key: "waitlisted", label: "Waitlisted" }] });
        expect(enrollmentStageMembership("enrolling")).toEqual({ grain: "child", states: [{ key: "enrolling", label: "Enrolling" }] });
        expect(enrollmentStageMembership("enrolled")).toEqual({ grain: "child", states: [{ key: "enrolled", label: "Enrolled" }] });
    });

    it("closed_withdrawn includes withdrawn + not_enrolling", () => {
        const m = enrollmentStageMembership("closed_withdrawn");
        expect(m?.grain).toBe("child");
        expect(m?.states.map((s) => s.key)).toEqual(["withdrawn", "not_enrolling"]);
    });

    it("family stages map to lead durable status (open / closed)", () => {
        expect(enrollmentStageMembership("lead")).toEqual({ grain: "family", states: [{ key: "open", label: "Open" }] });
        expect(enrollmentStageMembership("closed")).toEqual({ grain: "family", states: [{ key: "closed", label: "Closed" }] });
    });

    it("unknown stage → null", () => {
        expect(enrollmentStageMembership("nope")).toBeNull();
    });
});
