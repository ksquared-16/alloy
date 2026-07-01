/**
 * Layout V2 — curated default Waitlist Candidate Card (Phase 1).
 *
 * A presentation-only queue doc for the `placement_candidate` surface
 * (layout_key = "waitlist_candidate_card"). It composes the candidate card
 * FACE only: identity, priority/tier, position, child/household, program fit,
 * availability, override flags, and a reserved action stack. The placement
 * runtime supplies all values (ranking/position/overrides) — this doc never
 * computes them. See docs/waitlist_candidate_card_vm_layout_v2_plan.md (§4).
 *
 * refKeys are flat dot-paths matching waitlistCardVmToProofRecord(): e.g.
 * "child.name", "waitlist.tierLabel". The action stack is a widget placeholder
 * (operational actions are simulated/reserved, not layout fields).
 */

import {
    LAYOUT_DOC_FORMAT_VERSION,
    LAYOUT_GRID_COLUMNS,
    type LayoutDoc,
    type LayoutFieldAdornment,
    type LayoutItem,
    type LayoutRenderHint,
    type LayoutSurface,
} from "./layoutV2";
import { ENROLLMENT_WAITLIST_CANDIDATE_QUEUE_CONTEXT } from "./defaultQueueLayoutVariants";
import { defaultWaitlistQueueLayoutV3 } from "./queueRecordLayoutV3";
import {
    WAITLIST_CANDIDATE_CARD_LAYOUT_KEY,
    WAITLIST_CANDIDATE_ENTITY_TYPE,
    WAITLIST_CARD_RENDER_AS,
} from "./waitlist/waitlistCandidateCardVm";

const id = (...p: string[]) => p.join("-");

function fieldItem(
    base: string,
    refKey: string,
    label: string,
    zone: string,
    renderHint: LayoutRenderHint = "text",
    adornment?: LayoutFieldAdornment,
): LayoutItem {
    const item: LayoutItem = {
        id: id(base, refKey.replace(/\./g, "_")),
        kind: "field",
        refKey,
        label,
        renderHint,
        editable: true,
        metadata: { zone },
    };
    if (adornment) item.adornment = adornment;
    return item;
}

const ICON = (icon: LayoutFieldAdornment["icon"]): LayoutFieldAdornment => ({ position: "left", icon });

/** Context/body widget placed in a card zone (Context Area = shared engine). */
function widgetItem(base: string, widgetKey: string, label: string, zone: string, displayMode?: string): LayoutItem {
    return {
        id: id(base, "w", widgetKey),
        kind: "widget_placeholder",
        refKey: widgetKey,
        label,
        widget: { widgetKey: `placement_candidate.${widgetKey}`, displayMode, note: `${label} widget` },
        metadata: { zone },
    };
}

