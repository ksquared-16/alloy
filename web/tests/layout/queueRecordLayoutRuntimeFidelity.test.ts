import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import OperationalQueueRecordRow from "@/components/layout/OperationalQueueRecordRow";
import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    createColumnFromScope,
    createFieldGroupBlock,
    createRepeatedBlock,
    createWidgetBlock,
    defaultLeadQueueLayoutV3,
    type QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import { nextQueueRecordFieldId } from "@/lib/layout/queueRecordLayoutIds";
import { collectQueueRecordLayoutFieldBindings } from "@/lib/layout/runtime/collectQueueRecordLayoutFieldKeys";
import { buildOperationalQueueRecordViewModelFromLayout } from "@/lib/layout/runtime/buildOperationalQueueRecordViewModel";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import { resolveQueueRecordField } from "@/lib/layout/runtime/queueRecordScopedResolve";
import { resolveQueueRecordLayoutConfig } from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

function layoutWithChildDobAndTour(): QueueRecordLayoutConfigV3 {
    const base = defaultLeadQueueLayoutV3();
    const childCol = createColumnFromScope({ type: "repeated_related", relationshipKey: "children" }, "Children");
    const repeat = createRepeatedBlock("children");
    if (repeat.type === "repeated_record_block") {
        repeat.fields = [
            {
                id: nextQueueRecordFieldId("child-name"),
                fieldKey: "child.name",
                label: "Child name",
                display: "link",
                link: { target: "child_drawer", idFieldKey: "child.id" },
            },
            {
                id: nextQueueRecordFieldId("child-dob"),
                fieldKey: "child.date_of_birth",
                label: "Date of birth",
                display: "date",
                inlineWithPrevious: true,
            },
        ];
    }
    childCol.blocks = [repeat];

    const tourCol = createColumnFromScope({ type: "main_record" }, "Tour");
    const tourBlock = createFieldGroupBlock();
    (tourBlock as { fields: unknown[] }).fields = [
        {
            id: nextQueueRecordFieldId("tour"),
            fieldKey: "opportunity.tour_date",
            label: "Tour",
            display: "date",
            icon: "calendar",
        },
    ];
    tourCol.blocks = [tourBlock];

    const tasksCol = createColumnFromScope({ type: "lifecycle_context" }, "Work");
    tasksCol.blocks = [createWidgetBlock("tasks", "Tasks", { displayMode: "compact" })];

    return {
        ...base,
        columns: [base.columns[0]!, childCol, base.columns[2]!, tasksCol, tourCol],
    };
}

function previewItemWithDobAndTasks(): QueuePreviewItemVm {
    return {
        id: "opp-fidelity",
        title: "Brooks household",
        quickActions: [{ id: "open", label: "Open" }],
        semanticCrmCompact: {
            primaryIdentity: "Brooks household",
            childName: null,
            contactDisplayName: "Riley Brooks",
            contactPersonId: "person-riley",
            contactPhoneDisplay: "(503) 555-0100",
            contactEmail: "riley@example.com",
            programContext: null,
            statusLabel: "Contact Attempted",
            stageLabel: null,
            nextStep: "Schedule tour",
            lastActivity: null,
            commercialValue: null,
            contactSnippet: null,
            roomContext: null,
            ageContext: null,
            attentionReason: null,
            familyNote: null,
            tourContext: "May 20, 2:30 PM",
            locationContext: "West Campus",
            childrenLines: [{ primary: "Jordan Brooks", personId: "child-jordan", secondary: "(2y)" }],
        },
        layoutRuntimeEnrichment: {
            inquiryChildren: [
                {
                    display_name: "Jordan Brooks",
                    person_id: "child-jordan",
                    dob: "2024-03-15",
                },
            ],
            tourDisplay: "May 20, 2:30 PM",
            statusDisplay: "Contact Attempted",
            inquirySummaryTasks: {
                state: "loaded",
                open_count: 1,
                open_tasks: [
                    {
                        id: "task-1",
                        title: "Schedule tour",
                        due_at: "2026-05-21T14:30:00Z",
                        status: "open",
                        source: "operational",
                    },
                ],
            },
        },
    };
}

