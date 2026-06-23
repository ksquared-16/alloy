/**
 * Queue record row composer — v3 scoped columns + blocks.
 * Saved on LayoutDoc.metadata.queue_record_layout (version: 3).
 */

import type { LayoutAdornmentIcon, LayoutCondition } from "@/lib/layout/layoutV2";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import { nextQueueRecordBlockId, nextQueueRecordColumnId, nextQueueRecordFieldId } from "@/lib/layout/queueRecordLayoutIds";
import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import { queueRecordWidthToCss } from "@/lib/layout/queueRecordLayoutWidth";

export type QueueRecordFieldDisplay =
    | "text"
    | "muted"
    | "pill"
    | "chip"
    | "link"
    | "phone"
    | "email"
    | "date"
    | "badge";

export type QueueRecordFieldLinkTarget =
    | "opportunity_drawer"
    | "person_drawer"
    | "child_drawer"
    | "related_record_drawer"
    | "none";

export type QueueRecordScope =
    | { type: "main_record" }
    | { type: "primary_related"; relationshipKey: string }
    | { type: "repeated_related"; relationshipKey: string; maxItems?: number }
    | { type: "lifecycle_context" }
    | { type: "system" };

export type QueueRecordFieldEmphasis = "default" | "title";

export type QueueRecordFieldConfig = {
    id: string;
    fieldKey: string;
    label?: string;
    /** When false, runtime hides the configured label prefix (default off for phone/email). */
    showLabel?: boolean;
    /** Title emphasis for household/primary identity fields in the row. */
    emphasis?: QueueRecordFieldEmphasis;
    icon?: LayoutAdornmentIcon;
    display: QueueRecordFieldDisplay;
    inlineWithPrevious?: boolean;
    visibleWhen?: LayoutCondition;
    link?: {
        target: QueueRecordFieldLinkTarget;
        idFieldKey?: string;
        relationshipKey?: string;
    };
};

/** Whether a field should render its label prefix in the queue row. */
export function queueRecordFieldShowsLabel(field: QueueRecordFieldConfig): boolean {
    if (field.showLabel === true) return true;
    if (field.showLabel === false) return false;
    if (field.display === "phone" || field.display === "email") return false;
    return false;
}

export type QueueRecordBlockConfig =
    | {
          type: "field_group";
          id: string;
          label?: string;
          fields: QueueRecordFieldConfig[];
          layout?: "stack" | "inline";
      }
    | {
          type: "repeated_record_block";
          id: string;
          relationshipKey: string;
          itemLabel?: string;
          display: "rows" | "chips" | "compact-cards";
          /** Native row list (mock default) vs chip/card presentations. */
          presentation?: "row-list" | "chip-row" | "card-list";
          fields: QueueRecordFieldConfig[];
          maxItems?: number;
          emptyState?: string;
      }
    | {
          type: "widget";
          id: string;
          widgetKey: string;
          label?: string;
          config?: { displayMode?: "compact" | "card"; [key: string]: unknown };
      };

export type QueueRecordColumnConfig = {
    id: string;
    label: string;
    width: QueueRecordColumnWidth;
    scope: QueueRecordScope;
    blocks: QueueRecordBlockConfig[];
};

import type { QueueRecordFixedControls } from "@/lib/layout/queueRecordLayoutConfig";

export type { QueueRecordFixedControls } from "@/lib/layout/queueRecordLayoutConfig";

export type QueueRecordLayoutConfigV3 = {
    variant: "operational-row";
    version: 3;
    columns: QueueRecordColumnConfig[];
    fixedControls: QueueRecordFixedControls;
};

/** Editor and runtime share the same v3 document shape. */
export type QueueRecordLayoutEditorConfig = QueueRecordLayoutConfigV3;

