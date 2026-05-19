/**
 * Copy and helpers for Settings → Action buttons “create from existing action” flow.
 * Does not create new execution handlers — org placement rows only.
 */

export const ACTION_BUTTON_CREATE_TITLE = "Create button from existing action";

export const ACTION_BUTTON_CREATE_DESCRIPTION =
    "Adds an org-owned placement for an approved platform or organization action. Custom execution logic is configured in Automations — not here.";

export const ACTION_BUTTON_CREATE_DEFERRED_NOTE =
    "Arbitrary new action handlers require the Workflow/Automation builder (deferred). This form only places buttons for actions that already exist in the catalog.";

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

export function formatCatalogOptionLabel(def: ActionDefinitionCatalogEntry): string {
    const owner = actionDefinitionOwnership(def) === "platform" ? "Built-in" : "Your org";
    return `${def.label} (${def.key}) · ${owner}`;
}
