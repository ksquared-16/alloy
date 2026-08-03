/**
 * Household relationship section runtime resolution.
 */

import type { NestedSurfaceConfig, NestedSurfaceGroupConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { isOptionalNestedGroup, nestedGroupLabel } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    householdRelationshipSectionDefinition,
    householdRelationshipSectionDefinitionForLegacyGroup,
    type RelationshipCriteria,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionDefinitions";
import {
    listHouseholdRelationshipSectionInstances,
    migrateHouseholdRelationshipSectionInstances,
    type HouseholdRelationshipSectionInstance,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionInstances";

export type IdentityRelationshipCriteria = RelationshipCriteria;

export type IdentityRelationshipSectionConfig = HouseholdRelationshipSectionInstance & {
    key: string;
};

/** @deprecated Use instance order from config. */
export const HOUSEHOLD_RELATIONSHIP_SECTION_PRECEDENCE = [
    "primary_contact",
    "other_parent_guardian",
    "emergency_contacts",
    "authorized_pickups",
    "billing_contact",
    "household_members",
    "children",
] as const;

export const HOUSEHOLD_RELATIONSHIP_ROLE_OPTIONS = [
    { key: "parent", label: "Parent / Guardian" },
    { key: "guardian", label: "Guardian" },
    { key: "primary_contact", label: "Primary contact role" },
    { key: "emergency_contact", label: "Emergency contact" },
    { key: "emergency", label: "Emergency" },
    { key: "authorized_pickup", label: "Authorized pickup" },
    { key: "pickup", label: "Pickup" },
    { key: "billing_contact", label: "Billing contact" },
    { key: "billing", label: "Billing" },
    { key: "grandparent", label: "Grandparent" },
    { key: "relative", label: "Relative" },
    { key: "additional", label: "Additional contact" },
    { key: "contact", label: "Contact" },
    { key: "member", label: "Household member" },
] as const;

function normalizeRole(role: string | null | undefined): string {
    return (role ?? "").trim().toLowerCase();
}

function groupForInstance(config: NestedSurfaceConfig, instanceKey: string): NestedSurfaceGroupConfig | undefined {
    return config.groups.find((group) => (group.instanceKey ?? group.key) === instanceKey);
}

function criteriaForGroup(group: NestedSurfaceGroupConfig): RelationshipCriteria {
    const def =
        (group.definitionKey ? householdRelationshipSectionDefinition(group.definitionKey) : undefined)
        ?? householdRelationshipSectionDefinitionForLegacyGroup(group.key);
    const defaults = def?.defaultCriteria ?? {};
    const authored = group.relationshipCriteria;
    if (!authored) return defaults;

    // Parent / Guardian: always union platform role keys so stale publishes that only
    // list parent|guardian still classify create-lead `family_member` secondaries here
    // (instead of trapping them in Additional, which the collapsed card does not show).
    if (def?.definitionKey === "parent_guardian") {
        const roleKeys = [...(authored.roleKeys ?? []), ...(defaults.roleKeys ?? [])];
        const seen = new Set<string>();
        const deduped = roleKeys.filter((key) => {
            const k = key.trim().toLowerCase();
            if (!k || seen.has(k)) return false;
            seen.add(k);
            return true;
        });
        return {
            ...authored,
            roleKeys: deduped,
            excludeRoleKeys: authored.excludeRoleKeys ?? defaults.excludeRoleKeys,
        };
    }

    return authored;
}

function roleMatchesCriteria(roleType: string | null, criteria: RelationshipCriteria): boolean {
    const role = normalizeRole(roleType);
    if (criteria.excludeRoleKeys?.some((key) => role.includes(key))) return false;
    if (criteria.roleKeys?.some((key) => role.includes(key))) return true;
    if (criteria.relationshipTypes?.some((key) => role === key)) return true;
    return false;
}

export function isHouseholdRelationshipSectionKey(groupKey: string): boolean {
    return Boolean(householdRelationshipSectionDefinitionForLegacyGroup(groupKey));
}

export function householdRelationshipSectionsFromConfig(
    config: NestedSurfaceConfig | null,
): IdentityRelationshipSectionConfig[] {
    if (!config) return [];
    const migrated = migrateHouseholdRelationshipSectionInstances(config);
    return listHouseholdRelationshipSectionInstances(migrated).map((instance) => ({
        ...instance,
        key: instance.instanceKey,
    }));
}

export function shouldShowRelationshipSection(args: {
    config: NestedSurfaceConfig | null;
    sectionKey: string;
    count: number;
    hasAddressLine?: boolean;
}): boolean {
    if (!args.config) return args.count > 0 || Boolean(args.hasAddressLine);
    const migrated = migrateHouseholdRelationshipSectionInstances(args.config);
    const group = groupForInstance(migrated, args.sectionKey)
        ?? migrated.groups.find((entry) => entry.key === args.sectionKey);
    if (!group || group.enabled === false) return false;
    const visibility = group.sectionVisibility ?? "when_nonempty";
    if (visibility === "hidden") return false;
    if (visibility === "always") return true;
    if (args.count > 0 || Boolean(args.hasAddressLine)) return true;
    // Operator-enabled optional sections stay visible when empty (Add CTAs / 0 counts).
    return (
        group.enabled === true
        && isOptionalNestedGroup(migrated.surfaceId, args.sectionKey)
    );
}

export function householdRelationshipSectionTitle(
    config: NestedSurfaceConfig | null,
    sectionKey: string,
    fallback: string,
): string {
    if (!config) return fallback;
    return nestedGroupLabel(config, sectionKey)?.trim() || fallback;
}

/** Assign a contact to the highest-priority matching enabled section instance. */
export function resolveHouseholdContactSectionKey(args: {
    config: NestedSurfaceConfig | null;
    roleType: string | null;
    isPrimary: boolean;
    assignedPersonIds: ReadonlySet<string>;
    personId: string;
}): string {
    if (args.isPrimary) {
        const primary = args.config
            ? migrateHouseholdRelationshipSectionInstances(args.config).groups.find(
                  (group) => group.definitionKey === "parent_primary" || group.key === "primary_contact",
              )
            : undefined;
        return primary?.instanceKey ?? primary?.key ?? "primary_contact";
    }
    if (args.assignedPersonIds.has(args.personId)) return "";
    if (!args.config) return "household_members";

    const migrated = migrateHouseholdRelationshipSectionInstances(args.config);
    const instances = listHouseholdRelationshipSectionInstances(migrated).filter(
        (instance) =>
            instance.definitionKey !== "parent_primary"
            && instance.definitionKey !== "children"
            && instance.enabled,
    );

    for (const instance of instances) {
        if (instance.definitionKey === "additional_contact") continue;
        const group = groupForInstance(migrated, instance.instanceKey);
        if (!group) continue;
        const criteria = criteriaForGroup(group);
        if (roleMatchesCriteria(args.roleType, criteria)) {
            return instance.instanceKey;
        }
    }

    const fallback = instances.find((instance) => instance.definitionKey === "additional_contact");
    return fallback?.instanceKey ?? "household_members";
}