describe("queue record layout runtime fidelity", () => {
    it("resolveQueueRecordLayoutConfig prefers saved metadata.queue_record_layout", () => {
        const doc = buildLeadQueueDefaultDoc();
        const custom = layoutWithChildDobAndTour();
        const withMeta = {
            ...doc,
            metadata: { ...(doc.metadata ?? {}), queue_record_layout: custom },
        };
        const resolved = resolveQueueRecordLayoutConfig(withMeta);
        const bindings = collectQueueRecordLayoutFieldBindings(resolved);
        expect(bindings.some((b) => b.fieldKey === "child.date_of_birth")).toBe(true);
        expect(bindings.some((b) => b.fieldKey === "opportunity.tour_date")).toBe(true);
        expect(bindings.some((b) => b.widgetKey === "tasks")).toBe(true);
        expect(bindings.some((b) => b.fieldKey === "child.age_band")).toBe(false);
    });

    it("hydrates child.date_of_birth from household_children enrichment", () => {
        const doc = buildLeadQueueDefaultDoc();
        const config = layoutWithChildDobAndTour();
        const docWithLayout = {
            ...doc,
            metadata: { ...(doc.metadata ?? {}), queue_record_layout: config },
        };
        const item: QueuePreviewItemVm = {
            id: "opp-household-child",
            title: "James Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "James Family",
                childName: null,
                stageLabel: null,
                statusLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                programContext: null,
                childrenLines: [{ primary: "Bronny James", personId: "child-bronny", secondary: null }],
            },
            layoutRuntimeEnrichment: {
                householdChildren: [
                    {
                        display_name: "Bronny James",
                        person_id: "child-bronny",
                        customer_member_id: "cm-bronny",
                        dob: "2026-01-01",
                    },
                ],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, docWithLayout);
        const childRow = (record.children as Record<string, unknown>[])?.[0] as Record<string, unknown>;
        expect(childRow["child.date_of_birth"]).toBe("2026-01-01");
    });

    it("renders configured child.date_of_birth — not substituted age_band", () => {
        const doc = buildLeadQueueDefaultDoc();
        const config = layoutWithChildDobAndTour();
        const docWithLayout = {
            ...doc,
            metadata: { ...(doc.metadata ?? {}), queue_record_layout: config },
        };
        const item = previewItemWithDobAndTasks();
        const record = buildOpportunityQueueRowRecordFromPreview(item, docWithLayout);
        const childRow = (record.children as Record<string, unknown>[])?.[0] as Record<string, unknown>;
        expect(childRow["child.date_of_birth"]).toBe("2024-03-15");
        expect(childRow["child.age_band"]).toBe("");

        const dobField = config.columns[1]!.blocks[0];
        expect(dobField.type === "repeated_record_block" ? dobField.fields[1] : null).toBeTruthy();
        if (dobField.type !== "repeated_record_block") throw new Error("expected repeat block");
        const resolved = resolveQueueRecordField(dobField.fields[1]!, childRow as never);
        expect(resolved.display).toMatch(/^3\/15\/2024 \(/);
        expect(resolved.display).not.toBe("2024-03-15");
        expect(resolved.display).not.toBe("(2y)");
    });

    it("renders status as pill, tour date, and tasks widget from saved config", () => {
        const doc = buildLeadQueueDefaultDoc();
        const config = layoutWithChildDobAndTour();
        const docWithLayout = {
            ...doc,
            metadata: { ...(doc.metadata ?? {}), queue_record_layout: config },
        };
        const item = previewItemWithDobAndTasks();
        const record = buildOpportunityQueueRowRecordFromPreview(item, docWithLayout);
        const vm = buildOperationalQueueRecordViewModelFromLayout(docWithLayout, record, config);
        const html = renderToStaticMarkup(
            createElement(OperationalQueueRecordRow, {
                vm,
                record,
                config,
                onOpen: () => {},
                drawerHandlers: { onOpenPerson: () => {}, onOpenChild: () => {} },
                rowActions: item.quickActions,
                onRowAction: () => {},
            }),
        );

        expect(html).toContain("queue-record-field--pill");
        expect(html).toContain("Contact Attempted");
        expect(html).toMatch(/May 20/);
        expect(html).toContain("data-queue-tasks-widget");
        expect(html).toContain("queue-record-widget--tasks");
        expect(html).toContain("queue-record-widget__task-title");
        expect(html).toContain("Schedule tour");
        expect(html).not.toContain("queue-record-field--pill-pine");
    });

    it("renders status as text when saved config display is text", () => {
        const doc = buildLeadQueueDefaultDoc();
        const rawConfig = layoutWithChildDobAndTour();
        const statusCol = rawConfig.columns[2]!;
        const statusBlock = statusCol.blocks[0];
        if (statusBlock?.type === "field_group") {
            statusBlock.fields = statusBlock.fields.map((f) =>
                f.fieldKey === "opportunity.status_label" ? { ...f, display: "text" as const } : f,
            );
        }
        const config = resolveQueueRecordLayoutConfig({
            ...doc,
            metadata: { ...(doc.metadata ?? {}), queue_record_layout: rawConfig },
        });
        const docWithLayout = {
            ...doc,
            metadata: { ...(doc.metadata ?? {}), queue_record_layout: config },
        };
        const item = previewItemWithDobAndTasks();
        const record = buildOpportunityQueueRowRecordFromPreview(item, docWithLayout);
        const vm = buildOperationalQueueRecordViewModelFromLayout(docWithLayout, record, config);
        const html = renderToStaticMarkup(
            createElement(OperationalQueueRecordRow, {
                vm,
                record,
                config,
                onOpen: () => {},
                drawerHandlers: { onOpenPerson: () => {}, onOpenChild: () => {} },
                rowActions: item.quickActions,
                onRowAction: () => {},
            }),
        );
        expect(html).toContain("Contact Attempted");
        expect(html).toContain("queue-record-field--text");
        expect(html).not.toContain("queue-record-field--pill");
        expect(html).not.toContain("queue-record-field--badge");
    });

    it("renders status as badge when saved config display is badge", () => {
        const doc = buildLeadQueueDefaultDoc();
        const rawConfig = layoutWithChildDobAndTour();
        const statusCol = rawConfig.columns[2]!;
        const statusBlock = statusCol.blocks[0];
        if (statusBlock?.type === "field_group") {
            statusBlock.fields = statusBlock.fields.map((f) =>
                f.fieldKey === "opportunity.status_label" ? { ...f, display: "badge" as const } : f,
            );
        }
        const config = resolveQueueRecordLayoutConfig({
            ...doc,
            metadata: { ...(doc.metadata ?? {}), queue_record_layout: rawConfig },
        });
        const docWithLayout = {
            ...doc,
            metadata: { ...(doc.metadata ?? {}), queue_record_layout: config },
        };
        const item = previewItemWithDobAndTasks();
        const record = buildOpportunityQueueRowRecordFromPreview(item, docWithLayout);
        const vm = buildOperationalQueueRecordViewModelFromLayout(docWithLayout, record, config);
        const html = renderToStaticMarkup(
            createElement(OperationalQueueRecordRow, {
                vm,
                record,
                config,
                onOpen: () => {},
                drawerHandlers: { onOpenPerson: () => {}, onOpenChild: () => {} },
                rowActions: item.quickActions,
                onRowAction: () => {},
            }),
        );
        expect(html).toContain("Contact Attempted");
        expect(html).toContain("queue-record-field--badge");
        expect(html).toContain('data-queue-status-badge="true"');
        expect(html).not.toContain("queue-record-field--pill");
    });

    it("child linked field uses same contact-link classes as person", () => {
        const doc = buildLeadQueueDefaultDoc();
        const config = layoutWithChildDobAndTour();
        const docWithLayout = {
            ...doc,
            metadata: { ...(doc.metadata ?? {}), queue_record_layout: config },
        };
        const item = previewItemWithDobAndTasks();
        const record = buildOpportunityQueueRowRecordFromPreview(item, docWithLayout);
        const vm = buildOperationalQueueRecordViewModelFromLayout(docWithLayout, record, config);
        const html = renderToStaticMarkup(
            createElement(OperationalQueueRecordRow, {
                vm,
                record,
                config,
                onOpen: () => {},
                drawerHandlers: { onOpenPerson: () => {}, onOpenChild: () => {} },
                rowActions: item.quickActions,
                onRowAction: () => {},
            }),
        );
        expect(html).toContain('data-layout-runtime-adornment-entity="child"');
        expect(html).toContain("queue-record-field--link");
        expect(html).toContain("queue-record-field__text");
    });
});
