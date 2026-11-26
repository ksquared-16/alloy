import { describe, expect, it } from "vitest";
import { resolveCreatedRecordProcessContextHref } from "@/lib/platform/commands/createLead/resolveCreatedRecordProcessContextHref";

describe("resolveCreatedRecordProcessContextHref", () => {
    it("prefers label route key + work_view_id lens (operator nav shape)", () => {
        expect(
            resolveCreatedRecordProcessContextHref({
                recordId: "opp-1",
                workUnitKey: "lifecycle_wu_lead",
                workViewId: "new_leads",
                workViewRouteKey: "leads",
            }),
        ).toBe("/workspace/work-unit/leads?work_view_id=new_leads&subject_id=opp-1");
    });

    it("uses work view id as path slug when no label route key is provided", () => {
        expect(
            resolveCreatedRecordProcessContextHref({
                recordId: "opp-1",
                workUnitKey: "pipeline",
                workViewId: "fresh_prospects",
            }),
        ).toBe("/workspace/work-unit/fresh-prospects?work_view_id=fresh_prospects&subject_id=opp-1");
    });

    it("falls back to work unit key when no Work View match", () => {
        expect(
            resolveCreatedRecordProcessContextHref({
                recordId: "opp-1",
                workUnitKey: "pipeline",
                workViewId: null,
            }),
        ).toBe("/workspace/work-unit/pipeline?subject_id=opp-1");
    });
});
