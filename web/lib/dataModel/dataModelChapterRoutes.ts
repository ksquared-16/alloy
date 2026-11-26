/**
 * Data Model routes.
 *
 * Canonical owner: `/organization/data-model?entity=<hubKey>&tab=<tabKey>` — the
 * operator picks an Entity and stays inside it. The legacy `?section=…`
 * vocabulary is retained only as an inbound compatibility surface: existing links
 * (settings redirects, configuration nav, domain landing tiles) keep resolving,
 * and `resolveDataModelEntityRoute` maps them onto the Entity workspace instead
 * of a category page.
 */

import {
    CANONICAL_ORGANIZATION_DATA_MODEL_HREF,
    CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF,
} from "@/lib/admin/canonicalAdminRoutes";

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
        label: "Operational Intelligence",
        description: "Redirects to the Organization Operational Intelligence product.",
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

/** Hub entity selected when an inbound link names no entity. */
export const DATA_MODEL_DEFAULT_ENTITY_HUB_KEY = "person";

/**
 * Legacy category → Entity workspace tab. Fields, Statuses, Option Sets, and
 * Relationships are no longer destinations of their own: they resolve inside the
 * selected Entity. Option Sets land on Fields because an option set is reached
 * through the option-backed field that consumes it.
 */
export const DATA_MODEL_SECTION_ENTITY_TAB: Readonly<
    Record<Exclude<DataModelWorkspaceSection, "calculations">, string>
> = {
    entities: "overview",
    fields: "fields",
    statuses: "status",
    "option-sets": "fields",
    relationships: "relationships",
};

export type DataModelEntityRoute =
    | { mode: "entity"; entity: string | undefined; tab: string | undefined; field: string | undefined }
    | { mode: "calculations" };

/**
 * Resolve inbound route params onto the Entity-centric workspace.
 *
 * `?tab=` always wins when present, so an Entity deep-link is never overridden by
 * a stale `?section=`. Operational Intelligence resolves as `mode: "calculations"`
 * for inbound compatibility; the Organization Data Model page redirects to the
 * canonical OI product.
 */
export function resolveDataModelEntityRoute(params: {
    section?: string | null;
    entity?: string | null;
    tab?: string | null;
    field?: string | null;
}): DataModelEntityRoute {
    const section = normalizeDataModelWorkspaceSection(params.section);
    if (section === "calculations") return { mode: "calculations" };

    const explicitTab = params.tab?.trim() || undefined;
    const mappedTab = section ? DATA_MODEL_SECTION_ENTITY_TAB[section] : undefined;
    return {
        mode: "entity",
        entity: params.entity?.trim() || undefined,
        tab: explicitTab ?? mappedTab,
        field: params.field?.trim() || undefined,
    };
}

/** Canonical Entity-centric deep-link — no `section` param. */
export function dataModelEntityHref(
    hubKey: string,
    options?: { tab?: string | null; field?: string | null },
): string {
    const params = new URLSearchParams();
    if (hubKey.trim()) params.set("entity", hubKey.trim());
    if (options?.tab?.trim()) params.set("tab", options.tab.trim());
    if (options?.field?.trim()) params.set("field", options.field.trim());
    const query = params.toString();
    return query
        ? `${CANONICAL_ORGANIZATION_DATA_MODEL_HREF}?${query}`
        : CANONICAL_ORGANIZATION_DATA_MODEL_HREF;
}

/**
 * Compatibility alias — legacy Data Model calculations deep links resolve to the
 * first-class Operational Intelligence Organization product.
 */
export const DATA_MODEL_CALCULATIONS_HREF = CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF;
