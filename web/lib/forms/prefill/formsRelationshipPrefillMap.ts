/**
 * Relationship leaf prefill path mapping for Forms runtime.
 *
 * P3A compatibility shim — legacy contact.* map for backward compatibility.
 *
 * Canonical relationship semantics live in formsRelationshipPrefillResolver.
 * Maps persisted relationship lineage → legacy prefill roots the resolver already loads.
 * Does not silently pick among multiple relationship candidates — resolver must enforce cardinality.
 */

import type { FormField, FormFieldSourceRelationship } from "@/lib/forms/schema";
import { formFieldSourceHasRelationshipLineage } from "@/lib/fields/formsRelationshipFieldSourceBinding";
import { formsRelationshipRoleFromSource } from "@/lib/fields/formsLegacyContactRoleCompatibility";

/** Prefill root + column for a relationship leaf when resolvable from launch context. */
export type RelationshipPrefillTarget = {
    root: "person" | "contact";
    column: string;
    /** When true, resolver must confirm exactly one related person before applying. */
    requiresUniqueRelationship: boolean;
};

const LEAF_TO_COLUMN: Record<string, string> = {
    email: "email",
    phone: "phone",
    name: "full_name",
    display_name: "full_name",
    first_name: "first_name",
    last_name: "last_name",
};

/**
 * Primary contact prefill uses customers.primary_contact_id → contact row.
 * Other roles require relationship resolution (deferred to server adapter) — return null when not primary.
 */
export function relationshipPrefillTargetForField(field: FormField): RelationshipPrefillTarget | null {
    if (field.type === "group" || field.type === "signature" || field.type === "file_ref") return null;
    const source = field.field_source;
    if (!source || !formFieldSourceHasRelationshipLineage(source)) return null;
    return relationshipPrefillTargetForBinding(source.relationship);
}

export function relationshipPrefillTargetForBinding(
    relationship: FormFieldSourceRelationship,
): RelationshipPrefillTarget | null {
    const leaf = relationship.leaf_key?.trim().toLowerCase() ?? "";
    const column = LEAF_TO_COLUMN[leaf];
    if (!column) return null;

    const role = formsRelationshipRoleFromSource(relationship, relationship.provider_ref_key);
    if (role === "primary") {
        return { root: "contact", column, requiresUniqueRelationship: true };
    }
    // Non-primary roles need relationship graph resolution — prefill adapter returns undefined until P3.
    return { root: "person", column, requiresUniqueRelationship: true };
}

/** Build fieldId → prefill path entries for relationship-bound scalars (primary contact only in P2). */
export function buildRelationshipPrefillFieldMap(schema: {
    fields: FormField[];
}): Record<string, string> {
    const map: Record<string, string> = {};
    const walk = (fields: FormField[]) => {
        for (const field of fields) {
            if (field.type === "group") {
                walk(field.fields);
                continue;
            }
            const target = relationshipPrefillTargetForField(field);
            if (!target) continue;
            if (target.root === "contact" && target.requiresUniqueRelationship) {
                map[field.id] = `contact.${target.column}`;
            }
        }
    };
    walk(schema.fields);
    return map;
}
