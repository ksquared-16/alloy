import { describe, expect, it } from "vitest";
import { resolveCreatedRecordProcessContextHref } from "@/lib/platform/commands/createLead/resolveCreatedRecordProcessContextHref";

describe("resolveCreatedRecordProcessContextHref", () => {
    it("prefers Work View route slug when config resolved a matching view", () => {
        expect(
            resolveCreatedRecordProcessContextHref({
                recordId: "opp-1",
                workUnitKey: "pipeline",
                workViewId: "fresh_prospects",
            }),
        ).toBe("/workspace/work-unit/fresh-prospects/opp-1");
    });

    it("falls back to work unit key when no Work View match", () => {
        expect(
            resolveCreatedRecordProcessContextHref({
                recordId: "opp-1",
                workUnitKey: "pipeline",
                workViewId: null,
            }),
        ).toBe("/workspace/work-unit/pipeline/opp-1");
    });
});
