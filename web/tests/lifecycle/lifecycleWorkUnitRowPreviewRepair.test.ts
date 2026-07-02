import { describe, expect, it } from "vitest";
import { lifecycleStageQueueRowPreviewFields } from "@/lib/lifecycle/lifecycleStageQueuePresentation";
import {
    applyLifecycleWorkUnitQueueUiOverlay,
    mergeLifecycleStageRowPreviewIntoQueueDefinition,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";

describe("lifecycleWorkUnitRowPreviewRepair", () => {
    it("merges phone email and dates into stale stored queue_definition", () => {
        const stale = {
            version: 2,
            entity_type: "opportunity",
            ui: {
                row_preview: {
                    variant: "crm_compact",
                    fields: ["title", "status", "primary_contact"],
                    actions: ["open"],
                },
            },
            queues: [
                {
                    key: "lifecycle_lead",
                    label: "Lead",
                    grain: "case",
                    filters_compat_v1: [{ type: "status", operator: "in", values: ["new_inquiry"] }],
                    filters: [],
                },
            ],
        };
        const merged = mergeLifecycleStageRowPreviewIntoQueueDefinition(stale, "lead");
        const bundle = loadQueueDefinitionBundle(merged);
        const ui = getQueueUiConfig(bundle.def);
        expect(ui.row_preview.fields).toEqual(lifecycleStageQueueRowPreviewFields("lead"));
        expect(ui.row_preview.fields).toContain("phone");
        expect(ui.row_preview.fields).toContain("email");
        expect(ui.row_preview.fields).toContain("tour_date");
        expect(ui.row_preview.fields).toContain("start_date");
    });

    it("waitlist overlay omits tour_date", () => {
        const ui = applyLifecycleWorkUnitQueueUiOverlay(
            getQueueUiConfig({
                entity_type: "opportunity",
                queues: [{ key: "lifecycle_waitlist", label: "Waitlist", filters: [] }],
            } as never),
            "waitlist"
        );
        expect(ui.row_preview.fields).toContain("phone");
        expect(ui.row_preview.fields).toContain("email");
        expect(ui.row_preview.fields).not.toContain("tour_date");
    });
});
