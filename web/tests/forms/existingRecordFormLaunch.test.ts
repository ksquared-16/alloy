import { describe, expect, it } from "vitest";
import {
    buildExistingRecordAttachTargetView,
    mergeExistingRecordLaunchMetadata,
    parseExistingRecordLaunchBody,
} from "@/lib/forms/existingRecord/existingRecordFormLaunch";

describe("existingRecordFormLaunch", () => {
    it("parses launch_from_entity body", () => {
        const parsed = parseExistingRecordLaunchBody({
            entity_type: "opportunity",
            entity_id: "11111111-1111-4111-8111-111111111111",
        });
        expect("error" in parsed).toBe(false);
        if (!("error" in parsed)) {
            expect(parsed.entityType).toBe("opportunity");
        }
    });

    it("merges attach intake metadata for existing family", () => {
        const meta = mergeExistingRecordLaunchMetadata(
            {},
            {
                entityType: "opportunity",
                entityId: "11111111-1111-4111-8111-111111111111",
            }
        );
        expect(meta.form_context_mode).toBe("existing_record");
        expect(meta.auto_create_opportunity).toBe(false);
        expect(meta.lead_capture).toBe(true);
        expect(meta.intake).toBe(true);
        expect(meta.prefill_enabled).toBe(true);
        expect(meta.prefill_field_map).toBeTruthy();
    });

    it("supports prefill-only legacy mode", () => {
        const meta = mergeExistingRecordLaunchMetadata(
            {},
            {
                entityType: "person",
                entityId: "22222222-2222-4222-8222-222222222222",
                prefillOnly: true,
            }
        );
        expect(meta.lead_capture).toBe(false);
        expect(meta.intake).toBe(false);
    });

    it("builds attach target preview lines", () => {
        const view = buildExistingRecordAttachTargetView({
            entityType: "opportunity",
            entityLabel: "Smith enrollment",
            familyLabel: "Smith Family",
            workflowLabel: "West Campus enrollment",
        });
        expect(view.attachSummaryLines.some((l) => l.includes("Smith Family"))).toBe(true);
        expect(view.attachSummaryLines.some((l) => l.includes("no new lead"))).toBe(true);
    });
});
