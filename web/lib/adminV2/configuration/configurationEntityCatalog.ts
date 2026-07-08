/**
 * Shared entity catalog for Configuration workspaces (Data Model rail + Entities page).
 */

import type { LucideIcon } from "lucide-react";
import { ADMIN_FIELD_ENTITY_TYPE_TO_LABELS_KEY } from "@/lib/admin/adminFieldEntityDisplayLabel";
import type { EntityLabelsMap } from "@/lib/admin/entityLabelDisplay";
import { adminFieldEntitySingularLabel, adminFieldEntityPluralLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import { CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES } from "@/lib/fields/childcareFieldCatalogDoctrine";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import { hubEntityApiTypes } from "@/lib/fields/fieldCatalogForSettings";
import {
    DATA_MODEL_ENTITY_ICONS,
    type DataModelUsageSurfaceId,
} from "@/lib/fields/dataModelWorkspaceIcons";
import {
    SETTINGS_ENTITY_FIELD_EXPLANATIONS,
    SETTINGS_ENTITY_SURFACES,
} from "@/lib/fields/computedFieldCatalog";

export type ConfigurationHubEntityDefinition = {
    hubKey: SettingsHubEntityKey;
    /** Plural key used by entity_labels API / industry defaults. */
    labelsKey: string;
    /** Canonical operator-facing singular label when org has no override. */
    canonicalSingularLabel: string;
    /** Canonical operator-facing plural label when org has no override. */
    canonicalPluralLabel: string;
    description: string;
    surfacesLine: string;
    icon: LucideIcon;
    primaryNavVisible: boolean;
    apiTypes: readonly string[];
};

const HUB_ENTITY_DEFINITIONS: readonly ConfigurationHubEntityDefinition[] = [
    {
        hubKey: "person",
        labelsKey: "persons",
        canonicalSingularLabel: "Person",
        canonicalPluralLabel: "People",
        description: SETTINGS_ENTITY_FIELD_EXPLANATIONS.person,
        surfacesLine: SETTINGS_ENTITY_SURFACES.person,
        icon: DATA_MODEL_ENTITY_ICONS.person,
        primaryNavVisible: true,
        apiTypes: hubEntityApiTypes("person"),
    },
    {
        hubKey: "customer",
        labelsKey: "customers",
        canonicalSingularLabel: "Family",
        canonicalPluralLabel: "Families",
        description: SETTINGS_ENTITY_FIELD_EXPLANATIONS.customer,
        surfacesLine: SETTINGS_ENTITY_SURFACES.customer,
        icon: DATA_MODEL_ENTITY_ICONS.customer,
        primaryNavVisible: true,
        apiTypes: hubEntityApiTypes("customer"),
    },
    {
        hubKey: "inquiry_child",
        labelsKey: "customer_members",
        canonicalSingularLabel: "Child",
        canonicalPluralLabel: "Children",
        description: SETTINGS_ENTITY_FIELD_EXPLANATIONS.inquiry_child,
        surfacesLine: SETTINGS_ENTITY_SURFACES.inquiry_child,
        icon: DATA_MODEL_ENTITY_ICONS.inquiry_child,
        primaryNavVisible: true,
        apiTypes: hubEntityApiTypes("inquiry_child"),
    },
    {
        hubKey: "opportunity",
        labelsKey: "opportunities",
        canonicalSingularLabel: "Lead / Enrollment",
        canonicalPluralLabel: "Leads / Enrollments",
        description: SETTINGS_ENTITY_FIELD_EXPLANATIONS.opportunity,
        surfacesLine: SETTINGS_ENTITY_SURFACES.opportunity,
        icon: DATA_MODEL_ENTITY_ICONS.opportunity,
        primaryNavVisible: true,
        apiTypes: hubEntityApiTypes("opportunity"),
    },
    {
        hubKey: "location",
        labelsKey: "locations",
        canonicalSingularLabel: "Location / Site",
        canonicalPluralLabel: "Locations / Sites",
        description: SETTINGS_ENTITY_FIELD_EXPLANATIONS.location,
        surfacesLine: SETTINGS_ENTITY_SURFACES.location,
        icon: DATA_MODEL_ENTITY_ICONS.location,
        primaryNavVisible: true,
        apiTypes: hubEntityApiTypes("location"),
    },
] as const;

const HUB_BY_KEY = new Map(HUB_ENTITY_DEFINITIONS.map((d) => [d.hubKey, d]));
const HUB_BY_LABELS_KEY = new Map(HUB_ENTITY_DEFINITIONS.map((d) => [d.labelsKey, d]));

export function configurationHubEntities(): readonly ConfigurationHubEntityDefinition[] {
    return HUB_ENTITY_DEFINITIONS;
}

export function configurationHubEntity(hubKey: SettingsHubEntityKey | string): ConfigurationHubEntityDefinition | undefined {
    return HUB_BY_KEY.get(hubKey as SettingsHubEntityKey);
}

export function configurationHubEntityForLabelsKey(labelsKey: string): ConfigurationHubEntityDefinition | undefined {
    return HUB_BY_LABELS_KEY.get(labelsKey.trim());
}

export function configurationPrimaryHubEntities(): readonly ConfigurationHubEntityDefinition[] {
    const primary = new Set(CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES);
    return HUB_ENTITY_DEFINITIONS.filter((d) => primary.has(d.hubKey));
}

/** Resolve operator singular label for Configuration workspaces (Data Model rail + Entities). */
export function resolveConfigurationEntitySingularLabel(
    labels: EntityLabelsMap,
    hubKey: SettingsHubEntityKey,
): string {
    const def = configurationHubEntity(hubKey);
    if (!def) return hubKey;
    if (hubKey === "opportunity" || hubKey === "location") return def.canonicalSingularLabel;
    return adminFieldEntitySingularLabel(labels, hubKey);
}

/** Resolve operator plural label for Configuration workspaces. */
export function resolveConfigurationEntityPluralLabel(
    labels: EntityLabelsMap,
    hubKey: SettingsHubEntityKey,
): string {
    const def = configurationHubEntity(hubKey);
    if (!def) return hubKey;
    if (hubKey === "opportunity" || hubKey === "location") return def.canonicalPluralLabel;
    return adminFieldEntityPluralLabel(labels, hubKey);
}

export function canonicalSingularLabel(hubKey: SettingsHubEntityKey): string {
    return configurationHubEntity(hubKey)?.canonicalSingularLabel ?? hubKey;
}

export function canonicalPluralLabel(hubKey: SettingsHubEntityKey): string {
    return configurationHubEntity(hubKey)?.canonicalPluralLabel ?? hubKey;
}

export function hubKeyForLabelsEntityType(entityType: string): SettingsHubEntityKey | null {
    const key = entityType.trim().toLowerCase();
    const fromHub = configurationHubEntityForLabelsKey(key);
    if (fromHub) return fromHub.hubKey;
    const inverted = Object.entries(ADMIN_FIELD_ENTITY_TYPE_TO_LABELS_KEY).find(([, v]) => v === key);
    return inverted ? (inverted[0] as SettingsHubEntityKey) : null;
}

export type ConfigurationEntityUsageSurface = DataModelUsageSurfaceId;
