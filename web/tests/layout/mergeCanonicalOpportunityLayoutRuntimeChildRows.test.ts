import { describe, expect, it } from "vitest";

import {
    layoutRuntimeChildRowMatchKey,
    mergeCanonicalOpportunityLayoutRuntimeChildRows,
} from "@/lib/layout/runtime/mergeCanonicalOpportunityLayoutRuntimeChildRows";
import { resolveOpportunityLayoutRuntimeChildrenRows } from "@/lib/layout/runtime/mapLayoutRuntimeChildrenRows";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

function inquiryRow(overrides: Record<string, unknown>) {
    return {
        id: "inq-default",
        ...overrides,
    };
}

describe("mergeCanonicalOpportunityLayoutRuntimeChildRows", () => {
    it("returns inquiry-only rows when no household source exists", () => {
        const rows = mergeCanonicalOpportunityLayoutRuntimeChildRows({
            inquiryChildren: [
                inquiryRow({
                    id: "inq-1",
                    person_id: "person-inq",
                    display_name: "Manual Child",
                    desired_program_label: "Preschool",
                }),
            ],
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.["child.name"]).toBe("Manual Child");
        expect(rows[0]?._layout_runtime_child_source).toBe("inquiry_only");
        expect(rows[0]?.["child.program"]).toBe("Preschool");
    });

    it("returns household-only rows with empty enrollment context", () => {
        const rows = mergeCanonicalOpportunityLayoutRuntimeChildRows({
            householdChildren: [
                {
                    person_id: "person-house",
                    customer_member_id: "cm-house",
                    display_name: "Household Child",
                },
            ],
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.["child.name"]).toBe("Household Child");
        expect(rows[0]?._layout_runtime_child_source).toBe("household_only");
        expect(rows[0]?.["child.program"]).toBe("");
    });

    it("merges inquiry enrollment onto matching household rows and keeps unmatched household children", () => {
        const rows = mergeCanonicalOpportunityLayoutRuntimeChildRows({
            inquiryChildren: [
                inquiryRow({
                    id: "inq-a",
                    person_id: "person-a",
                    customer_member_id: "cm-a",
                    display_name: "Mia Mitchell",
                    desired_program_label: "Preschool",
                    desired_start_date: "2026-09-01",
                }),
            ],
            householdChildren: [
                { person_id: "person-a", customer_member_id: "cm-a", display_name: "Mia Mitchell" },
                { person_id: "person-b", customer_member_id: "cm-b", display_name: "Alex Kelly" },
            ],
        });
        expect(rows).toHaveLength(2);
        expect(rows[0]?.["child.name"]).toBe("Mia Mitchell");
        expect(rows[0]?._layout_runtime_child_source).toBe("household_with_enrollment");
        expect(rows[0]?.["child.program"]).toBe("Preschool");
        expect(rows[1]?.["child.name"]).toBe("Alex Kelly");
        expect(rows[1]?._layout_runtime_child_source).toBe("household_only");
    });

    it("appends inquiry-only manual children after household rows", () => {
        const rows = mergeCanonicalOpportunityLayoutRuntimeChildRows({
            inquiryChildren: [
                inquiryRow({
                    id: "inq-linked",
                    person_id: "person-linked",
                    display_name: "Linked Child",
                    desired_program_label: "Toddler",
                }),
                inquiryRow({
                    id: "inq-manual",
                    person_id: "person-manual",
                    display_name: "Manual Inquiry Child",
                    desired_program_label: "Infant",
                }),
            ],
            householdChildren: [{ person_id: "person-linked", display_name: "Linked Child" }],
        });
        expect(rows).toHaveLength(2);
        expect(rows[0]?._layout_runtime_child_source).toBe("household_with_enrollment");
        expect(rows[1]?.["child.name"]).toBe("Manual Inquiry Child");
        expect(rows[1]?._layout_runtime_child_source).toBe("inquiry_only");
    });

    it("matches household and inquiry rows by normalized display name when ids are missing", () => {
        const keyA = layoutRuntimeChildRowMatchKey({ "child.name": "Alex Kelly (6m)" });
        const keyB = layoutRuntimeChildRowMatchKey({ display_name: "Alex Kelly" });
        expect(keyA).toBe(keyB);

        const rows = mergeCanonicalOpportunityLayoutRuntimeChildRows({
            inquiryChildren: [
                inquiryRow({ id: "inq-alex", display_name: "Alex Kelly", desired_program_label: "Preschool" }),
            ],
            householdChildren: [{ display_name: "Alex Kelly (6m)" }],
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?._layout_runtime_child_source).toBe("household_with_enrollment");
    });
});

describe("resolveOpportunityLayoutRuntimeChildrenRows", () => {
    it("merges household and inquiry sources from VM record", () => {
        const rows = resolveOpportunityLayoutRuntimeChildrenRows({
            _inquiry_children: [
                inquiryRow({
                    id: "inq-mia",
                    person_id: "p1",
                    display_name: "Mia Mitchell",
                    desired_program_label: "PS",
                }),
            ],
            _household_children: [
                { person_id: "p1", display_name: "Mia Mitchell" },
                { person_id: "p2", display_name: "Alex Kelly" },
            ],
        });
        expect(rows).toHaveLength(2);
        expect(rows.some((r) => r["child.name"] === "Alex Kelly")).toBe(true);
    });
});

describe("queue preview child sourcing parity", () => {
    it("uses canonical merge for mixed CRM household lines and inquiry enrichment", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-mitchell",
            title: "Mitchell household",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell household",
                childName: null,
                childrenLines: [
                    { primary: "Mia Mitchell", personId: "p-mia" },
                    { primary: "Liam Mitchell", personId: "p-liam" },
                    { primary: "Sophia Mitchell", personId: "p-sophia" },
                    { primary: "Alex Kelly", personId: "p-alex-k" },
                    { primary: "Alex Lyons", personId: "p-alex-l" },
                ],
                statusLabel: "Contact Attempted",
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
                programContext: null,
            },
            layoutRuntimeEnrichment: {
                inquiryChildren: [
                    inquiryRow({
                        id: "inq-mia",
                        person_id: "p-mia",
                        display_name: "Mia Mitchell",
                        desired_program_label: "Preschool",
                    }),
                    inquiryRow({
                        id: "inq-liam",
                        person_id: "p-liam",
                        display_name: "Liam Mitchell",
                        desired_program_label: "Preschool",
                    }),
                    inquiryRow({
                        id: "inq-sophia",
                        person_id: "p-sophia",
                        display_name: "Sophia Mitchell",
                        desired_program_label: "Preschool",
                    }),
                ],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const children = Array.isArray(record.children) ? record.children : [];
        expect(children).toHaveLength(5);
        expect(children.filter((c) => (c as Record<string, unknown>)._layout_runtime_child_source === "household_with_enrollment")).toHaveLength(3);
        expect(children.filter((c) => (c as Record<string, unknown>)._layout_runtime_child_source === "household_only")).toHaveLength(2);
    });
});
