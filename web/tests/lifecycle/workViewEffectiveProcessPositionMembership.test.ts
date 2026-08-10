/**
 * Work View opportunity_stage membership via Effective Process Position.
 */

import { describe, expect, it } from "vitest";

import { evaluateWorkViewFiltersForRow } from "@/lib/lifecycle/evaluateWorkViewFiltersV1";
import type { WorkViewFilterV1 } from "@/lib/lifecycle/workViewsConfigV1";

const leadFilter: WorkViewFilterV1[] = [
    { field_key: "opportunity_stage", operator: "equals", value: "lead" },
];

describe("Work View opportunity_stage — Effective Process Position", () => {
    it("keeps family in Lead when one participant remains effectively Lead", () => {
        const row = {
            id: "opp",
            stage_key: "lead",
            lifecycle_stage_key: "lead",
            _effective_participant_stage_keys: ["waitlist", "lead"],
        };
        expect(evaluateWorkViewFiltersForRow(row, leadFilter).pass).toBe(true);
    });

    it("removes family from Lead when all participants are Waitlist (even if stage_key stays lead)", () => {
        const row = {
            id: "opp",
            stage_key: "lead",
            lifecycle_stage_key: "lead",
            _effective_participant_stage_keys: ["waitlist", "waitlist"],
        };
        expect(evaluateWorkViewFiltersForRow(row, leadFilter).pass).toBe(false);
    });

    it("uses context stage when participant keys are present but empty (no children yet)", () => {
        const row = {
            id: "opp",
            stage_key: "lead",
            _effective_participant_stage_keys: [],
        };
        expect(evaluateWorkViewFiltersForRow(row, leadFilter).pass).toBe(true);
    });

    it("falls back to lifecycle_stage_key when EPP keys are absent (legacy rows)", () => {
        const row = {
            id: "opp",
            stage_key: "lead",
            lifecycle_stage_key: "lead",
        };
        expect(evaluateWorkViewFiltersForRow(row, leadFilter).pass).toBe(true);
    });
});
