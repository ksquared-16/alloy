/**
 * The questions a relationship collection asks about each person in it.
 *
 * One owner for the shape of a related person's nested fields, so a group the importer projects from a
 * document and a group an operator adds in Forms Studio are the same group: same labels, same answer
 * types, same canonical destinations. Keyed on the FIELD key, never on the role.
 */
import { PERSON_CHILD_RELATIONSHIP_NATIVE_COLUMN_KEYS } from "@/lib/fields/personChildRelationship/personChildRelationshipFieldRegistry";
import type { RelationshipDefinition } from "@/lib/fields/relationship/relationshipDefinitions";
import type { FormFieldSource } from "@/lib/forms/schema";

/** Keys owned by the relationship EDGE rather than the Person identity. Registry-driven. */
const EDGE_OWNED_KEYS = new Set<string>(PERSON_CHILD_RELATIONSHIP_NATIVE_COLUMN_KEYS);

/** Generic key → answer type. */
export function relationshipNestedFieldType(fieldKey: string): "date" | "boolean" | "text" {
    const k = fieldKey.toLowerCase();
    if (k.includes("date") || k.endsWith("_at") || k === "dob") return "date";
    if (k.startsWith("is_") || k.startsWith("has_") || k.startsWith("can_")) return "boolean";
    return "text";
}

/** Humanise a canonical field key for the operator-facing nested label. */
export function relationshipNestedFieldLabel(fieldKey: string): string {
    const words = fieldKey.replace(/_/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Where a nested answer is stored: the edge for edge-owned keys, otherwise the related person. */
export function relationshipNestedFieldSource(fieldKey: string, def: RelationshipDefinition): FormFieldSource {
    return EDGE_OWNED_KEYS.has(fieldKey)
        ? { entity_type: "person_child_relationship", field_key: fieldKey }
        : { entity_type: def.target_entity_type, field_key: fieldKey };
}
