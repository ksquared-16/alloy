/**
 * Identity field picker → provider parity for Focus Panel nested surfaces.
 *
 * Contract: a field shown in the normal available-field picker must have a
 * resolvable display path for the selected card/subject context. Writable
 * affordances require a mutation binding. Computed / relationship fields may
 * appear as display-only.
 */

import { isChildcareHiddenRefKey } from "@/lib/layout/childcareLayoutFieldCatalog";
import { isIdentityFieldSaveSupported } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";
import { resolveIdentityFieldEditContract } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldEditContract";

export type IdentityFieldParityClass =
    | "native_writable"
    | "configurable_writable"
    | "computed_display_only"
    | "relationship_display_only"
    | "unsupported_in_context";

/** Computed display fields that ARE offered for Focus Panel identity cards. */
export const COMPUTED_DISPLAY_OFFERED_REFS = new Set<string>([
    "person.full_name",
    "contact.full_name",
    "child.full_name",
    "child.age",
    "child.age_band",
    "child.gender_label",
]);

/**
 * Attractive but unsupported in Focus Panel identity scalar picker.
 * Prefer removal over a broken provider path.
 */
export const UNSUPPORTED_IDENTITY_PICKER_REFS = new Set<string>([
    // Prefs live on communication_preferences — no identity scalar provider yet.
    "person.communication_preference",
    "person.communication_opt_out",
    // Legacy / duplicate phone semantics — canonical is person.phone ("Phone").
    "person.mobile",
    "person.secondary_phone",
    "contact.mobile",
    "contact.secondary_phone",
]);

/** Relationship-scoped display fields — only when the picker namespaces include the edge. */
export const RELATIONSHIP_SCOPED_DISPLAY_REFS = new Set<string>([
    "person.relationship_to_child",
    "person.relationship",
    "contact.relationship",
    "person_child_relationship.relationship_type",
    "person_child_relationship.role",
]);

export type IdentityFieldParityResult = {
    fieldRef: string;
    classification: IdentityFieldParityClass;
    offeredInPicker: boolean;
    editable: boolean;
    reason: string;
};

function hasRelationshipScope(namespaces: readonly string[]): boolean {
    return namespaces.some(
        (n) => n === "person_child_relationship" || n === "household_member",
    );
}

/**
 * Classify a picker candidate for a Focus Panel identity card context.
 */
export function classifyIdentityFieldParity(
    fieldRef: string,
    namespaces: readonly string[],
): IdentityFieldParityResult {
    const trimmed = fieldRef.trim();
    const edit = resolveIdentityFieldEditContract(trimmed);

    if (!trimmed) {
        return {
            fieldRef: trimmed,
            classification: "unsupported_in_context",
            offeredInPicker: false,
            editable: false,
            reason: "Empty field ref",
        };
    }

    if (UNSUPPORTED_IDENTITY_PICKER_REFS.has(trimmed)) {
        return {
            fieldRef: trimmed,
            classification: "unsupported_in_context",
            offeredInPicker: false,
            editable: false,
            reason: "No Focus Panel identity provider for this field",
        };
    }

    if (RELATIONSHIP_SCOPED_DISPLAY_REFS.has(trimmed) || edit.reason === "relationship_action") {
        const scoped = hasRelationshipScope(namespaces);
        return {
            fieldRef: trimmed,
            classification: "relationship_display_only",
            offeredInPicker: scoped,
            editable: false,
            reason: scoped
                ? "Relationship-derived display"
                : "Requires relationship-scoped card context",
        };
    }

    if (isChildcareHiddenRefKey(trimmed) && !COMPUTED_DISPLAY_OFFERED_REFS.has(trimmed)) {
        return {
            fieldRef: trimmed,
            classification: "unsupported_in_context",
            offeredInPicker: false,
            editable: false,
            reason: "Hidden from childcare / identity pickers",
        };
    }

    if (COMPUTED_DISPLAY_OFFERED_REFS.has(trimmed) || edit.reason === "computed") {
        return {
            fieldRef: trimmed,
            classification: "computed_display_only",
            offeredInPicker: true,
            editable: false,
            reason: "Computed display-only",
        };
    }

    if (isIdentityFieldSaveSupported(trimmed) && edit.canOfferEditable) {
        return {
            fieldRef: trimmed,
            classification: "native_writable",
            offeredInPicker: true,
            editable: true,
            reason: "Native writable with mutation binding",
        };
    }

    if (isIdentityFieldSaveSupported(trimmed)) {
        return {
            fieldRef: trimmed,
            classification: "configurable_writable",
            offeredInPicker: true,
            editable: false,
            reason: "Save-supported; Linked or read-only by policy",
        };
    }

    return {
        fieldRef: trimmed,
        classification: "unsupported_in_context",
        offeredInPicker: false,
        editable: false,
        reason: "No display provider or mutation binding for this context",
    };
}

/** True when the field may appear in the normal available-field picker. */
export function isIdentityFieldOfferedInPicker(
    fieldRef: string,
    namespaces: readonly string[],
): boolean {
    return classifyIdentityFieldParity(fieldRef, namespaces).offeredInPicker;
}
