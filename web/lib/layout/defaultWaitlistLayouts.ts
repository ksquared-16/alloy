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

/** Build the default Waitlist Candidate Card queue doc. */
export function buildWaitlistCandidateCardDefaultDoc(): LayoutDoc {
    const base = id("placement_candidate", "waitlist_card");
    const LEFT = 9;
    const RIGHT = LAYOUT_GRID_COLUMNS - LEFT; // 3

    const leftItems: LayoutItem[] = [
        // header.identity — child name + house icon
        fieldItem(base, "child.name", "Child", "header.identity", "text", ICON("child")),
        // header.priority — tier/bucket pill (runtime-computed)
        fieldItem(base, "waitlist.tierLabel", "Priority tier", "header.priority", "badge"),
        // header.position — "Position 3/12" (runtime-computed)
        fieldItem(base, "waitlist.positionLabel", "Position", "header.position", "text"),

        // body.child — program fit + age + desired start
        fieldItem(base, "child.programLabel", "Program", "body.child", "text"),
        fieldItem(base, "child.ageLabel", "Age", "body.child", "text"),

        // body.program_fit — cohort context
        fieldItem(base, "waitlist.cohortSectionTitle", "Cohort", "body.program_fit", "text"),

        // body.availability — desired start / wait since
        fieldItem(base, "waitlist.waitSince", "Waitlisted since", "body.availability", "text", ICON("calendar")),
        fieldItem(base, "child.desiredStartDate", "Desired start", "body.availability", "date", ICON("calendar")),

        // body.household — contact row
        fieldItem(base, "household.primaryContactName", "Contact", "body.household", "text", ICON("person")),
        fieldItem(base, "household.phone", "Phone", "body.household", "phone", ICON("phone")),
        fieldItem(base, "household.email", "Email", "body.household", "text", ICON("mail")),
        fieldItem(base, "household.locationName", "Location", "body.household", "text", ICON("location")),

        // body.override_flags — pinned / adjusted badges (display only)
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
        },
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
