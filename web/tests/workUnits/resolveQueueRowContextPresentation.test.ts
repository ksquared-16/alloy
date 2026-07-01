import { describe, expect, it } from "vitest";
import { buildPartialQueueRowContext } from "@/lib/workUnits/buildPartialQueueRowContext";
import {
    applyQueueRowContextToLayoutRecord,
    mergeOperationalVmWithQueueRowContext,
} from "@/lib/layout/runtime/applyQueueRowContextToLayoutRuntime";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import { QUEUE_ROW_CONTEXT_CONTRACT_VERSION } from "@/lib/workUnits/lifecycleSubjectContracts";
import {
    inferPlacementOmittedBecauseMixed,
    resolveQueueRowContextPresentation,
} from "@/lib/workUnits/resolveQueueRowContextPresentation";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

const queue = { key: "tours", label: "Tours", lifecycle_key: "enrollment", stage_key: "tour" };

describe("resolveQueueRowContextPresentation", () => {
    it("renders context values when _queue_row_context is present", () => {
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
                            display_name: "Child A",
                            outcome_status_label: "Touring",
                            location_id: "loc-1",
                            location_label: "Main Campus",
                            desired_program_label: "Toddler",
                        },
                    ],
                },
            },
            queue,
        });

        const presentation = resolveQueueRowContextPresentation({ context });
        expect(presentation.primaryLabel).toBe("Smith Household");
        expect(presentation.statusLabel).toBe("Tour scheduled");
        expect(presentation.stageLabel).toBe("Tours");
        expect(presentation.primaryContact?.display_name).toBe("Sarah Smith");
        expect(presentation.placementSummary).toContain("Main Campus");
        expect(presentation.relatedChildrenSummary).toHaveLength(1);
        expect(presentation.debug.contextPresent).toBe(true);
        expect(presentation.debug.contractVersion).toBe(QUEUE_ROW_CONTEXT_CONTRACT_VERSION);
    });

    it("falls back to legacy record fields without context", () => {
        const presentation = resolveQueueRowContextPresentation({
            legacy: {
                record: {
                    name: "Legacy Family",
                    _status_display: "Qualified",
                    "opportunity.location": "North Site",
                    "person.primary_contact_name": "Jordan Lee",
                },
            },
        });

        expect(presentation.primaryLabel).toBe("Legacy Family");
        expect(presentation.statusLabel).toBe("Qualified");
        expect(presentation.placementSummary).toBe("North Site");
        expect(presentation.primaryContact?.display_name).toBe("Jordan Lee");
        expect(presentation.debug.contextPresent).toBe(false);
    });

    it("does not show placement when context omitted mixed placements", () => {
        const context = buildPartialQueueRowContext({
            row: {
                id: "opp-1",
                name: "Smith Household",
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

        expect(context.placement_context).toBeUndefined();
        expect(inferPlacementOmittedBecauseMixed(context)).toBe(true);

        const presentation = resolveQueueRowContextPresentation({ context });
        expect(presentation.placementSummary).toBeNull();
        expect(presentation.debug.placementOmittedMixed).toBe(true);
        expect(presentation.relatedChildrenSummary.length).toBeGreaterThan(1);
    });
});

describe("layout runtime queue context consumption", () => {
    it("overlays record and vm from queue preview item context", () => {
        const context = buildPartialQueueRowContext({
            row: {
                id: "opp-1",
                name: "Smith Household",
                status_key: "tour_scheduled",
                _status_display: "Tour scheduled",
                _primary_contact_line: "Sarah Smith",
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

        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record.name).toBe("Smith Household");
        expect(record["opportunity.status_label"]).toBe("Tour scheduled");
        expect(record["person.primary_contact_name"]).toBe("Sarah Smith");
        expect(String(record["opportunity.location"])).toContain("Main Campus");

        const children = record.children as Array<Record<string, unknown>>;
        expect(children.some((c) => c["child.name"] === "Riley Smith")).toBe(true);
        expect(record._queue_row_context).toBeDefined();
    });

    it("applyQueueRowContextToLayoutRecord preserves legacy when context absent", () => {
        const record = applyQueueRowContextToLayoutRecord({
            name: "Keep Me",
            _status_display: "Open",
        });
        expect(record.name).toBe("Keep Me");
        expect(record._queue_row_context).toBeUndefined();
    });

    it("mergeOperationalVmWithQueueRowContext is noop without context on record", () => {
        const vm = {
            identity: { title: "Keep", contactName: null, contactPhone: null, contactEmail: null, contactAdornment: null, contactItem: null },
            relatedRecords: { label: "Related", entityType: "child", chips: [], emptyLabel: "None" },
            status: { label: "Open", context: null },
            attention: { reason: null, nextStep: null },
            date: { label: "Tour", value: null, missingLabel: "Not scheduled" },
            actionLabels: [],
            hasAttention: false,
        };
        const merged = mergeOperationalVmWithQueueRowContext(vm, { name: "Keep" });
        expect(merged).toBe(vm);
    });
});