export const QUEUE_RECORD_SCOPE_PRESETS: {
    scope: QueueRecordScope;
    label: string;
    description: string;
}[] = [
    { scope: { type: "main_record" }, label: "Main record", description: "Lead / opportunity fields on the queue item" },
    {
        scope: { type: "primary_related", relationshipKey: "person" },
        label: "Primary contact",
        description: "Person / contact fields for the primary related person",
    },
    {
        scope: { type: "repeated_related", relationshipKey: "children" },
        label: "Children / related records",
        description: "One row per child or related record",
    },
    { scope: { type: "lifecycle_context" }, label: "Lifecycle / status", description: "Status, attention, next step, work-unit context" },
    { scope: { type: "system" }, label: "System", description: "Record ids, timestamps, system metadata" },
];

export function scopePresetKey(scope: QueueRecordScope): string {
    if (scope.type === "primary_related") return `primary_related:${scope.relationshipKey}`;
    if (scope.type === "repeated_related") return `repeated_related:${scope.relationshipKey}`;
    return scope.type;
}

export function parseScopePresetKey(key: string): QueueRecordScope {
    if (key.startsWith("primary_related:")) {
        return { type: "primary_related", relationshipKey: key.slice("primary_related:".length) || "person" };
    }
    if (key.startsWith("repeated_related:")) {
        return { type: "repeated_related", relationshipKey: key.slice("repeated_related:".length) || "children" };
    }
    if (key === "lifecycle_context") return { type: "lifecycle_context" };
    if (key === "system") return { type: "system" };
    return { type: "main_record" };
}

import {
    inferQueueRecordFieldDisplayFromCatalog,
    normalizeQueueRecordFieldDisplay,
} from "@/lib/layout/runtime/queueRecordFieldDisplayBridge";

function inferLinkFromCatalog(f: LayoutCatalogField): QueueRecordFieldConfig["link"] | undefined {
    if (f.entityKey === "child" || f.refKey.startsWith("child.")) {
        return { target: "child_drawer", idFieldKey: "child.id" };
    }
    if (f.entityKey === "person" || f.refKey.startsWith("person.")) {
        return { target: "person_drawer", idFieldKey: "opportunity.primary_person_id" };
    }
    if (/household|title|customer\.name/.test(f.refKey)) {
        return { target: "opportunity_drawer", idFieldKey: "opportunity.id" };
    }
    return undefined;
}

export function catalogFieldToQueueRecordFieldConfig(f: LayoutCatalogField): QueueRecordFieldConfig {
    const display = inferQueueRecordFieldDisplayFromCatalog(f);
    const inferredLink = inferLinkFromCatalog(f);
    const link =
        inferredLink
        && (display === "link"
            || ((f.entityKey === "child" || f.entityKey === "person") && /(?:^|\.)(?:name|display_name)$/.test(f.refKey)))
            ? inferredLink
        :   undefined;
    const icon =
        f.entityKey === "child" ? "child"
        : f.entityKey === "person" ? "person"
        : undefined;
    const showLabel = display === "phone" || display === "email" ? false : undefined;
    return {
        id: nextQueueRecordFieldId(f.refKey.replace(/\./g, "-")),
        fieldKey: f.refKey,
        label: f.fieldLabel,
        showLabel,
        display,
        link,
        icon: icon as LayoutAdornmentIcon | undefined,
    };
}

export function createFieldGroupBlock(label?: string): QueueRecordBlockConfig {
    return { type: "field_group", id: nextQueueRecordBlockId("group"), label, fields: [], layout: "stack" };
}

export function createRepeatedBlock(relationshipKey: string): QueueRecordBlockConfig {
    return {
        type: "repeated_record_block",
        id: nextQueueRecordBlockId("repeat"),
        relationshipKey,
        display: "rows",
        fields: [],
        emptyState: "No related records",
    };
}

export function createWidgetBlock(
    widgetKey: string,
    label: string,
    config?: { displayMode?: "compact" | "card"; [key: string]: unknown },
): QueueRecordBlockConfig {
    return { type: "widget", id: nextQueueRecordBlockId("widget"), widgetKey, label, config };
}

