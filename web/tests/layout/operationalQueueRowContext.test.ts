import { describe, expect, it } from "vitest";
import { buildPartialQueueRowContext } from "@/lib/workUnits/buildPartialQueueRowContext";
import {
    applyQueueRowContextToLayoutRecord,
    mergeOperationalVmWithQueueRowContext,
} from "@/lib/layout/runtime/applyQueueRowContextToLayoutRuntime";
import { buildOperationalQueueRecordViewModelFromLayout } from "@/lib/layout/runtime/buildOperationalQueueRecordViewModel";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

const queue = { key: "tours", label: "Tours", lifecycle_key: "enrollment", stage_key: "tour" };

describe("operational queue row QueueRowContext", () => {
    it("renders context-first values on layout record and VM", () => {
        const context = buildPartialQueueRowContext({
            row: {
                id: "opp-1",
                name: "Smith Household",
                status_key: "tour_scheduled",
                _status_display: "Tour scheduled",
                _primary_contact_line: "Sarah Smith",
                _primary_phone: "555-0100",
                metadata: {
                    inquiry_children: [
                        {
                            id: "ocm-a",
                            display_name: "Riley Smith",
                            outcome_status_label: "Touring",
                            location_id: "loc-1",
                            location_label: "Main Campus",
                            desired_program_label: "Toddler Room",
                        },
                    ],
                },
            },
            queue,
        });

        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Legacy Title",
            quickActions: [],
            _queue_row_context: context,
            semanticCrmCompact: {
                primaryIdentity: "Legacy Title",
                childName: null,
                contactDisplayName: "Old Contact",
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "Old Status",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: [],
            },
        };

        const doc = buildLeadQueueDefaultDoc();
        const config = defaultLeadQueueLayoutV3();
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        expect(record["customer.display_name"]).toBe("Smith Household");
        expect(record["queue_row.stage_label"]).toBe("Tours");
        expect(record["opportunity.status_label"]).toBe("Tour scheduled");
        expect(String(record["opportunity.location"])).toContain("Main Campus");
        expect(record["person.primary_contact_name"]).toBe("Sarah Smith");

        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record, config);
        expect(vm.identity.title).toBe("Smith Household");
        expect(vm.status.label).toContain("Tour scheduled");
        expect(vm.status.label).toContain("Tours");
        expect(vm.relatedRecords.chips.some((c) => c.display === "Riley Smith")).toBe(true);
    });

    it("falls back to legacy record values without context", () => {
        const record = applyQueueRowContextToLayoutRecord({
            name: "Legacy Family",
            "customer.display_name": "Legacy Family",
            _status_display: "Qualified",
            "opportunity.status_label": "Qualified",
            "person.primary_contact_name": "Jordan Lee",
        });
        expect(record._queue_row_context).toBeUndefined();
        expect(record.name).toBe("Legacy Family");

        expect(record["customer.display_name"]).toBe("Legacy Family");
        const doc = buildLeadQueueDefaultDoc();
        const config = defaultLeadQueueLayoutV3();
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record, config);
        expect(vm.status.label).toBe("Qualified");
    });

    it("omits placement field visibility when placement_context is absent", () => {
        const context = buildPartialQueueRowContext({
            row: {
                id: "opp-1",
                name: "Mixed Household",
                status_key: "tour_scheduled",
                _inquiry_children: [
                    {
                        id: "ocm-a",
                        display_name: "Child A",
                        location_id: "loc-1",
                        location_label: "North",
                        desired_program_type: "toddler",
                    },
                    {
                        id: "ocm-b",
                        display_name: "Child B",
                        location_id: "loc-2",
                        location_label: "South",
                        desired_program_type: "preschool",
                    },
                ],
            },
            queue,
        });

        const record = applyQueueRowContextToLayoutRecord({ id: "opp-1", name: "Mixed" }, context);
        expect(record["opportunity.location"]).toBeUndefined();
        expect(
            evaluateLayoutCondition(record, { type: "exists", path: "opportunity.location" }),
        ).toBe(false);
    });

    it("mergeOperationalVmWithQueueRowContext is noop without context", () => {
        const vm = {
            identity: {
                title: "Keep",
                contactName: null,
                contactPhone: null,
                contactEmail: null,
                contactAdornment: null,
                contactItem: null,
            },
            relatedRecords: { label: "Related", entityType: "child", chips: [], emptyLabel: "None" },
            status: { label: "Open", context: null },
            attention: { reason: null, nextStep: null },
            date: { label: "Tour", value: null, missingLabel: "Not scheduled" },
            actionLabels: [],
            hasAttention: false,
        };
        expect(mergeOperationalVmWithQueueRowContext(vm, { name: "Keep" })).toBe(vm);
    });

    it("default lead preset includes queue_row context field keys", () => {
        const layout = defaultLeadQueueLayoutV3();
        const fieldKeys = layout.columns.flatMap((col) =>
            col.blocks.flatMap((block) =>
                block.type === "field_group" || block.type === "repeated_record_block" ? block.fields.map((f) => f.fieldKey) : [],
            ),
        );
        expect(fieldKeys).toContain("queue_row.subject_label");
        expect(fieldKeys).toContain("queue_row.stage_label");
        expect(fieldKeys).toContain("queue_row.group_count_label");
        expect(fieldKeys).toContain("queue_row.work_summary");
        expect(fieldKeys).toContain("queue_row.next_best_action_label");
    });
});
