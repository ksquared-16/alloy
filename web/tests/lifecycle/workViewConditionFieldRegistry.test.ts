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
    it("field list excludes generic single-word Stage/Status keys (typed keys only)", () => {
        const keys = WORK_VIEW_FILTER_FIELD_OPTIONS.map((f) => f.key);
        expect(keys).not.toContain("stage");
        expect(keys).not.toContain("status");
        // The process-stage field is now labeled simply "Stage" (V3), but its key stays typed.
        expect(keys).toContain("opportunity_stage");
    });

    it("uses V3 operator-facing labels — Stage / Lead Status / Enrollment Status / Campus", () => {
        const labelByKey = Object.fromEntries(WORK_VIEW_FILTER_FIELD_OPTIONS.map((f) => [f.key, f.label]));
        // Stage is the process-stage field — labeled "Stage" (not the abstract "Lead Stage").
        expect(labelByKey.opportunity_stage).toBe("Stage");
        expect(labelByKey.opportunity_status).toBe("Lead Status");
        expect(labelByKey.site).toBe("Campus");
        // Renamed from "Child Enrollment Status" → "Enrollment Status".
        expect(labelByKey.child_enrollment_status).toBe("Enrollment Status");
        expect(labelByKey.program).toBe("Program");
        expect(labelByKey.room).toBe("Room");
        expect(labelByKey.start_date).toBe("Start date");
        expect(labelByKey.needs_attention).toBe("Needs Attention");
        expect(labelByKey.current_work).toBe("Current Work");
    });

    it("field picker is more than the V2 tiny list — covers the Enrollment needs set", () => {
        const keys = WORK_VIEW_FILTER_FIELD_OPTIONS.map((f) => f.key);
        // The user's "Start with current Enrollment needs" set, all selectable + runtime-supported.
        expect(keys).toEqual(
            expect.arrayContaining([
                "opportunity_stage", // Stage
                "opportunity_status", // Lead Status
                "child_enrollment_status", // Enrollment Status
                "site", // Campus/School
                "program",
                "room",
                "start_date", // Start date
                "needs_attention",
                "current_work",
            ]),
        );
        // Strictly larger than the V2 9-field list.
        expect(keys.length).toBeGreaterThanOrEqual(11);
    });

    it("groups fields by operational subject — Lead / Child / Household / Operational", () => {
        const groups = workViewConditionFieldGroups();
        expect(groups.map((g) => g.label)).toEqual(["Lead", "Child", "Household", "Operational"]);
        const byKey = Object.fromEntries(groups.map((g) => [g.key, g.fields.map((f) => f.key)]));
        expect(byKey.lead).toEqual(expect.arrayContaining(["opportunity_stage", "opportunity_status"]));
        expect(byKey.child).toEqual(
            expect.arrayContaining(["child_enrollment_status", "program", "room", "start_date"]),
        );
        expect(byKey.household).toContain("site");
        expect(byKey.operational).toEqual(expect.arrayContaining(["needs_attention", "current_work"]));
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

    it("Enrollment Status pulls the full configured child/OCM status set (not a hardcoded subset)", () => {
        // Option source is the OCM status-definitions set — resolved server-side from effective
        // status_definitions (org defs ∪ industry defaults), never an in-code enumerated subset.
        expect(getWorkViewConditionField("child_enrollment_status")?.optionSource).toEqual({
            kind: "status_definitions",
            entityType: "opportunity_customer_members",
        });
        // The renamed/aliased keys still resolve to the same typed field.
        expect(getWorkViewConditionField("enrollment_status")?.key).toBe("child_enrollment_status");
    });

    it("Campus pulls real campus/site locations, not a polluted all-locations list", () => {
        // The field's option source is `locations`; the editor requests `location_type=site` so only
        // real campuses appear (units/addresses/scaffolding excluded).
        expect(getWorkViewConditionField("site")?.optionSource).toEqual({ kind: "locations" });
        expect(getWorkViewConditionField("site")?.label).toBe("Campus");
    });

    it("Room pulls room/unit locations via a dedicated option source", () => {
        expect(getWorkViewConditionField("room")?.optionSource).toEqual({ kind: "rooms" });
        expect(getWorkViewConditionField("room")?.valueKind).toBe("room_select");
    });

    it("Stage options come from configured process stages (not a status set)", () => {
        const stage = getWorkViewConditionField("opportunity_stage");
        expect(stage?.optionSource).toEqual({ kind: "process_stages" });
        expect(stage?.valueKind).toBe("stage_select");
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
