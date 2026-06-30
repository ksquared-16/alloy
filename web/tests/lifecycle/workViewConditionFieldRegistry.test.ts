import { describe, expect, it } from "vitest";
import {
    canonicalWorkViewConditionFieldKey,
    getWorkViewConditionField,
    isLegacyWorkViewConditionFieldKey,
    WORK_VIEW_CONDITION_FIELD_DEFS,
    workViewConditionFieldGroups,
} from "@/lib/lifecycle/workViewConditionFieldRegistry";
import { WORK_VIEW_FILTER_FIELD_OPTIONS } from "@/lib/lifecycle/workViewsConfigV1";
import { resolveWorkViewFilterValueControlKind } from "@/lib/lifecycle/workViewFilterValueControls";

describe("workViewConditionFieldRegistry", () => {
    it("field list excludes generic Stage and Status", () => {
        const keys = WORK_VIEW_FILTER_FIELD_OPTIONS.map((f) => f.key);
        expect(keys).not.toContain("stage");
        expect(keys).not.toContain("status");
        const labels = WORK_VIEW_FILTER_FIELD_OPTIONS.map((f) => f.label);
        expect(labels).not.toContain("Stage");
        expect(labels).not.toContain("Status");
    });

    it("uses operator-facing Lead/Campus labels for the typed fields", () => {
        const labelByKey = Object.fromEntries(WORK_VIEW_FILTER_FIELD_OPTIONS.map((f) => [f.key, f.label]));
        expect(labelByKey.opportunity_stage).toBe("Lead Stage");
        expect(labelByKey.opportunity_status).toBe("Lead Status");
        expect(labelByKey.site).toBe("Campus");
        expect(labelByKey.child_enrollment_status).toBe("Child Enrollment Status");
        expect(labelByKey.program).toBe("Program");
        expect(labelByKey.needs_attention).toBe("Needs Attention");
    });

    it("exposes typed operational fields that replace generic Stage/Status", () => {
        const keys = WORK_VIEW_FILTER_FIELD_OPTIONS.map((f) => f.key);
        expect(keys).toEqual(
            expect.arrayContaining([
                "opportunity_stage",
                "opportunity_status",
                "child_enrollment_status",
                "site",
                "program",
                "needs_attention",
            ]),
        );
    });

    it("groups fields by operational subject — Lead / Child / Household / Operational", () => {
        const groups = workViewConditionFieldGroups();
        expect(groups.map((g) => g.label)).toEqual(["Lead", "Child", "Household", "Operational"]);
        const byKey = Object.fromEntries(groups.map((g) => [g.key, g.fields.map((f) => f.key)]));
        expect(byKey.lead).toEqual(expect.arrayContaining(["opportunity_stage", "opportunity_status"]));
        expect(byKey.child).toEqual(expect.arrayContaining(["child_enrollment_status", "program"]));
        expect(byKey.household).toContain("site");
        expect(byKey.operational).toContain("needs_attention");
    });

    it("Opportunity Stage pulls configured lifecycle stage options", () => {
        expect(getWorkViewConditionField("opportunity_stage")?.optionSource).toEqual({ kind: "process_stages" });
    });

    it("Opportunity Status pulls opportunity status definitions only", () => {
        expect(getWorkViewConditionField("opportunity_status")?.optionSource).toEqual({
            kind: "status_definitions",
            entityType: "opportunities",
        });
    });

    it("Child Enrollment Status pulls child/OCM status definitions only", () => {
        expect(getWorkViewConditionField("child_enrollment_status")?.optionSource).toEqual({
            kind: "status_definitions",
            entityType: "opportunity_customer_members",
        });
    });

    it("Stage and Status no longer resolve to the same control or option source", () => {
        // Different value-control kinds…
        expect(resolveWorkViewFilterValueControlKind("opportunity_stage", "equals")).toBe("stage_select");
        expect(resolveWorkViewFilterValueControlKind("opportunity_status", "equals")).toBe("status_select");
        // …and different option sources (the V1 bug had both reading the opportunity status set).
        const stageSource = getWorkViewConditionField("opportunity_stage")?.optionSource;
        const statusSource = getWorkViewConditionField("opportunity_status")?.optionSource;
        expect(stageSource).not.toEqual(statusSource);
    });

    it("normalizes legacy generic keys to canonical typed keys", () => {
        expect(canonicalWorkViewConditionFieldKey("stage")).toBe("opportunity_stage");
        expect(canonicalWorkViewConditionFieldKey("status")).toBe("opportunity_status");
        expect(canonicalWorkViewConditionFieldKey("location")).toBe("site");
        expect(canonicalWorkViewConditionFieldKey("opportunity_stage")).toBe("opportunity_stage");
        expect(isLegacyWorkViewConditionFieldKey("stage")).toBe(true);
        expect(isLegacyWorkViewConditionFieldKey("opportunity_stage")).toBe(false);
    });

    it("every registry field declares a runtime resolver and is runtime-supported", () => {
        for (const def of WORK_VIEW_CONDITION_FIELD_DEFS) {
            expect(def.runtimeField).toBeTruthy();
            expect(def.runtimeSupported).toBe(true);
            expect(def.operators.length).toBeGreaterThan(0);
        }
    });
});
