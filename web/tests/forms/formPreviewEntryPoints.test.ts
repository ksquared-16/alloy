import { describe, expect, it } from "vitest";
import { previewLaunchContextFromMetadata } from "@/lib/forms/preview/formPreviewOrchestration";

/**
 * Preview entry-point audit — documents supported modes without UI harness.
 *
 * | Entry point | Product-supported | Preview mode | formDefinitionId | launch context | orchestration |
 */
describe("Forms/Documents preview entry points", () => {
    it("document composition editor runtime panel — design placeholder without launch context", () => {
        expect(previewLaunchContextFromMetadata(null)).toBeNull();
    });

    it("lifecycle workspace — context-backed when selected link carries customer_id", () => {
        const ctx = previewLaunchContextFromMetadata({
            customer_id: "cust-abc",
            form_context_mode: "existing_record",
        });
        expect(ctx?.customer_id).toBe("cust-abc");
    });

    it("admin preview embed — respondent runtime via public link mint (no inline orchestration)", () => {
        expect(previewLaunchContextFromMetadata({ alloy_admin_preview: true })).toBeNull();
    });

    it("document composition layout preview — design-only schema canvas (not record-backed)", () => {
        expect(previewLaunchContextFromMetadata(undefined)).toBeNull();
    });
});
