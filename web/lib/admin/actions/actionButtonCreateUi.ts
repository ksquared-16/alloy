/**
 * Copy and helpers for Settings → Action buttons “create from existing action” flow.
 * Does not create new execution handlers — org placement rows only.
 */

import {
    filterSettingsActionCatalogDefinitions as filterCatalogFromRegistry,
    formatSettingsCatalogOptionLabel,
} from "@/lib/admin/actions/actionDefinitionRegistry";

export const ACTION_BUTTON_CREATE_TITLE = "Add action button";

export const ACTION_BUTTON_CREATE_DESCRIPTION =
    "Choose what the button does and where it appears. This does not change Automations — only where an existing action shows up.";

export const ACTION_BUTTON_CREATE_DEFERRED_NOTE =
    "New automation types are added in Automations. Here you only place buttons for actions that already work in Alloy.";

/** Record types operators may scope when creating a placement. */
export const ACTION_PLACEMENT_ENTITY_TYPES = [
    "opportunity",
    "job",
    "schedule",
    "customer",
    "person",
    "vendor",
    "location",
] as const;

export type ActionDefinitionCatalogEntry = {
    id: string;
    key: string;
    label: string;
    action_type: string;
    entity_type: string | null;
    org_id: string | null;
};

export function actionDefinitionOwnership(def: Pick<ActionDefinitionCatalogEntry, "org_id">): "platform" | "org" {
    return def.org_id ? "org" : "platform";
}

export function filterCatalogDefinitionsForEntity(
    definitions: ActionDefinitionCatalogEntry[],
    entityType: string
): ActionDefinitionCatalogEntry[] {
    const et = entityType.trim().toLowerCase();
    if (!et) return definitions;
    return definitions.filter((d) => !d.entity_type || d.entity_type.toLowerCase() === et);
}

/** Hide internal placeholder keys from Settings action-button create dropdown. */
export function filterSettingsActionCatalogDefinitions(
    definitions: ActionDefinitionCatalogEntry[]
): ActionDefinitionCatalogEntry[] {
    return filterCatalogFromRegistry(definitions) as ActionDefinitionCatalogEntry[];
}

export function settingsActionCatalogDefinitions(
    definitions: ActionDefinitionCatalogEntry[],
    entityType: string
): ActionDefinitionCatalogEntry[] {
    return filterSettingsActionCatalogDefinitions(filterCatalogDefinitionsForEntity(definitions, entityType));
}

export function formatCatalogOptionLabel(def: ActionDefinitionCatalogEntry): string {
    return formatSettingsCatalogOptionLabel(def);
}
