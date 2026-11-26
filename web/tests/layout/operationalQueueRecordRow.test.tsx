import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import OperationalQueueRecordRow from "@/components/layout/OperationalQueueRecordRow";
import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    buildOperationalQueueRecordViewModelFromCrmSlots,
    buildOperationalQueueRecordViewModelFromLayout,
} from "@/lib/layout/runtime/buildOperationalQueueRecordViewModel";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import { defaultLeadQueueLayoutV3, type QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { CrmCompactRowSemanticSlots, QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import { buildPartialQueueRowContext } from "@/lib/workUnits/buildPartialQueueRowContext";

function crmSlots(
    partial: Partial<CrmCompactRowSemanticSlots> & Pick<CrmCompactRowSemanticSlots, "primaryIdentity">
): CrmCompactRowSemanticSlots {
    return {
        childName: null,
        stageLabel: null,
        statusLabel: null,
        nextStep: null,
        lastActivity: null,
        commercialValue: null,
        contactSnippet: null,
        programContext: null,
        roomContext: null,
        ageContext: null,
        attentionReason: null,
        familyNote: null,
        ...partial,
    };
}

describe("defaultLeadQueueLayoutV3", () => {
    it("declares operational-row v3 with scoped preset columns", () => {
        const layout = defaultLeadQueueLayoutV3();
        expect(layout.variant).toBe("operational-row");
        expect(layout.version).toBe(3);
        expect(layout.columns.map((c) => c.scope.type)).toEqual([
            "main_record",
            "repeated_related",
            "lifecycle_context",
            "lifecycle_context",
            "main_record",
        ]);
        expect(layout.fixedControls?.actionsMenu).toBe(true);
    });
});

describe("buildOperationalQueueRecordViewModelFromLayout", () => {
    it("maps household, contact, child chips, and tour from layout record", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Johnson Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Johnson Family",
                childName: "Alex Johnson",
                contactDisplayName: "Jamie Johnson",
                contactPhoneDisplay: "(555) 234-8901",
                contactEmail: "jamie@example.com",
                contactPersonId: "person-1",
                programContext: "Infant AM",
                statusLabel: "Qualified",
                stageLabel: null,
                nextStep: "Call within one day",
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: "Main Campus",
                ageContext: "4y",
                attentionReason: "Overdue follow-up",
                familyNote: null,
                tourContext: "Jun 12",
                locationContext: "Main Campus",
                childrenLines: [{ primary: "Alex Johnson", personId: "child-1", secondary: "Infant AM" }],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);

        expect(vm.identity.title).toContain("Johnson");
        expect(vm.identity.contactName).toBe("Jamie Johnson");
        expect(vm.relatedRecords.chips).toHaveLength(1);
        expect(vm.relatedRecords.chips[0]?.display).toContain("Alex");
        expect(vm.status.label).toBe("Qualified");
        expect(vm.attention.reason).toBe("Overdue follow-up");
        expect(vm.date.value).toBeTruthy();
    });
});

describe("buildOperationalQueueRecordViewModelFromCrmSlots", () => {
    it("builds related chips from structured children lines", () => {
        const vm = buildOperationalQueueRecordViewModelFromCrmSlots(
            crmSlots({
                primaryIdentity: "Mitchell household",
                childrenLines: [
                    { primary: "Sam (4y)", personId: "child-sam", secondary: "Preschool" },
                    { primary: "Riley", personId: "child-riley", secondary: "Toddler" },
                ],
            })
        );
        expect(vm.relatedRecords.chips).toHaveLength(2);
        expect(vm.relatedRecords.label).toContain("Related (2)");
    });
});

