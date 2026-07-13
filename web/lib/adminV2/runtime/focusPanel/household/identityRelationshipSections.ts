/**
 * Configurable Household relationship sections — criteria, precedence, and deduplication.
 *
 * Builder configures label, relationshipCriteria, visibility, and order per section.
 * Runtime resolves each person once into the highest-priority matching section.
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

/** Contact-shaped relationship sections (not children/address/template). */
export const HOUSEHOLD_CONTACT_RELATIONSHIP_SECTION_KEYS = [
    "primary_contact",
    "other_parent_guardian",
    "household_members",
    "emergency_contacts",
    "authorized_pickups",
    "billing_contact",
] as const;

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

const DEFAULT_OTHER_PARENT_CRITERIA: IdentityRelationshipCriteria = {
    roleKeys: ["parent", "guardian", "primary_contact", "primary"],
};

const DEFAULT_HOUSEHOLD_MEMBERS_CRITERIA: IdentityRelationshipCriteria = {
    roleKeys: ["additional", "contact", "member", "relative", "grandparent"],
};

/** Role keys operators can assign in Builder criteria editor. */
export const HOUSEHOLD_RELATIONSHIP_ROLE_OPTIONS = [
    { key: "parent", label: "Parent" },
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

export function isHouseholdRelationshipSectionKey(groupKey: string): boolean {
    return (
        (HOUSEHOLD_CONTACT_RELATIONSHIP_SECTION_KEYS as readonly string[]).includes(groupKey)
        || groupKey === "children"
    );
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
            break;
    }
    if (group.key === "other_parent_guardian") return DEFAULT_OTHER_PARENT_CRITERIA;
    if (group.key === "household_members") return DEFAULT_HOUSEHOLD_MEMBERS_CRITERIA;
    return null;
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
            visibility: group.sectionVisibility ?? defaultSectionVisibility(key),
            presentationRef: key,
        }];
    }).sort((a, b) => a.order - b.order);
}

function defaultSectionVisibility(key: string): "always" | "when_nonempty" | "hidden" {
    if (key === "primary_contact" || key === "children") return "always";
    return "when_nonempty";
}

/** Whether a built section should render given configured visibility. */
export function shouldShowRelationshipSection(args: {
    config: NestedSurfaceConfig | null;
    sectionKey: string;
    count: number;
    hasAddressLine?: boolean;
}): boolean {
    if (!args.config) {
        return args.count > 0 || Boolean(args.hasAddressLine);
    }
    const group = args.config.groups.find((g) => g.key === args.sectionKey);
    if (group?.enabled === false) return false;
    const visibility = group?.sectionVisibility ?? defaultSectionVisibility(args.sectionKey);
    if (visibility === "hidden") return false;
    if (visibility === "always") return true;
    return args.count > 0 || Boolean(args.hasAddressLine);
}

/** Operator-facing section title from published config. */
export function householdRelationshipSectionTitle(
    config: NestedSurfaceConfig | null,
    sectionKey: string,
    fallback: string,
): string {
    if (!config) return fallback;
    return nestedGroupLabel(config, sectionKey)?.trim() || fallback;
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
        if (!group || group.enabled === false) continue;
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
