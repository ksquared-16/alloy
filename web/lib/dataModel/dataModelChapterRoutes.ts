/**
 * Data Model workspace categories — Category → Collection → Selected → Focused workspace.
 *
 * Canonical owner: `/organization/data-model?section=…`
 * Legacy `/settings/entities|fields|statuses|option-sets|relationships|calculations`
 * redirect into this shell.
 */

import { CANONICAL_ORGANIZATION_DATA_MODEL_HREF } from "@/lib/admin/canonicalAdminRoutes";

export const DATA_MODEL_WORKSPACE_SECTIONS = [
    "entities",
    "fields",
    "statuses",
    "option-sets",
    "relationships",
    "calculations",
] as const;

export type DataModelWorkspaceSection = (typeof DATA_MODEL_WORKSPACE_SECTIONS)[number];

export const DATA_MODEL_DEFAULT_SECTION: DataModelWorkspaceSection = "entities";

export const DATA_MODEL_WORKSPACE_SECTION_META: Record<
    DataModelWorkspaceSection,
    { label: string; description: string }
> = {
    entities: {
        label: "Entities",
        description: "Record types and vocabulary Alloy uses across experiences.",
    },
    fields: {
        label: "Fields",
        description: "Information Alloy collects and displays on each Entity.",
    },
    statuses: {
        label: "Statuses",
        description: "Durable state definitions owned by explicit subject domains.",
    },
    "option-sets": {
        label: "Option Sets",
        description: "Reusable vocabularies consumed by fields and configuration.",
    },
    relationships: {
        label: "Relationships",
        description: "Canonical edges between Entities and relationship-role vocabulary.",
    },
    calculations: {
        label: "Operational Calculations",
        description: "Configured derived values and metrics (deep product in next sprint).",
    },
};

const SECTION_ALIASES: Record<string, DataModelWorkspaceSection> = {
    entities: "entities",
    entity: "entities",
    labels: "entities",
    "entity-labels": "entities",
    fields: "fields",
    field: "fields",
    statuses: "statuses",
    status: "statuses",
    "option-sets": "option-sets",
    "option-set": "option-sets",
    options: "option-sets",
    relationships: "relationships",
    relationship: "relationships",
    calculations: "calculations",
    calculation: "calculations",
    analytics: "calculations",
    metrics: "calculations",
};

export function normalizeDataModelWorkspaceSection(
    value: string | null | undefined,
): DataModelWorkspaceSection | null {
    const raw = value?.trim().toLowerCase() ?? "";
    if (!raw) return null;
    return SECTION_ALIASES[raw] ?? null;
}

export function dataModelSectionHref(
    section: DataModelWorkspaceSection | null | undefined,
    options?: { entity?: string | null; tab?: string | null; setKey?: string | null },
): string {
    const params = new URLSearchParams();
    const resolved = section ?? DATA_MODEL_DEFAULT_SECTION;
    params.set("section", resolved);
    if (options?.entity?.trim()) params.set("entity", options.entity.trim());
    if (options?.tab?.trim()) params.set("tab", options.tab.trim());
    if (options?.setKey?.trim()) params.set("setKey", options.setKey.trim());
    const query = params.toString();
    return query
        ? `${CANONICAL_ORGANIZATION_DATA_MODEL_HREF}?${query}`
        : CANONICAL_ORGANIZATION_DATA_MODEL_HREF;
}
