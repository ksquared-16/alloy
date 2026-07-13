/**
 * Configurable Household relationship sections — criteria, precedence, and deduplication.
 */

import type { NestedSurfaceConfig, NestedSurfaceGroupConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { nestedGroupLabel } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { sectionSemanticForGroup } from "@/lib/adminV2/settings/surfaces/sectionCatalog";

export type IdentityRelationshipCriteria = {
    roleKeys?: string[];
    relationshipTypes?: string[];
};

export type IdentityRelationshipSectionConfig = {
    key: string;
    label: string;
    relationshipCriteria?: IdentityRelationshipCriteria;
    order: number;
    visibility?: "always" | "when_nonempty" | "hidden";
    presentationRef?: string;
};

/** Default section precedence — highest priority wins once per person. */
export const HOUSEHOLD_RELATIONSHIP_SECTION_PRECEDENCE = [
    "primary_contact",
    "other_parent_guardian",
    "emergency_contacts",
    "authorized_pickups",
    "billing_contact",
    "household_members",
    "children",
] as const;

function normalizeRole(role: string | null | undefined): string {
    return (role ?? "").trim().toLowerCase();
}

function groupCriteria(group: NestedSurfaceGroupConfig): IdentityRelationshipCriteria | null {
    if (group.relationshipCriteria) return group.relationshipCriteria;
    const semantic = group.sectionSemantic ?? sectionSemanticForGroup("household_surface", group.key);
    switch (semantic) {
        case "emergency_contact":
            return { roleKeys: ["emergency_contact", "emergency"] };
        case "authorized_pickup":
            return { roleKeys: ["authorized_pickup", "pickup"] };
        case "billing_contact":
            return { roleKeys: ["billing_contact", "billing"] };
        default:
            return null;
    }
}

function roleMatchesCriteria(roleType: string | null, criteria: IdentityRelationshipCriteria): boolean {
    const role = normalizeRole(roleType);
    if (criteria.roleKeys?.some((key) => role.includes(key))) return true;
    if (criteria.relationshipTypes?.some((key) => role === key)) return true;
    return false;
}

/** Resolve relationship sections from nested config in precedence order. */
export function householdRelationshipSectionsFromConfig(
    config: NestedSurfaceConfig | null,
): IdentityRelationshipSectionConfig[] {
    if (!config) return [];
    const byKey = new Map(config.groups.map((group) => [group.key, group]));
    return HOUSEHOLD_RELATIONSHIP_SECTION_PRECEDENCE.flatMap((key, index) => {
        const group = byKey.get(key);
        if (!group || group.enabled === false) return [];
        return [{
            key,
            label: nestedGroupLabel(config, key) ?? key,
            relationshipCriteria: groupCriteria(group) ?? undefined,
            order: group.sectionOrder ?? index,
            visibility: group.sectionVisibility ?? "when_nonempty",
            presentationRef: key,
        }];
    });
}

/** Assign a contact role to the highest-priority matching configured section. */
export function resolveHouseholdContactSectionKey(args: {
    config: NestedSurfaceConfig | null;
    roleType: string | null;
    isPrimary: boolean;
    assignedPersonIds: ReadonlySet<string>;
    personId: string;
}): string {
    if (args.isPrimary) return "primary_contact";
    if (args.assignedPersonIds.has(args.personId)) return "";

    if (!args.config) return "household_members";
    const byKey = new Map(args.config.groups.map((group) => [group.key, group]));
    for (const key of HOUSEHOLD_RELATIONSHIP_SECTION_PRECEDENCE) {
        if (key === "primary_contact" || key === "children") continue;
        const group = byKey.get(key);
        if (!group) continue;
        if (key === "other_parent_guardian") {
            const role = normalizeRole(args.roleType);
            if (
                role.includes("parent")
                || role.includes("guardian")
                || role === "primary_contact"
                || role === "primary"
            ) {
                return key;
            }
            continue;
        }
        const criteria = groupCriteria(group);
        if (criteria && roleMatchesCriteria(args.roleType, criteria)) {
            return key;
        }
        if (key === "household_members") {
            return key;
        }
    }
    return "household_members";
}
