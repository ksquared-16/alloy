/**
 * Resolve configured provider refs for Emergency Contact relationship instances.
 */

import type { EmergencyContactEvidenceItem } from "./buildEmergencyContactsEvidence";
import type { NestedSurfaceFieldLayoutWidth } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import type { SurfaceFieldVisibility } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import type { IdentityFieldCellVM, IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import { fieldLayoutWidthForNestedGroup } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { fieldPresentationLabel } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { resolveIdentityFieldPolicy } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import { fieldShouldRender } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function formatDisplayValue(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/** Resolve one configured field ref against a relationship-instance item. */
export function resolveEmergencyContactFieldValue(
    fieldRef: string,
    item: EmergencyContactEvidenceItem,
): string | null {
    const ref = fieldRef.trim();
    if (ref.startsWith("person.")) {
        const key = ref.slice("person.".length);
        if (key === "primary_contact_name" || key === "display_name" || key === "name") {
            return item.person_display_name;
        }
        if (key === "phone") return formatDisplayValue(item.person_fields.phone);
        if (key === "email") return formatDisplayValue(item.person_fields.email);
        if (key === "role_label") return item.operational_role_labels[0] ?? null;
        return formatDisplayValue(item.person_fields[key]);
    }
    if (ref.startsWith("person_child_relationship.")) {
        const key = ref.slice("person_child_relationship.".length);
        if (key === "relationship_type") return item.relationship_type_label;
        if (key === "priority") return item.priority != null ? String(item.priority) : null;
        if (key === "status") return item.status;
        return formatDisplayValue(item.relationship_fields[key]);
    }
    return null;
}

export function buildEmergencyContactFieldRows(args: {
    item: EmergencyContactEvidenceItem;
    fieldKeys: readonly string[];
    config: NestedSurfaceConfig | null;
    groupKey: string;
    canEditPerson: boolean;
    canEditRelationship: boolean;
}): IdentityFieldRowVM[] {
    const cells: IdentityFieldCellVM[] = [];
    for (const fieldRef of args.fieldKeys) {
        const policy = args.config
            ? resolveIdentityFieldPolicy({
                  config: args.config,
                  groupKey: args.groupKey,
                  fieldRef,
                  editGroupKey: "child_edit",
              })
            : ("read-only" as SurfaceFieldVisibility);
        if (!fieldShouldRender(policy)) continue;
        const isPersonField = fieldRef.startsWith("person.");
        const editable = isPersonField ? args.canEditPerson : args.canEditRelationship;
        const value = resolveEmergencyContactFieldValue(fieldRef, args.item);
        const catalogFallback = fieldRef.replace(/^[a-z_]+\./, "").replace(/_/g, " ");
        cells.push({
            fieldRef,
            label: args.config
                ? fieldPresentationLabel(args.config, args.groupKey, fieldRef, catalogFallback)
                : catalogFallback,
            value,
            labelMode: "visible",
            policy,
            editable,
            hideWhenEmpty: false,
            width: args.config
                ? fieldLayoutWidthForNestedGroup(args.config, args.groupKey, fieldRef)
                : ("full" as NestedSurfaceFieldLayoutWidth),
        });
    }
    if (cells.length === 0) return [];
    return [{ row: 0, cells }];
}

export function isPersonOwnedEmergencyContactField(fieldRef: string): boolean {
    return fieldRef.trim().startsWith("person.");
}

export function isRelationshipOwnedEmergencyContactField(fieldRef: string): boolean {
    return fieldRef.trim().startsWith("person_child_relationship.");
}
