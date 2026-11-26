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

/**
 * WHAT AN UNBOUND MEMBER OF A RELATIONSHIP COLLECTION MEANS — from the definition that owns it.
 *
 * A relationship collection's members are the person it adds: the definition declares them
 * (`nested_field_keys`: full_name, phone, …), and this module owns their labels and destinations.
 * Collections authored before member bindings existed (the published Admissions Packet's Parents and
 * guardians / Emergency contacts) carry the same questions — "Full name", "Phone" — with no
 * `field_source`, so a proposal from them had no identity and could never be committed.
 *
 * The contract:
 *   EXPLICIT FIRST   a member with its own `field_source` keeps it; interpretation never overrides it.
 *   INSIDE ONLY      only members of a collection whose definition is known are read; the definition,
 *                    not the label, says whose answer it is (never ownership from a label).
 *   UNIQUE           a member matches a declared key when every essential word of that key appears in
 *                    its label ("Relationship to the child" ⊇ {relationship}); exactly one key must
 *                    match, and no other member may claim the same key — otherwise it stays unresolved.
 *   NOTHING INVENTED a member that matches nothing is left alone; the value is never rewritten.
 */
const QUALIFIER_WORDS = new Set(["full", "type"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean));

export type RelationshipMemberInterpretation = {
    readonly field_source: FormFieldSource;
    /** `bound`: the member's own field_source. `definition_member`: matched to a declared member key. */
    readonly basis: "bound" | "definition_member";
};

export function interpretRelationshipMemberFields(
    def: RelationshipDefinition,
    members: ReadonlyArray<{ id: string; label?: string | null; field_source?: FormFieldSource | null }>,
): { interpreted: Map<string, RelationshipMemberInterpretation>; unresolved: string[] } {
    const interpreted = new Map<string, RelationshipMemberInterpretation>();
    const claims = new Map<string, string[]>(); // field_key -> member ids
    const claim = (key: string, id: string) => claims.set(key, [...(claims.get(key) ?? []), id]);
    const unresolved: string[] = [];

    for (const m of members) {
        if (m.field_source?.entity_type && m.field_source.field_key) {
            interpreted.set(m.id, { field_source: m.field_source, basis: "bound" });
            claim(m.field_source.field_key, m.id);
        }
    }
    const tentative = new Map<string, string>(); // member id -> key
    for (const m of members) {
        if (interpreted.has(m.id)) continue;
        const label = words(m.label ?? "");
        const matches = def.nested_field_keys.filter((key) => {
            const essential = key.split("_").filter((w) => w && !QUALIFIER_WORDS.has(w));
            return essential.length > 0 && essential.every((w) => label.has(w));
        });
        if (matches.length === 1) {
            tentative.set(m.id, matches[0]!);
            claim(matches[0]!, m.id);
        } else {
            unresolved.push(m.id);
        }
    }
    for (const [id, key] of tentative) {
        // Two members answering one declared key cannot both be it; neither is guessed.
        if ((claims.get(key) ?? []).length > 1) {
            unresolved.push(id);
            continue;
        }
        interpreted.set(id, { field_source: relationshipNestedFieldSource(key, def), basis: "definition_member" });
    }
    return { interpreted, unresolved };
}