/** Build the default Waitlist Candidate Card queue doc. */
export function buildWaitlistCandidateCardDefaultDoc(): LayoutDoc {
    const base = id("placement_candidate", "waitlist_card");
    const LEFT = 9;
    const RIGHT = LAYOUT_GRID_COLUMNS - LEFT; // 3

    const leftItems: LayoutItem[] = [
        // HEADER — identity, status, priority tier, location (same header area as Lead)
        fieldItem(base, "child.name", "Child", "header.identity", "text", ICON("child")),
        fieldItem(base, "waitlist.status", "Status", "header.status", "status"),
        fieldItem(base, "waitlist.tierLabel", "Priority tier", "header.priority", "badge"),
        fieldItem(base, "household.locationName", "Location", "header.location", "text", ICON("location")),

        // CONTEXT AREA — waitlist-specific context, as reusable widgets (not a
        // special path): position, waitlisted-since, sibling, adjust.
        widgetItem(base, "waitlist_position", "Position", "context.primary", "badge"),
        widgetItem(base, "waitlisted_since", "Waitlisted since", "context.primary", "text"),
        widgetItem(base, "sibling_context", "Sibling context", "context.secondary", "text"),
        widgetItem(base, "waitlist_adjustment", "Adjust position", "context.secondary", "control"),

        // BODY — contact row + program fit + availability + override flags
        fieldItem(base, "household.primaryContactName", "Contact", "body.contact", "text", ICON("person")),
        fieldItem(base, "household.phone", "Phone", "body.contact", "phone", ICON("phone")),
        fieldItem(base, "household.email", "Email", "body.contact", "text", ICON("mail")),
        fieldItem(base, "child.programLabel", "Program", "body.program_fit", "text"),
        fieldItem(base, "waitlist.cohortSectionTitle", "Cohort", "body.program_fit", "text"),
        fieldItem(base, "child.desiredStartDate", "Desired start", "body.availability", "date", ICON("calendar")),
        fieldItem(base, "overrides.flags", "Overrides", "body.override_flags", "badge"),
    ];

    // actions.stack — reserved operational actions (simulated; not layout fields)
    const actionStack: LayoutItem = {
        id: id(base, "actions"),
        kind: "widget_placeholder",
        refKey: "actions",
        label: "Actions",
        widget: { widgetKey: "placement_candidate.actions", displayMode: "buttons", note: "Waitlist actions" },
        metadata: { zone: "actions.stack", actions: ["Open", "Message", "Create Offer", "Override", "Ask BOS"], layout: "stack" },
    };

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "queue",
        entityType: WAITLIST_CANDIDATE_ENTITY_TYPE,
        sections: [
            {
                id: id(base, "sec"),
                key: "waitlist_candidate_card",
                title: "Waitlist candidate card",
                collapsible: true,
                defaultExpanded: true,
                rows: [
                    {
                        id: id(base, "r0"),
                        columns: [
                            { id: id(base, "r0", "c0"), width: LEFT, items: leftItems },
                            { id: id(base, "r0", "c1"), width: RIGHT, items: [actionStack] },
                        ],
                    },
                ],
            },
        ],
        metadata: {
            seededFrom: "waitlist_default",
            template: "waitlist_candidate_card_v1",
            renderAs: WAITLIST_CARD_RENDER_AS,
            layoutKey: WAITLIST_CANDIDATE_CARD_LAYOUT_KEY,
            queue_record_layout: defaultWaitlistQueueLayoutV3(),
            queue_context: ENROLLMENT_WAITLIST_CANDIDATE_QUEUE_CONTEXT,
            // Display-only group config (Goal 6). Runtime owns ranking/grouping/
            // ordering/cohort membership; Layout V2 only styles the group header.
            group: {
                showGroupHeader: true,
                showGroupCount: true,
                showGroupBadge: false,
                showRuntimePosition: true,
                /** Header template: {label} = cohort label, {count} = group size. */
                headerTemplate: "{label} waitlist",
            },
        },
    };
}

/** Display-only group-header config (Goal 6) — never affects grouping logic. */
export type WaitlistGroupDisplayConfig = {
    showGroupHeader: boolean;
    showGroupCount: boolean;
    showGroupBadge: boolean;
    showRuntimePosition: boolean;
    headerTemplate: string;
};

export const DEFAULT_WAITLIST_GROUP_CONFIG: WaitlistGroupDisplayConfig = {
    showGroupHeader: true,
    showGroupCount: true,
    showGroupBadge: false,
    showRuntimePosition: true,
    headerTemplate: "{label} waitlist",
};

/** Read the (display-only) group config off a resolved doc, with safe defaults. */
export function readWaitlistGroupConfig(doc: { metadata?: Record<string, unknown> | null } | null | undefined): WaitlistGroupDisplayConfig {
    const raw = (doc?.metadata?.group ?? {}) as Partial<WaitlistGroupDisplayConfig>;
    return {
        showGroupHeader: raw.showGroupHeader ?? DEFAULT_WAITLIST_GROUP_CONFIG.showGroupHeader,
        showGroupCount: raw.showGroupCount ?? DEFAULT_WAITLIST_GROUP_CONFIG.showGroupCount,
        showGroupBadge: raw.showGroupBadge ?? DEFAULT_WAITLIST_GROUP_CONFIG.showGroupBadge,
        showRuntimePosition: raw.showRuntimePosition ?? DEFAULT_WAITLIST_GROUP_CONFIG.showRuntimePosition,
        headerTemplate: typeof raw.headerTemplate === "string" && raw.headerTemplate.trim() ? raw.headerTemplate : DEFAULT_WAITLIST_GROUP_CONFIG.headerTemplate,
    };
}

/**
 * Curated default for the waitlist candidate surface; null for anything else
 * (callers fall back to the registry / lead default). Only the
 * (placement_candidate, queue) pair has a curated default in Phase 1.
 */
export function buildWaitlistDefaultDoc(entityType: string, surface: LayoutSurface): LayoutDoc | null {
    if (entityType !== WAITLIST_CANDIDATE_ENTITY_TYPE) return null;
    if (surface !== "queue") return null;
    return buildWaitlistCandidateCardDefaultDoc();
}
