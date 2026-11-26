/**
 * Resolve edit control binding for Emergency Contact configured field refs.
 */

import {
    PERSON_CHILD_RELATIONSHIP_NATIVE_FIELD_MANIFEST,
    personChildRelationshipProviderRef,
} from "@/lib/fields/personChildRelationship/personChildRelationshipFieldRegistry";
import { PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE } from "@/lib/fields/personChildRelationship/personChildRelationshipEntity";

export type EmergencyContactFieldEditControl =
    | { kind: "text" }
    | { kind: "number" }
    | { kind: "choice"; optionSetKey: string; storedValueKey: string };

type FieldDefinitionRow = {
    field_key: string;
    field_type: string;
    config?: Record<string, unknown> | null;
};

function pcrFieldKeyFromRef(fieldRef: string): string | null {
    const prefix = "person_child_relationship.";
    if (!fieldRef.startsWith(prefix)) return null;
    return fieldRef.slice(prefix.length).trim() || null;
}

export function resolveEmergencyContactFieldEditControl(
    fieldRef: string,
    tenantFieldDefinitions?: readonly FieldDefinitionRow[],
): EmergencyContactFieldEditControl {
    const pcrKey = pcrFieldKeyFromRef(fieldRef);
    if (!pcrKey) return { kind: "text" };

    const native = PERSON_CHILD_RELATIONSHIP_NATIVE_FIELD_MANIFEST.find((row) => row.field_key === pcrKey);
    if (native) {
        if (native.field_type === "number") return { kind: "number" };
        if (native.field_type === "select") {
            const optionSetKey =
                typeof native.config?.option_set_key === "string" ? native.config.option_set_key.trim() : "";
            if (optionSetKey) {
                return { kind: "choice", optionSetKey, storedValueKey: pcrKey };
            }
        }
        return { kind: "text" };
    }

    const tenant = tenantFieldDefinitions?.find(
        (row) => row.field_key === pcrKey,
    );
    if (tenant?.field_type === "select" || tenant?.field_type === "multiselect") {
        const optionSetKey =
            typeof tenant.config?.option_set_key === "string" ? tenant.config.option_set_key.trim() : "";
        if (optionSetKey) {
            return { kind: "choice", optionSetKey, storedValueKey: pcrKey };
        }
    }
    if (tenant?.field_type === "number") return { kind: "number" };

    return { kind: "text" };
}

export function personChildRelationshipFieldDefinitionsEntityType(): string {
    return PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE;
}

/** Stable provider ref for native relationship_type (Choice Option consumer). */
export function relationshipTypeProviderRef(): string {
    return personChildRelationshipProviderRef("relationship_type");
}
