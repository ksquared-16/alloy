/**
 * Queue record layout config — legacy types + shared width/fixed-control helpers.
 * v3 scoped composer lives in queueRecordLayoutV3.ts (canonical).
 */

import type { LayoutCondition, LayoutFieldAdornment, LayoutRenderHint } from "@/lib/layout/layoutV2";
import { defaultLeadQueueLayoutV3, defaultWaitlistQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import { queueRecordWidthToCss } from "@/lib/layout/queueRecordLayoutWidth";

export type QueueRecordWidgetType =
    | "identity"
    | "contact"
    | "related-record-chips"
    | "status"
    | "context"
    | "attention"
    | "date"
    | "actions"
    | "custom-field";

export type QueueRecordLinkBehavior = "open-drawer" | "none";

export type QueueRecordColumnWidth =
    | "small"
    | "medium"
    | "large"
    | "flex"
    | "identity"
    | "children"
    | "status_band"
    | "next_step"
    | "date_event";

export type QueueRecordColumnRole = "identity" | "related" | "status" | "attention" | "date";

export type QueueRecordLayoutFieldType =
    | "field"
    | "related-record-chips"
    | "status"
    | "attention"
    | "date"
    | "custom";

export type QueueRecordFieldDisplay = "text" | "pill" | "chip" | "muted" | "link";

export type QueueRecordLayoutField = {
    id: string;
    catalogId: string;
    label: string;
    type: QueueRecordLayoutFieldType;
    kind?: "field" | "widget";
    widgetKey?: string;
    /** Canonical layout catalog ref (e.g. opportunity.status_key) — same as drawer builder. */
    refKey?: string;
    fieldPath?: string;
    entityType?: string;
    linkBehavior?: QueueRecordLinkBehavior;
    display?: QueueRecordFieldDisplay;
    renderHint?: LayoutRenderHint;
    adornment?: LayoutFieldAdornment;
    visibleWhen?: LayoutCondition;
    /** Fields sharing rowId render on one horizontal row. */
    rowId?: string;
    rowLayout?: "stack" | "inline";
};

export type QueueRecordLayoutWidget = {
    type: QueueRecordWidgetType;
    fieldPaths?: string[];
    linkBehavior?: QueueRecordLinkBehavior;
    entityType?: string;
};

export type QueueRecordActionRailStyle = "compact" | "stacked";

export type QueueRecordFixedControls = {
    actionsMenu: boolean;
    workWithBos: boolean;
    actionRailStyle?: QueueRecordActionRailStyle;
};

/** Runtime column — widgets for row renderer; fields preserved when saved as v2. */
export type QueueRecordLayoutColumn = {
    key: string;
    id?: string;
    label?: string;
    width?: string;
    widthToken?: QueueRecordColumnWidth;
    role?: QueueRecordColumnRole;
    widgets: QueueRecordLayoutWidget[];
    fields?: QueueRecordLayoutField[];
};

/** Editor column shape (v2). */
export type QueueRecordLayoutEditorColumn = {
    id: string;
    label: string;
    width: QueueRecordColumnWidth;
    role: QueueRecordColumnRole;
    fields: QueueRecordLayoutField[];
};

export type QueueRecordLayoutConfig = {
    variant: "operational-row";
    version?: 1 | 2;
    columns: QueueRecordLayoutColumn[];
    fixedControls?: QueueRecordFixedControls;
};

export const QUEUE_RECORD_COLUMN_LABELS: Record<string, string> = {
    identity: "Identity",
    related: "Related records",
    status: "Status / context",
    attention: "Next Step",
    date: "Date / event",
};

export const QUEUE_RECORD_WIDGET_LABELS: Record<QueueRecordWidgetType, string> = {
    identity: "Household / title",
    contact: "Primary contact",
    "related-record-chips": "Related record chips",
    status: "Status",
    context: "Program / location",
    attention: "Attention reason",
    date: "Tour / event date",
    actions: "Row actions menu",
    "custom-field": "Custom field",
};

const DEFAULT_FIXED: QueueRecordFixedControls = {
    actionsMenu: true,
    workWithBos: true,
    actionRailStyle: "stacked",
};

/** Default Lead queue row layout (no actions column — fixed controls). */
export const DEFAULT_OPERATIONAL_QUEUE_RECORD_LAYOUT: QueueRecordLayoutConfig = {
    variant: "operational-row",
    version: 2,
    fixedControls: DEFAULT_FIXED,
    columns: [
        {
            key: "identity",
            id: "identity",
            label: "Identity",
            width: queueRecordWidthToCss("large"),
            widthToken: "large",
            role: "identity",
            widgets: [
                { type: "identity", fieldPaths: ["header.title", "header.identity"] },
                { type: "contact", fieldPaths: ["body.contact"], linkBehavior: "open-drawer", entityType: "person" },
            ],
        },
        {
            key: "related",
            id: "related",
            label: "Related Records",
            width: queueRecordWidthToCss("medium"),
            widthToken: "medium",
            role: "related",
            widgets: [
                {
                    type: "related-record-chips",
                    fieldPaths: ["body.children", "body.child"],
                    linkBehavior: "open-drawer",
                },
            ],
        },
        {
            key: "status",
            id: "status",
            label: "Status & Context",
            width: queueRecordWidthToCss("medium"),
            widthToken: "medium",
            role: "status",
            widgets: [
                { type: "status", fieldPaths: ["header.status"] },
                { type: "context", fieldPaths: ["header.location", "body.program_fit"] },
            ],
        },
        {
            key: "attention",
            id: "attention",
            label: "Next Step",
            width: queueRecordWidthToCss("flex"),
            widthToken: "flex",
            role: "attention",
            widgets: [
                { type: "attention", fieldPaths: ["header.attention", "context.primary", "next_step"] },
            ],
        },
        {
            key: "date",
            id: "date",
            label: "Date / Event",
            width: queueRecordWidthToCss("small"),
            widthToken: "small",
            role: "date",
            widgets: [{ type: "date", fieldPaths: ["body.tour"] }],
        },
    ],
};

/** Waitlist queue — same structure; field paths tuned for waitlist grain. */
export const DEFAULT_WAITLIST_OPERATIONAL_QUEUE_RECORD_LAYOUT: QueueRecordLayoutConfig = {
    variant: "operational-row",
    version: 2,
    fixedControls: DEFAULT_FIXED,
    columns: [
        {
            key: "identity",
            id: "identity",
            label: "Identity",
            width: queueRecordWidthToCss("large"),
            widthToken: "large",
            role: "identity",
            widgets: [
                { type: "identity", fieldPaths: ["header.title", "header.identity", "child.name"] },
                { type: "contact", fieldPaths: ["body.contact"], linkBehavior: "open-drawer", entityType: "person" },
            ],
        },
        {
            key: "related",
            id: "related",
            label: "Related Records",
            width: queueRecordWidthToCss("medium"),
            widthToken: "medium",
            role: "related",
            widgets: [
                {
                    type: "related-record-chips",
                    fieldPaths: ["body.children", "body.child"],
                    linkBehavior: "open-drawer",
                    entityType: "related",
                },
            ],
        },
        {
            key: "status",
            id: "status",
            label: "Status & Context",
            width: queueRecordWidthToCss("medium"),
            widthToken: "medium",
            role: "status",
            widgets: [
                { type: "status", fieldPaths: ["header.status"] },
                { type: "context", fieldPaths: ["header.location", "child.program", "child.location"] },
            ],
        },
        {
            key: "attention",
            id: "attention",
            label: "Next Step",
            width: queueRecordWidthToCss("flex"),
            widthToken: "flex",
            role: "attention",
            widgets: [
                { type: "attention", fieldPaths: ["header.attention", "context.primary", "next_step"] },
            ],
        },
        {
            key: "date",
            id: "date",
            label: "Date / Event",
            width: queueRecordWidthToCss("small"),
            widthToken: "small",
            role: "date",
            widgets: [{ type: "date", fieldPaths: ["body.tour", "child.desired_start_date"] }],
        },
    ],
};

export function queueRecordLayoutForDocKind(isWaitlist: boolean) {
    return isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();
}

export type { QueueRecordLayoutConfigV3, QueueRecordLayoutEditorConfig } from "@/lib/layout/queueRecordLayoutV3";
