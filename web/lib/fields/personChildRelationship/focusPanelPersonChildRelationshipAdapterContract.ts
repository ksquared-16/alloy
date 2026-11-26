/**
 * Focus Panel adapter contract (foundation only — no product migration).
 */

import type { PersonChildRelationshipInstance } from "./personChildRelationshipEntity";

export type FocusPanelRelationshipSectionContext = {
    section_key: string;
    customer_member_id: string;
    required_operational_role?: string | null;
};

export type FocusPanelRelationshipInstanceViewModel = {
    relationship_id: string;
    person_id: string;
    person_display_name: string;
    operational_roles: readonly string[];
    relationship_type_label: string | null;
    person_fields: Record<string, unknown>;
    relationship_fields: Record<string, unknown>;
};

/** Map canonical relationship instances to Focus Panel VM — presentation may group by Person separately. */
export function buildFocusPanelRelationshipInstanceViewModels(
    instances: readonly PersonChildRelationshipInstance[],
): FocusPanelRelationshipInstanceViewModel[] {
    return instances.map((item) => ({
        relationship_id: item.id,
        person_id: item.person_id,
        person_display_name: String(item.person?.display_name ?? item.person?.full_name ?? "Contact"),
        operational_roles: item.operational_roles,
        relationship_type_label: item.relationship_type,
        person_fields: {
            display_name: item.person?.display_name ?? null,
            email: item.person?.email ?? null,
            phone: item.person?.phone ?? null,
        },
        relationship_fields: {
            relationship_type: item.relationship_type,
            priority: item.priority,
            ...(item.custom_field_values ?? {}),
        },
    }));
}