describe("OperationalQueueRecordRow", () => {
    it("renders configured household name field in first column", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-household",
            title: "Mitchell household",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell household",
                childName: null,
                contactDisplayName: "Kev Mitchell",
                contactPersonId: "person-1",
                contactPhoneDisplay: "(503) 555-4729",
                contactEmail: "kevin@example.com",
                programContext: null,
                statusLabel: "Qualified",
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
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
        const html = renderToStaticMarkup(
            <OperationalQueueRecordRow vm={vm} record={record} onOpen={() => {}} />,
        );
        expect(html).toContain("Mitchell household");
        expect(html).toContain("queue-record-field--title");
        expect(html).toContain("queue-record-field--pill");
        expect(html).toContain("queue-record-field--status-tone-");
        expect(html).toContain('data-queue-status-tone="');
    });

    it("does not duplicate household name in subject focus line for case-grain context", () => {
        const doc = buildLeadQueueDefaultDoc();
        const queue = { key: "tours", label: "Tours", lifecycle_key: "enrollment", stage_key: "tour" };
        const context = buildPartialQueueRowContext({
            row: { id: "opp-dup", name: "Smith Household", status_key: "tour_scheduled" },
            queue,
        });
        const item: QueuePreviewItemVm = {
            id: "opp-dup",
            title: "Smith Household",
            quickActions: [],
            _queue_row_context: context,
            semanticCrmCompact: {
                primaryIdentity: "Smith Household",
                childName: null,
                contactDisplayName: null,
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "Tour scheduled",
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
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
        const html = renderToStaticMarkup(
            <OperationalQueueRecordRow vm={vm} record={record} onOpen={() => {}} />,
        );
        expect(html).toContain('data-queue-row-runtime-path="operational-queue-record-row-v3"');
        expect(html).toContain("Smith Household");
        expect(html).not.toContain("queue-record-field--subject-focus");
    });

    it("renders one child per row with inline DOB labels", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Johnson Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Johnson Family",
                childName: null,
                contactDisplayName: "Jamie Johnson",
                contactPhoneDisplay: "(555) 234-8901",
                contactPersonId: "person-1",
                programContext: null,
                statusLabel: "Qualified",
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
                locationContext: "Main Campus",
                childrenLines: [
                    { primary: "Alex Johnson", personId: "child-1", secondary: "Infant" },
                    { primary: "Sam Johnson", personId: "child-2", secondary: "Toddler" },
                ],
            },
            layoutRuntimeEnrichment: {
                inquiryChildren: [
                    {
                        id: "inq-alex",
                        person_id: "child-1",
                        customer_member_id: "cm-alex",
                        display_name: "Alex Johnson",
                        dob: "2024-03-15",
                    },
                    {
                        id: "inq-sam",
                        person_id: "child-2",
                        customer_member_id: "cm-sam",
                        display_name: "Sam Johnson",
                        dob: "2022-08-20",
                    },
                ],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
        const html = renderToStaticMarkup(
            <OperationalQueueRecordRow vm={vm} record={record} onOpen={() => {}} />,
        );
        expect(html).toContain("queue-record-field--link");

        expect(html).toContain('data-queue-record-layout="operational-row"');
        expect(html).toContain('data-queue-record-version="3"');
        expect(html).toContain('data-queue-col-scope="main_record"');
        expect(html).toContain('data-queue-col-scope="repeated_related"');
        expect(html).toContain("operational-queue-row__child-row");
        expect(html).toContain("operational-queue-row__child-list");
        expect(html).toContain('data-queue-child-row="true"');
        expect(html).toContain("queue-record-field__inline-label");
        expect(html).toContain("DOB:");
        expect(html).toMatch(/3\/15\/2024 \(/);
        expect(html).not.toContain("2024-03-15");
        expect(html).toContain("Alex Johnson");
        expect(html).toContain("Sam Johnson");
        expect(html).not.toContain("each child would appear on its own row");
    });

    it("renders clickable contact link adornment target", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-2",
            title: "Lee Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Lee Family",
                childName: null,
                contactDisplayName: "Pat Lee",
                contactPersonId: "person-pat",
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "New",
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
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
        const html = renderToStaticMarkup(
            <OperationalQueueRecordRow vm={vm} record={record} />
        );
        expect(html).toContain("queue-record-field__icon");
        expect(html).toContain('data-layout-runtime-adornment-entity="person"');
    });

    it("renders tasks and attention widget headers with section spacing structure", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-widget-headers",
            title: "Widget Header Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Widget Header Family",
                childName: null,
                contactDisplayName: "Pat Header",
                contactPersonId: "person-header",
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "New",
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
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
        const html = renderToStaticMarkup(
            <OperationalQueueRecordRow vm={vm} record={record} onRowAction={() => {}} />,
        );
        expect(html).toContain("queue-record-widget--tasks");
        expect(html).toContain("queue-record-widget--attention");
        expect(html).toContain("queue-record-widget__body");
        expect(html).toContain("No open tasks");
        expect(html).toContain("No attention items");
    });

    it("renders fixed action rail when lifecycle actions are empty", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-empty-actions",
            title: "Empty Actions Family",
            quickActions: [{ id: "open", label: "Open" }],
            semanticCrmCompact: {
                primaryIdentity: "Empty Actions Family",
                childName: null,
                contactDisplayName: "Pat Empty",
                contactPersonId: "person-empty",
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "New",
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
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
        const html = renderToStaticMarkup(
            <OperationalQueueRecordRow
                vm={vm}
                record={record}
                rowActions={[]}
                onRowAction={() => {}}
            />,
        );
        expect(html).toContain("operational-queue-row__action-rail");
        expect(html).toContain("Work with BOS");
        expect(html).toContain("operational-queue-row__actions-trigger");
        expect(html).toContain("data-queue-row-bos-button");
    });

    it("renders drawer-style Actions and Work with BOS buttons", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-3",
            title: "Lee Family",
            quickActions: [
                { id: "open", label: "Open" },
                { id: "message", label: "Message" },
                { id: "registry-ask_bos", label: "Ask BOS", actionId: "ask_bos" },
            ],
            semanticCrmCompact: {
                primaryIdentity: "Lee Family",
                childName: null,
                contactDisplayName: "Pat Lee",
                contactPersonId: "person-pat",
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "New",
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
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
        const html = renderToStaticMarkup(
            <OperationalQueueRecordRow
                vm={vm}
                record={record}
                rowActions={item.quickActions}
                onRowAction={() => {}}
            />
        );
        expect(html).toContain("data-record-drawer-header-action");
        expect(html).toContain("Work with BOS");
        expect(html).toContain("Actions");
        expect(html).not.toContain("Ask BOS");
        expect(html).not.toMatch(/operational-queue-row__actions-item[^>]*>Open</);
        expect(html).toContain("data-queue-row-bos-button");
        expect(html).toContain("operational-queue-row__action-rail");
        expect(html).toContain('data-action-rail-style="stacked"');
        expect(html).toContain("operational-queue-row__actions-trigger");
    });

    it("integrates collapse toggle into identity title area", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-3",
            title: "Lee Family",
            quickActions: [
                { id: "open", label: "Open" },
                { id: "message", label: "Message" },
            ],
            semanticCrmCompact: {
                primaryIdentity: "Lee Family",
                childName: null,
                contactDisplayName: "Pat Lee",
                contactPersonId: "person-pat",
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "New",
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
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
        const html = renderToStaticMarkup(
            <OperationalQueueRecordRow
                vm={vm}
                record={record}
                onOpen={() => {}}
                rowActions={item.quickActions}
                onRowAction={() => {}}
                onToggleCollapsed={() => {}}
            />
        );
        const firstColIdx = html.indexOf('data-queue-col-scope="main_record"');
        const toggleIdx = html.indexOf("operational-queue-row__collapse-toggle");
        expect(firstColIdx).toBeGreaterThan(-1);
        expect(toggleIdx).toBeGreaterThan(-1);
        expect(html).toContain("queue-row-open-zone");
        expect(html).not.toMatch(/grid-template-columns:\s*1\.75rem/);
    });

    it("renders collapsed summary line", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-4",
            title: "Kim Family",
            quickActions: [{ id: "open", label: "Open" }],
            semanticCrmCompact: {
                primaryIdentity: "Kim Family",
                childName: null,
                contactDisplayName: "Alex Kim",
                contactPersonId: "person-kim",
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "Qualified",
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
                childrenLines: [{ primary: "Child Kim", personId: "child-kim" }],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
        const html = renderToStaticMarkup(
            <OperationalQueueRecordRow
                vm={vm}
                record={record}
                collapsed
                rowActions={item.quickActions}
                onRowAction={() => {}}
            />
        );
        expect(html).toContain('data-queue-record-state="collapsed"');
        expect(html).toContain("operational-queue-row__collapsed-title");
        expect(html).toContain("operational-queue-row__collapsed-line");
        expect(html).toContain("operational-queue-row__collapsed-identity");
        expect(html).toContain("operational-queue-row__collapsed-icon");
        expect(html).not.toContain("1 related");
        expect(html).not.toContain("operational-queue-row__collapsed-actions");
    });

    it("hides tour date field when visibleWhen exists fails on placeholder value", () => {
        const config: QueueRecordLayoutConfigV3 = structuredClone(defaultLeadQueueLayoutV3());
        const dateCol = config.columns[config.columns.length - 1]!;
        const fieldGroup = dateCol.blocks[0];
        if (fieldGroup.type === "field_group") {
            const tourField = fieldGroup.fields.find((f) => f.fieldKey === "opportunity.tour_date");
            if (tourField) {
                tourField.visibleWhen = { type: "exists", path: "opportunity.tour_date" };
            }
        }

        const record = {
            id: "opp-tour-empty",
            name: "Mitchell household",
            "customer.display_name": "Mitchell household",
            "opportunity.tour_date": "—",
            status_key: "Qualified",
            children: [],
        };

        const vm = buildOperationalQueueRecordViewModelFromLayout(buildLeadQueueDefaultDoc(), record);
        const html = renderToStaticMarkup(
            <OperationalQueueRecordRow vm={vm} record={record} config={config} onOpen={() => {}} />,
        );

        expect(html).not.toContain("Tour date");
        expect(html).not.toContain("queue-record-field--inline-labeled");
    });
});
