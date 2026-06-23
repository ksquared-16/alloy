/**
 * Layout Configuration Polish — naming, context pickers, queue widgets, assignment filtering.
 */

import { describe, expect, it } from "vitest";
import { buildChildDrawerEditorFieldPickerGroups } from "@/lib/layout/childDrawerLayoutEditorFieldCatalog";
import { buildPersonDrawerEditorFieldPickerGroups } from "@/lib/layout/personDrawerLayoutEditorFieldCatalog";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import {
    isAllowedQueueRecordWidgetKey,
    QUEUE_RECORD_PIPELINE_WIDGET_KEYS,
} from "@/lib/layout/queueRecordLayoutAllowList";
import { defaultLayoutDisplayNameForDoc } from "@/lib/layout/defaultLayoutDisplayName";
import { buildLeadDrawerDefaultDoc, buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import { publishedLayoutOptionsForAssignmentSlot } from "@/lib/layout/layoutAssignmentLayoutOptions";
import { validateQueueRecordLayoutConfig } from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";
import { normalizeQueueRecordLayoutConfig } from "@/lib/layout/runtime/normalizeQueueRecordLayoutConfig";
import { buildWaitlistCandidateCardDefaultDoc } from "@/lib/layout/defaultWaitlistLayouts";
import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";
import {
    isAllowedChildDrawerFieldRefKey,
    isAllowedPersonDrawerFieldRefKey,
    isAllowedOpportunityDrawerFieldRefKey,
} from "@/lib/layout/surfaceLayoutRegistry";

function layoutRecord(
    id: string,
    doc: LayoutDoc,
    partial?: Partial<EntityLayoutRecord>,
): EntityLayoutRecord {
    return {
        id,
        orgId: "org-1",
        industryKey: null,
        entityType: doc.entityType,
        surface: doc.surface,
        layoutKey: "default",
        name: "Test Layout",
        version: 1,
        status: "published",
        isSystemDefault: false,
        doc,
        metadata: null,
        createdBy: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: null,
        publishedAt: "2026-01-01T00:00:00Z",
        ...partial,
    };
}

describe("context-first drawer field pickers", () => {
    it("child drawer groups Current Child context", () => {
        const groups = buildChildDrawerEditorFieldPickerGroups();
        expect(groups.some((g) => g.entityLabel === "Current Child")).toBe(true);
    });

    it("person drawer groups Linked Children context", () => {
        const groups = buildPersonDrawerEditorFieldPickerGroups();
        expect(groups.some((g) => g.entityLabel === "Linked Children")).toBe(true);
    });

    it("opportunity drawer exposes Primary Contact context with is_primary_contact", () => {
        const groups = buildOpportunityDrawerEditorFieldPickerGroups();
        const primary = groups.find((g) => g.entityLabel === "Primary Contact");
        expect(primary?.fields.some((f) => f.refKey === "person.is_primary_contact")).toBe(true);
    });

    it("picker refs remain within surface allow-list (child drawer)", () => {
        const groups = buildChildDrawerEditorFieldPickerGroups();
        for (const group of groups) {
            for (const field of group.fields) {
                expect(isAllowedChildDrawerFieldRefKey(field.refKey)).toBe(true);
            }
        }
    });

    it("picker refs remain within surface allow-list (person drawer)", () => {
        const groups = buildPersonDrawerEditorFieldPickerGroups();
        for (const group of groups) {
            for (const field of group.fields) {
                expect(isAllowedPersonDrawerFieldRefKey(field.refKey)).toBe(true);
            }
        }
    });

    it("picker refs remain within surface allow-list (opportunity drawer)", () => {
        const groups = buildOpportunityDrawerEditorFieldPickerGroups();
        for (const group of groups) {
            for (const field of group.fields) {
                expect(isAllowedOpportunityDrawerFieldRefKey(field.refKey)).toBe(true);
            }
        }
    });
});

describe("queue row widget allow-list", () => {
    it("includes current_work, follow_ups and keeps tasks for backward compatibility", () => {
        expect(QUEUE_RECORD_PIPELINE_WIDGET_KEYS).toContain("current_work");
        expect(QUEUE_RECORD_PIPELINE_WIDGET_KEYS).toContain("follow_ups");
        expect(QUEUE_RECORD_PIPELINE_WIDGET_KEYS).toContain("tasks");
        expect(isAllowedQueueRecordWidgetKey("current_work")).toBe(true);
        expect(isAllowedQueueRecordWidgetKey("follow_ups")).toBe(true);
    });

    it("default pipeline queue layout validates with current_work widget", () => {
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const result = validateQueueRecordLayoutConfig(config, { isWaitlist: false });
        expect(result.ok).toBe(true);
    });
});

describe("layout display naming", () => {
    it("defaults new layout name from surface registry label", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const name = defaultLayoutDisplayNameForDoc(doc, "opportunities", "drawer");
        expect(name).toBe("Opportunity Drawer");
    });
});

describe("published layout assignment filtering", () => {
    it("excludes waitlist doc from pipeline queue slot options", () => {
        const waitlistDoc = buildWaitlistCandidateCardDefaultDoc();
        const records = [
            layoutRecord("pipeline-1", buildLeadQueueDefaultDoc(), {
                entityType: "opportunities",
                surface: "queue",
                layoutKey: "default",
            }),
            layoutRecord("waitlist-1", waitlistDoc, {
                entityType: "placement_candidate",
                surface: "queue",
                layoutKey: "waitlist_candidate_card",
            }),
        ];
        const pipelineOptions = publishedLayoutOptionsForAssignmentSlot(records, "queue_record");
        expect(pipelineOptions).toHaveLength(1);
        expect(pipelineOptions[0]?.id).toBe("pipeline-1");
    });

    it("excludes draft layouts from assignment options", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const records = [
            layoutRecord("draft-1", doc, { status: "draft" }),
            layoutRecord("pub-1", doc, { status: "published", version: 2 }),
        ];
        const options = publishedLayoutOptionsForAssignmentSlot(records, "opportunity_drawer");
        expect(options).toHaveLength(1);
        expect(options[0]?.id).toBe("pub-1");
    });
});

describe("address picker labels", () => {
    it("uses disambiguated person and household address labels", async () => {
        const { applyChildcareCatalogLabel } = await import("@/lib/layout/childcareLayoutFieldCatalog");
        expect(applyChildcareCatalogLabel({ refKey: "person.address_line1", fieldLabel: "" }).fieldLabel).toBe(
            "Person address line 1",
        );
        expect(applyChildcareCatalogLabel({ refKey: "location.household_address_line1", fieldLabel: "" }).fieldLabel).toBe(
            "Shared mailing address line 1",
        );
        expect(applyChildcareCatalogLabel({ refKey: "location.address1", fieldLabel: "" }).fieldLabel).toBe(
            "Site address line 1",
        );
    });
});