export function createColumnFromScope(scope: QueueRecordScope, label: string): QueueRecordColumnConfig {
    const id = nextQueueRecordColumnId(label.toLowerCase().replace(/\s+/g, "-"));
    const blocks: QueueRecordBlockConfig[] =
        scope.type === "repeated_related" ?
            [createRepeatedBlock(scope.relationshipKey)]
        :   [createFieldGroupBlock()];
    return { id, label, width: "medium", scope, blocks };
}

/** Default Lead queue — presets only; fully editable in settings. */
export function defaultLeadQueueLayoutV3(): QueueRecordLayoutConfigV3 {
    const household = createColumnFromScope({ type: "main_record" }, "Household");
    household.width = "identity";
    household.label = "";
    household.blocks = [
        {
            type: "field_group",
            id: nextQueueRecordBlockId("household"),
            fields: [
                {
                    id: nextQueueRecordFieldId("household"),
                    fieldKey: "customer.display_name",
                    label: "Household name",
                    emphasis: "title",
                    icon: "home",
                    display: "link",
                    link: { target: "opportunity_drawer", idFieldKey: "opportunity.id" },
                },
                {
                    id: nextQueueRecordFieldId("subject-focus"),
                    fieldKey: "queue_row.subject_label",
                    label: "Subject",
                    display: "muted",
                    showLabel: false,
                    visibleWhen: { type: "exists", path: "queue_row.subject_label" },
                },
                {
                    id: nextQueueRecordFieldId("primary-contact"),
                    fieldKey: "person.primary_contact_name",
                    label: "Primary contact",
                    icon: "person",
                    display: "link",
                    link: { target: "person_drawer", idFieldKey: "opportunity.primary_person_id" },
                },
                {
                    id: nextQueueRecordFieldId("phone"),
                    fieldKey: "person.phone",
                    label: "Phone",
                    showLabel: false,
                    display: "phone",
                    icon: "phone",
                },
                {
                    id: nextQueueRecordFieldId("email"),
                    fieldKey: "person.email",
                    label: "Email",
                    showLabel: false,
                    display: "email",
                    icon: "mail",
                },
            ],
        },
    ];

    const childCol = createColumnFromScope({ type: "repeated_related", relationshipKey: "children" }, "Children");
    childCol.width = "children";
    childCol.label = "";
    const repeat = childCol.blocks[0];
    if (repeat?.type === "repeated_record_block") {
        repeat.display = "rows";
        repeat.presentation = "row-list";
        repeat.itemLabel = "Children";
        repeat.maxItems = 5;
        repeat.fields = [
            {
                id: nextQueueRecordFieldId("child-name"),
                fieldKey: "child.name",
                label: "Full name",
                icon: "child",
                display: "link",
                link: { target: "child_drawer", idFieldKey: "child.id" },
            },
            {
                id: nextQueueRecordFieldId("child-dob"),
                fieldKey: "child.date_of_birth",
                label: "DOB",
                display: "date",
                showLabel: true,
                inlineWithPrevious: true,
            },
            {
                id: nextQueueRecordFieldId("child-status"),
                fieldKey: "child.status",
                label: "Disposition",
                display: "muted",
                showLabel: false,
                inlineWithPrevious: true,
                visibleWhen: { type: "exists", path: "child.status" },
            },
        ];
    }

    const statusContext = createColumnFromScope({ type: "lifecycle_context" }, "Status & Context");
    statusContext.width = "status_band";
    statusContext.label = "";
    statusContext.blocks = [
        {
            type: "field_group",
            id: nextQueueRecordBlockId("status-context"),
            fields: [
                {
                    id: nextQueueRecordFieldId("stage"),
                    fieldKey: "queue_row.stage_label",
                    label: "Stage",
                    display: "muted",
                    showLabel: false,
                    visibleWhen: { type: "exists", path: "queue_row.stage_label" },
                },
                {
                    id: nextQueueRecordFieldId("status"),
                    fieldKey: "opportunity.status_label",
                    label: "Disposition",
                    display: "pill",
                },
                {
                    id: nextQueueRecordFieldId("location"),
                    fieldKey: "opportunity.location",
                    label: "Placement",
                    display: "muted",
                    showLabel: false,
                    visibleWhen: { type: "exists", path: "opportunity.location" },
                },
                {
                    id: nextQueueRecordFieldId("group-count"),
                    fieldKey: "queue_row.group_count_label",
                    label: "Tracks",
                    display: "muted",
                    showLabel: false,
                    visibleWhen: { type: "exists", path: "queue_row.group_count_label" },
                },
            ],
        },
    ];

    const nextStep = createColumnFromScope({ type: "lifecycle_context" }, "Next Step");
    nextStep.width = "next_step";
    nextStep.label = "";
    nextStep.blocks = [
        {
            type: "field_group",
            id: nextQueueRecordBlockId("next-context"),
            fields: [
                {
                    id: nextQueueRecordFieldId("attention-reason"),
                    fieldKey: "opportunity.attention_reason",
                    label: "Attention",
                    showLabel: false,
                    display: "muted",
                    visibleWhen: { type: "exists", path: "opportunity.attention_reason" },
                },
                {
                    id: nextQueueRecordFieldId("work-summary"),
                    fieldKey: "queue_row.work_summary",
                    label: "Open work",
                    showLabel: false,
                    display: "muted",
                    visibleWhen: { type: "exists", path: "queue_row.work_summary" },
                },
                {
                    id: nextQueueRecordFieldId("next-best-action"),
                    fieldKey: "queue_row.next_best_action_label",
                    label: "Suggested action",
                    showLabel: false,
                    display: "muted",
                    visibleWhen: { type: "exists", path: "queue_row.next_best_action_label" },
                },
                {
                    id: nextQueueRecordFieldId("next-step"),
                    fieldKey: "opportunity.next_step",
                    label: "Next step",
                    showLabel: false,
                    display: "muted",
                    visibleWhen: { type: "exists", path: "opportunity.next_step" },
                },
            ],
        },
        createWidgetBlock("attention", "Attention", { displayMode: "compact" }),
        createWidgetBlock("current_work", "Current Work", { displayMode: "compact" }),
    ];

    const dateCol = createColumnFromScope({ type: "main_record" }, "Date / Event");
    dateCol.width = "date_event";
    dateCol.label = "";
    dateCol.blocks = [
        {
            type: "field_group",
            id: nextQueueRecordBlockId("dates"),
            fields: [
                {
                    id: nextQueueRecordFieldId("tour"),
                    fieldKey: "opportunity.tour_date",
                    label: "Tour date",
                    display: "date",
                    showLabel: true,
                    icon: "calendar",
                },
            ],
        },
    ];

    return {
        variant: "operational-row",
        version: 3,
        columns: [household, childCol, statusContext, nextStep, dateCol],
        fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
    };
}

export function defaultWaitlistQueueLayoutV3(): QueueRecordLayoutConfigV3 {
    const lead = defaultLeadQueueLayoutV3();
    return {
        ...lead,
        columns: lead.columns.map((col) => {
            if (col.scope.type === "repeated_related" && col.scope.relationshipKey === "children") {
                return {
                    ...col,
                    label: "Candidate",
                    blocks: col.blocks.map((b) =>
                        b.type === "repeated_record_block" ?
                            {
                                ...b,
                                fields: b.fields.map((f) =>
                                    f.fieldKey === "inquiry_child.program" ?
                                        { ...f, fieldKey: "inquiry_child.program", label: "Program" }
                                    :   f,
                                ),
                            }
                        :   b,
                    ),
                };
            }
            return col;
        }),
    };
}

/** Runtime grid width from v3 column. */
export function queueRecordColumnGridWidth(col: QueueRecordColumnConfig): string {
    return queueRecordWidthToCss(col.width);
}
