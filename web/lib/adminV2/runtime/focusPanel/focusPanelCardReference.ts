/**
 * Card reference catalog — the canonical "what does this card show" model that
 * seeds the contextual Inspector (Experience Builder Alpha).
 *
 * Household is the REFERENCE IMPLEMENTATION: its complete ordered field list,
 * business-concept bindings, collection (related-list) roles, renderers, empty
 * states and collapsed/expanded placement are described here. Other cards get a
 * lighter description. The Inspector merges this reference with any persisted
 * `FocusPanelCardConfig` so saved edits win.
 *
 * Presentation Data doctrine: fields bind to BUSINESS CONCEPTS, never raw columns.
 * Relationship doctrine: named one-to-many roles (Children, Additional Contacts,
 * Authorized Pickups, Emergency Contacts) are collection-kind fields rendered as
 * related lists — NEVER flattened.
 */

import type {
    FocusPanelCardExpansion,
    FocusPanelCardField,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { allConceptPaths } from "@/lib/adminV2/runtime/focusPanel/focusPanelConceptCatalog";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

export type FocusPanelCardReference = {
    title: string;
    description: string;
    /** Ordered fields shown on the card ("Data shown" + related lists). */
    fields: FocusPanelCardField[];
    /** Default collapsed/expanded behavior for the card. */
    expansion: FocusPanelCardExpansion;
    /** Business concepts offered first in pickers (rest of the tree still available). */
    conceptOptions: string[];
    /** Card-level actions (Actions section). */
    actions: string[];
};

const HOUSEHOLD_REFERENCE: FocusPanelCardReference = {
    title: "Household",
    description: "Primary and secondary contacts plus the related people for this enrollment.",
    fields: [
        {
            id: "primary_contact",
            label: "Primary Contact",
            concept: "Enrollment → Primary Contact → Name",
            renderer: "relationship_summary",
            kind: "field",
            placement: "collapsed",
        },
        {
            id: "primary_phone",
            label: "Phone",
            concept: "Enrollment → Primary Contact → Phone",
            renderer: "text",
            kind: "field",
            placement: "collapsed",
        },
        {
            id: "primary_email",
            label: "Email",
            concept: "Enrollment → Primary Contact → Email",
            renderer: "text",
            kind: "field",
            placement: "collapsed",
        },
        {
            id: "children",
            label: "Children",
            concept: "Enrollment → Children → Summary",
            renderer: "count_expand",
            kind: "collection",
            placement: "collapsed",
            maxRows: 3,
            emptyText: "No children linked",
        },
        {
            id: "secondary_contact",
            label: "Secondary Contact",
            concept: "Enrollment → Secondary Contact → Name",
            renderer: "relationship_summary",
            kind: "field",
            placement: "expanded",
        },
        {
            id: "secondary_phone",
            label: "Secondary Phone",
            concept: "Enrollment → Secondary Contact → Phone",
            renderer: "text",
            kind: "field",
            placement: "expanded",
        },
        {
            id: "authorized_pickups",
            label: "Authorized Pickups",
            concept: "Enrollment → Authorized Pickups → Summary",
            renderer: "count_expand",
            kind: "collection",
            placement: "expanded",
            emptyText: "No authorized pickups",
        },
        {
            id: "emergency_contacts",
            label: "Emergency Contacts",
            concept: "Enrollment → Emergency Contacts → Summary",
            renderer: "count_expand",
            kind: "collection",
            placement: "expanded",
            emptyText: "No emergency contacts",
        },
    ],
    expansion: { default: "collapsed" },
    conceptOptions: [
        "Enrollment → Primary Contact → Name",
        "Enrollment → Primary Contact → Phone",
        "Enrollment → Primary Contact → Email",
        "Enrollment → Secondary Contact → Name",
        "Enrollment → Secondary Contact → Phone",
        "Enrollment → Children → Summary",
    ],
    actions: ["Add Contact", "Edit Household", "Message Primary Contact"],
};

const CHILDREN_REFERENCE: FocusPanelCardReference = {
    title: "Children",
    description: "Children / siblings linked to this enrollment.",
    fields: [
        {
            id: "child_name",
            label: "Name",
            concept: "Enrollment → Children → Name",
            renderer: "text",
            kind: "field",
            placement: "collapsed",
        },
        {
            id: "child_status",
            label: "Status",
            concept: "Enrollment → Children → Status",
            renderer: "status_pill",
            kind: "field",
            placement: "collapsed",
        },
        {
            id: "child_room",
            label: "Current Room",
            concept: "Enrollment → Children → Current Room",
            renderer: "text",
            kind: "field",
            placement: "expanded",
        },
    ],
    expansion: { default: "collapsed" },
    conceptOptions: [
        "Enrollment → Children → Name",
        "Enrollment → Children → Age",
        "Enrollment → Children → Status",
        "Enrollment → Children → Current Room",
    ],
    actions: ["Add Child", "Link Existing Child"],
};

const REFERENCES: Partial<Record<FocusPanelCardKey, FocusPanelCardReference>> = {
    household: HOUSEHOLD_REFERENCE,
    children: CHILDREN_REFERENCE,
};

/** Reference description for a card type (Household / Children are complete). */
export function getFocusPanelCardReference(key: FocusPanelCardKey): FocusPanelCardReference | null {
    return REFERENCES[key] ?? null;
}

/** Default ordered fields for a card (used to seed the Inspector Fields section). */
export function defaultCardFields(key: FocusPanelCardKey): FocusPanelCardField[] {
    return (REFERENCES[key]?.fields ?? []).map((field) => ({ ...field }));
}

/** Default expansion behavior for a card. */
export function defaultCardExpansion(key: FocusPanelCardKey): FocusPanelCardExpansion {
    return REFERENCES[key]?.expansion ?? { default: "collapsed" };
}

/** Concepts surfaced first in the picker for a card (full tree still available). */
export function conceptOptionsForCard(key: FocusPanelCardKey): string[] {
    return REFERENCES[key]?.conceptOptions ?? allConceptPaths();
}
