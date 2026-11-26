/**
 * Data Model → Entity workspace view models.
 *
 * Entity-centric redesign: Data Model has no category rail. The operator picks an
 * Entity and everything about that Entity — vocabulary, fields, relationships,
 * statuses, usage, history — resolves inside the selected Entity workspace. This
 * module owns the ONE resolver that turns entity-labels effective labels, custom
 * `field_definitions`, org category registry rows, effective `status_definitions`,
 * and the static platform/relationship/usage catalogs into VMs. The collection
 * row, the selected-entity header, and the Overview tab all read the same
 * `EntityStructureCountsVm`, so counts can never drift between surfaces.
 *
 * Authorities consumed here (no invented metadata):
 * - `configurationEntityCatalog.ts` — hub entity identity, description, surfaces line.
 * - `fieldCatalogForSettings.ts` — platform + custom + computed field catalog and edit capability.
 * - `configurationCategoryCatalog.ts` — entity-owned category seeds + org registry labels/order.
 * - `entityRelationshipCatalog.ts` — platform relationship edges + usage-surface + builder catalogs.
 *   Organization relationship *vocabulary* (family roles / person connection types) is a
 *   separate VM slice fetched from the role-type APIs, so `relationshipsTotal` keeps
 *   meaning exactly one thing: the number of platform edges on the entity.
 * - `fieldLifecycleModel.ts` — the active/hidden/archived truth behind the Inactive filter.
 * - `statusCategoryRegistry.ts` (via `dataModelEntityStatusDomain.ts`) — status domain ownership.
 * - `dataModelWorkspaceModel.ts` — usage-surface count hints (Fields workspace parity).
 * - `entity-labels` API / `resolveEntityLabelsForOrg` — vocabulary.
 */

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import {
    configurationPrimaryHubEntities,
    resolveConfigurationEntityPluralLabel,
    resolveConfigurationEntitySingularLabel,
    type ConfigurationHubEntityDefinition,
} from "@/lib/adminV2/configuration/configurationEntityCatalog";
import {
    entityCategorySeeds,
    orderedEntityCategoryKeys,
    resolveConfigurationCategoryLabel,
} from "@/lib/adminV2/configuration/configurationCategoryCatalog";
import type { EntityLabelsMap } from "@/lib/admin/entityLabelDisplay";
import type { FieldSectionRegistryRow } from "@/lib/admin/fieldSectionSelectOptions";
import { getOptionSetKeyFromConfig } from "@/lib/admin/fieldDefinitionOptionSetConfig";
import { statusDomainForHubEntity } from "@/lib/dataModel/dataModelEntityStatusDomain";
import { readFieldLifecycleState } from "@/lib/fields/fieldLifecycleModel";
import { usageSurfaceCountHint } from "@/lib/fields/dataModelWorkspaceModel";
import {
    DATA_MODEL_BUILDER_AVAILABILITY,
    DATA_MODEL_USAGE_SURFACES,
    relationshipsForHubEntity,
    type EntityRelationshipDefinition,
} from "@/lib/fields/entityRelationshipCatalog";
import {
    buildSettingsFieldCatalogEntries,
    catalogEntrySectionKey,
    countFieldsByOwnership,
    fieldRowEditCapability,
    hubEntityApiTypes,
    type FieldEditMode,
    type SettingsFieldCatalogEntry,
    type SettingsHubEntityKey,
} from "@/lib/fields/fieldCatalogForSettings";

export type EntityFieldOwnershipCountsVm = {
    platform: number;
    custom: number;
    computed: number;
    total: number;
    /**
     * Cross-cutting count of fields the organization has switched off. Deliberately
     * NOT part of the platform/custom/computed partition — those three still sum to
     * `total`, so no surface can drift by reading `inactive` as a fourth bucket.
     */
    inactive: number;
};

export type EntityStructureCountsVm = {
    fields: EntityFieldOwnershipCountsVm;
    relationshipsTotal: number;
};

/**
 * Where a relationship row comes from, which decides whether Definition is
 * editable. Platform edges are compiled catalog truth; organization vocabulary
 * rows are real tenant rows behind the role-type APIs.
 */
export type EntityRelationshipSource = "platform_edge" | "organization_vocabulary";

/** Which role-type API owns an organization relationship vocabulary row. */
export type EntityRelationshipVocabularyKind = "family_role" | "person_relationship";

export type EntityRelationshipSummaryVm = {
    id: string;
    label: string;
    /** Operator plural label when vocabulary presentation provides one. */
    pluralLabel: string | null;
    connectionLabel: string;
    meaning: string;
    targetLabel: string;
    cardinality: string;
    required: boolean;
    roleNote: string | null;
    kind: "platform" | "custom";
    whereUsed: readonly string[];
    source: EntityRelationshipSource;
    /** Set only for organization vocabulary rows — selects the mutation endpoint. */
    vocabularyKind: EntityRelationshipVocabularyKind | null;
    /** `customer_person_role_types.id` / `person_relationship_types.id` when tenant-owned. */
    vocabularyRowId: string | null;
    description: string | null;
    isActive: boolean;
};

export type EntityVocabularyVm = {
    labelsKey: string;
    singular: string;
    plural: string;
    defaultSingular: string;
    defaultPlural: string;
    isOverridden: boolean;
};

export type EntityUsageSurfaceVm = {
    id: string;
    label: string;
    description: string;
    hint: string | null;
};

export type EntityBuilderAvailabilityVm = {
    id: string;
    label: string;
    available: boolean;
    reason?: string;
};

export type EntityFieldVisibilityVm = {
    form: boolean;
    drawer: boolean;
    table: boolean;
    filterable: boolean;
    sortable: boolean;
};

export type EntityFieldSummaryVm = {
    refKey: string;
    label: string;
    ownership: "platform" | "custom" | "computed";
    /** Business category (persisted `section_key`) this field is organized under. */
    categoryKey: string;
    categoryLabel: string;
    fieldType: string;
    entityType: string;
    description: string | null;
    helpText: string | null;
    /** Where the value physically lives (platform column, tenant registry, derivation). */
    storageLine: string | null;
    required: boolean;
    /** Option set backing a select-like field, when configured. */
    optionSetKey: string | null;
    /** `field_definitions.id` — present only when a persisted row backs this field. */
    fieldDefinitionId: string | null;
    isSystem: boolean;
    /**
     * Maximum edit surface for this field if the operator has mutate permission.
     * `view` = protected (platform catalog / computed), `presentation` = safe
     * organization only, `full` = tenant custom field.
     */
    editMode: FieldEditMode;
    visibility: EntityFieldVisibilityVm | null;
    /** False when the organization has switched a configured field off. */
    isActive: boolean;
};

export type EntityFieldCategoryVm = {
    key: string;
    label: string;
    fieldCount: number;
    /** `field_section_definitions.id` — present only when an org row already owns this category. */
    registryId: string | null;
    description: string | null;
    sortOrder: number;
    /** True when a platform seed supplies this category for the entity. */
    isPlatformSeed: boolean;
};

export type EntityOptionSetValueVm = {
    /** `option_set_items.id` — required to edit the value in place. */
    id: string;
    key: string;
    label: string;
    sortOrder: number;
};

export type EntityOptionSetVm = {
    setKey: string;
    label: string;
    itemCount: number;
    values: EntityOptionSetValueVm[];
    /** Fields on this entity that read from the option set. */
    usedByFieldRefKeys: string[];
    /** False when the key is referenced by a field config but no option set row exists. */
    resolved: boolean;
};

export type EntityStatusValueVm = {
    id: string;
    statusKey: string;
    label: string;
    sortOrder: number;
    isActive: boolean;
    isSystem: boolean;
    /** `organization` when an org row owns it; `industry_default` when inherited. */
    scope: "organization" | "industry_default";
};

export type EntityStatusDomainVm = {
    statusEntityType: string;
    label: string;
    authoritativeTable: string;
    authoritativeColumn: string;
    usageSummary: string;
    processLinked: boolean;
    statuses: EntityStatusValueVm[];
};

export type EntityCollectionRowVm = {
    hubKey: SettingsHubEntityKey;
    displayName: string;
    pluralDisplayName: string;
    description: string;
    fieldsTotal: number;
    relationshipsTotal: number;
    isVocabularyOverridden: boolean;
};

export type EntityWorkspaceVm = {
    hubKey: SettingsHubEntityKey;
    labelsKey: string;
    displayName: string;
    pluralDisplayName: string;
    description: string;
    surfacesLine: string;
    vocabulary: EntityVocabularyVm;
    structure: EntityStructureCountsVm;
    fields: EntityFieldSummaryVm[];
    fieldCategories: EntityFieldCategoryVm[];
    optionSets: EntityOptionSetVm[];
    /** Platform edges only — the same set `structure.relationshipsTotal` counts. */
    relationships: EntityRelationshipSummaryVm[];
    /**
     * Organization-owned relationship vocabulary (family roles / person connection
     * types), loaded client-side from the role-type APIs. Empty until fetched.
     */
    relationshipVocabulary: EntityRelationshipSummaryVm[];
    statusDomain: EntityStatusDomainVm | null;
    usageSurfaces: EntityUsageSurfaceVm[];
    builderAvailability: EntityBuilderAvailabilityVm[];
};

export type DataModelEntitiesCollectionVm = {
    rows: EntityCollectionRowVm[];
    totalEntities: number;
    totalFields: number;
    totalRelationships: number;
};

export type DataModelEntitiesWorkspaceVm = {
    collection: DataModelEntitiesCollectionVm;
    entitiesByHubKey: Record<string, EntityWorkspaceVm>;
    defaultHubKey: SettingsHubEntityKey;
};

/** Raw effective `status_definitions` row shape consumed by the VM builder. */
export type EntityStatusDefinitionInput = {
    id: string;
    org_id: string | null;
    entity_type: string;
    status_key: string;
    status_label: string | null;
    sort_order: number;
    is_active: boolean;
    is_system: boolean;
};

/** Raw `option_sets` + items shape consumed by the VM builder. */
export type EntityOptionSetInput = {
    setKey: string;
    label: string;
    values: readonly EntityOptionSetValueVm[];
};

/**
 * THE single field-catalog resolver — every count and every field list must derive from this.
 *
 * Hidden (organization-deactivated) fields are included so the Fields tab can
 * offer a real Inactive filter instead of pretending switched-off fields do not
 * exist. Archived fields stay excluded: archival is a stronger retirement state
 * than "inactive" and is not an Entity-workspace concern.
 */
export function resolveEntityFieldCatalog(
    hubEntity: SettingsHubEntityKey,
    customFieldsForEntity: readonly FieldDef[],
): SettingsFieldCatalogEntry[] {
    return buildSettingsFieldCatalogEntries({
        hubEntity,
        entityTypes: hubEntityApiTypes(hubEntity),
        customFields: customFieldsForEntity,
        includeHiddenCustom: true,
    });
}

/** Inactive == the catalog's own lifecycle truth, never a re-derived guess. */
function isCatalogEntryActive(entry: SettingsFieldCatalogEntry): boolean {
    return readFieldLifecycleState(entry.fieldDef) === "active";
}

/**
 * THE unified count resolver. Every surface (collection row, selected header,
 * Overview) must derive field/relationship counts by calling this — never by
 * re-deriving from a partial or ad hoc catalog slice.
 */
export function resolveEntityStructureCounts(
    hubEntity: SettingsHubEntityKey,
    customFieldsForEntity: readonly FieldDef[],
): EntityStructureCountsVm {
    const catalogEntries = resolveEntityFieldCatalog(hubEntity, customFieldsForEntity);
    const counts = countFieldsByOwnership(catalogEntries);
    const relationships = relationshipsForHubEntity(hubEntity);
    return {
        fields: {
            platform: counts.platform,
            custom: counts.custom,
            computed: counts.computed,
            total: counts.total,
            inactive: catalogEntries.filter((entry) => !isCatalogEntryActive(entry)).length,
        },
        relationshipsTotal: relationships.length,
    };
}

function toRelationshipSummary(rel: EntityRelationshipDefinition): EntityRelationshipSummaryVm {
    return {
        id: rel.id,
        label: rel.label,
        pluralLabel: null,
        connectionLabel: rel.connection_label,
        meaning: rel.meaning,
        targetLabel: rel.target_label,
        cardinality: rel.cardinality,
        required: rel.required,
        roleNote: rel.role_note ?? null,
        kind: rel.kind,
        whereUsed: rel.where_used,
        source: "platform_edge",
        vocabularyKind: null,
        vocabularyRowId: null,
        description: null,
        isActive: true,
    };
}

function optionSetKeyForEntry(entry: SettingsFieldCatalogEntry): string | null {
    const key = getOptionSetKeyFromConfig(entry.fieldDef?.config);
    return key || null;
}

function toFieldSummary(
    entry: SettingsFieldCatalogEntry,
    hubKey: SettingsHubEntityKey,
    categoryLabels: Map<string, string>,
    registry: readonly FieldSectionRegistryRow[],
): EntityFieldSummaryVm {
    const categoryKey = catalogEntrySectionKey(entry);
    const def = entry.fieldDef;
    return {
        refKey: entry.refKey,
        label: entry.label,
        ownership: entry.ownership,
        categoryKey,
        categoryLabel:
            categoryLabels.get(categoryKey) ??
            resolveConfigurationCategoryLabel(categoryKey, registry, hubKey),
        fieldType: entry.field_type,
        entityType: entry.entity_type,
        description: entry.description ?? def?.description ?? null,
        helpText: def?.help_text ?? null,
        storageLine: entry.storage_line ?? null,
        required: def?.is_required === true,
        optionSetKey: optionSetKeyForEntry(entry),
        fieldDefinitionId: def?.id ?? null,
        isSystem: def?.is_system === true,
        // Permission is applied at render time; the VM records the maximum surface.
        editMode: fieldRowEditCapability(entry, true).mode,
        isActive: isCatalogEntryActive(entry),
        visibility:
            def ?
                {
                    form: def.is_visible_in_form !== false,
                    drawer: def.is_visible_in_drawer !== false,
                    table: def.is_visible_in_table !== false,
                    filterable: def.is_filterable === true,
                    sortable: def.is_sortable === true,
                }
            :   null,
    };
}

/**
 * Category list for an entity's Fields tab: org `field_section_definitions` rows
 * (active), entity-owned platform seeds, and any category key actually in use on
 * a field. Counts are the real number of fields resolved into each category.
 */
export function buildEntityFieldCategories(
    hubKey: SettingsHubEntityKey,
    fields: readonly EntityFieldSummaryVm[],
    registry: readonly FieldSectionRegistryRow[] = [],
): EntityFieldCategoryVm[] {
    const counts = new Map<string, number>();
    for (const field of fields) {
        counts.set(field.categoryKey, (counts.get(field.categoryKey) ?? 0) + 1);
    }

    const keys = new Set<string>(counts.keys());
    const seeds = new Map(entityCategorySeeds(hubKey).map((seed) => [seed.key, seed] as const));
    for (const seed of seeds.values()) keys.add(seed.key);

    const registryByKey = new Map<string, FieldSectionRegistryRow>();
    for (const row of registry) {
        const key = row.section_key.trim();
        if (!key) continue;
        registryByKey.set(key, row);
        if (row.is_archived !== true) keys.add(key);
    }

    const labelByField = new Map(fields.map((field) => [field.categoryKey, field.categoryLabel] as const));
    return orderedEntityCategoryKeys(hubKey, keys, registry).map((key) => {
        const row = registryByKey.get(key);
        return {
            key,
            label: labelByField.get(key) ?? resolveConfigurationCategoryLabel(key, registry, hubKey),
            fieldCount: counts.get(key) ?? 0,
            registryId: row?.id ?? null,
            description: row?.description ?? null,
            sortOrder: row?.sort_order ?? seeds.get(key)?.sort_order ?? 999,
            isPlatformSeed: seeds.has(key),
        };
    });
}

/** Show All grouping — ordered categories, each with its fields (empty categories dropped). */
export function groupFieldsByCategory(
    fields: readonly EntityFieldSummaryVm[],
    categories: readonly EntityFieldCategoryVm[],
): { category: EntityFieldCategoryVm; fields: EntityFieldSummaryVm[] }[] {
    const byKey = new Map<string, EntityFieldSummaryVm[]>();
    for (const field of fields) {
        const list = byKey.get(field.categoryKey) ?? [];
        list.push(field);
        byKey.set(field.categoryKey, list);
    }
    const ordered = categories
        .map((category) => ({ category, fields: byKey.get(category.key) ?? [] }))
        .filter((group) => group.fields.length > 0);

    // Any field whose category is missing from the category list still has to appear.
    const covered = new Set(ordered.map((group) => group.category.key));
    for (const [key, list] of byKey) {
        if (covered.has(key)) continue;
        ordered.push({
            category: {
                key,
                label: list[0]?.categoryLabel ?? key,
                fieldCount: list.length,
                registryId: null,
                description: null,
                sortOrder: 999,
                isPlatformSeed: false,
            },
            fields: list,
        });
    }
    return ordered;
}

function buildEntityOptionSets(
    fields: readonly EntityFieldSummaryVm[],
    optionSetsByKey: ReadonlyMap<string, EntityOptionSetInput>,
): EntityOptionSetVm[] {
    const usedBy = new Map<string, string[]>();
    for (const field of fields) {
        if (!field.optionSetKey) continue;
        const list = usedBy.get(field.optionSetKey) ?? [];
        list.push(field.refKey);
        usedBy.set(field.optionSetKey, list);
    }
    return [...usedBy.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([setKey, refKeys]) => {
            const source = optionSetsByKey.get(setKey);
            return {
                setKey,
                label: source?.label ?? setKey,
                itemCount: source?.values.length ?? 0,
                values: source ? [...source.values] : [],
                usedByFieldRefKeys: refKeys,
                resolved: source != null,
            };
        });
}

function buildStatusDomainVm(
    hubKey: SettingsHubEntityKey,
    statusDefinitionsByEntityType: ReadonlyMap<string, readonly EntityStatusDefinitionInput[]>,
): EntityStatusDomainVm | null {
    const domain = statusDomainForHubEntity(hubKey);
    if (!domain) return null;
    const rows = statusDefinitionsByEntityType.get(domain.statusEntityType) ?? [];
    const statuses: EntityStatusValueVm[] = rows
        .map((row) => ({
            id: row.id,
            statusKey: row.status_key,
            label:
                (row.status_label && row.status_label.trim()) ||
                row.status_key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            sortOrder: Number(row.sort_order) || 0,
            isActive: row.is_active !== false,
            isSystem: row.is_system === true,
            scope: row.org_id ? ("organization" as const) : ("industry_default" as const),
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

    return {
        statusEntityType: domain.statusEntityType,
        label: domain.label,
        authoritativeTable: domain.authoritativeTable,
        authoritativeColumn: domain.authoritativeColumn,
        usageSummary: domain.usageSummary,
        processLinked: domain.processLinked,
        statuses,
    };
}

export function buildEntityWorkspaceVm(params: {
    entity: ConfigurationHubEntityDefinition;
    labels: EntityLabelsMap;
    defaultsByType: Map<string, { singular: string | null; plural: string | null }>;
    customFieldsForEntity: readonly FieldDef[];
    categoryRegistry?: readonly FieldSectionRegistryRow[];
    statusDefinitionsByEntityType?: ReadonlyMap<string, readonly EntityStatusDefinitionInput[]>;
    optionSetsByKey?: ReadonlyMap<string, EntityOptionSetInput>;
}): EntityWorkspaceVm {
    const { entity, labels, defaultsByType, customFieldsForEntity } = params;
    const registry = params.categoryRegistry ?? [];
    const singular = resolveConfigurationEntitySingularLabel(labels, entity.hubKey);
    const plural = resolveConfigurationEntityPluralLabel(labels, entity.hubKey);
    const defaults = defaultsByType.get(entity.labelsKey);
    const defaultSingular = defaults?.singular?.trim() || entity.canonicalSingularLabel;
    const defaultPlural = defaults?.plural?.trim() || entity.canonicalPluralLabel;
    const catalogEntries = resolveEntityFieldCatalog(entity.hubKey, customFieldsForEntity);
    const counts = countFieldsByOwnership(catalogEntries);
    const relationshipDefs = relationshipsForHubEntity(entity.hubKey);
    const structure: EntityStructureCountsVm = {
        fields: {
            platform: counts.platform,
            custom: counts.custom,
            computed: counts.computed,
            total: counts.total,
            inactive: catalogEntries.filter((catalogEntry) => !isCatalogEntryActive(catalogEntry)).length,
        },
        relationshipsTotal: relationshipDefs.length,
    };

    const categoryLabels = new Map<string, string>();
    for (const row of registry) {
        const key = row.section_key.trim();
        if (key && row.label.trim()) categoryLabels.set(key, row.label.trim());
    }
    const fields: EntityFieldSummaryVm[] = catalogEntries.map((entry) =>
        toFieldSummary(entry, entity.hubKey, categoryLabels, registry),
    );

    return {
        hubKey: entity.hubKey,
        labelsKey: entity.labelsKey,
        displayName: singular,
        pluralDisplayName: plural,
        description: entity.description,
        surfacesLine: entity.surfacesLine,
        vocabulary: {
            labelsKey: entity.labelsKey,
            singular,
            plural,
            defaultSingular,
            defaultPlural,
            isOverridden: singular !== defaultSingular || plural !== defaultPlural,
        },
        structure,
        fields,
        fieldCategories: buildEntityFieldCategories(entity.hubKey, fields, registry),
        optionSets: buildEntityOptionSets(fields, params.optionSetsByKey ?? new Map()),
        relationships: relationshipDefs.map(toRelationshipSummary),
        relationshipVocabulary: [],
        statusDomain: buildStatusDomainVm(entity.hubKey, params.statusDefinitionsByEntityType ?? new Map()),
        usageSurfaces: DATA_MODEL_USAGE_SURFACES.map((surface) => ({
            id: surface.id,
            label: surface.label,
            description: surface.description,
            hint: usageSurfaceCountHint(surface.id, entity.hubKey),
        })),
        builderAvailability: DATA_MODEL_BUILDER_AVAILABILITY.map((builder) => ({
            id: builder.id,
            label: builder.label,
            available: builder.available,
            reason: "reason" in builder ? builder.reason : undefined,
        })),
    };
}

export function buildEntitiesCollectionVm(entities: readonly EntityWorkspaceVm[]): DataModelEntitiesCollectionVm {
    const rows: EntityCollectionRowVm[] = entities.map((entity) => ({
        hubKey: entity.hubKey,
        displayName: entity.displayName,
        pluralDisplayName: entity.pluralDisplayName,
        description: entity.description,
        fieldsTotal: entity.structure.fields.total,
        relationshipsTotal: entity.structure.relationshipsTotal,
        isVocabularyOverridden: entity.vocabulary.isOverridden,
    }));
    return {
        rows,
        totalEntities: rows.length,
        totalFields: rows.reduce((sum, row) => sum + row.fieldsTotal, 0),
        totalRelationships: rows.reduce((sum, row) => sum + row.relationshipsTotal, 0),
    };
}

export function buildDataModelEntitiesWorkspaceVm(params: {
    entities?: readonly ConfigurationHubEntityDefinition[];
    labels: EntityLabelsMap;
    defaultsByType: Map<string, { singular: string | null; plural: string | null }>;
    customFieldsByEntityType: Map<string, FieldDef[]>;
    /** Org `field_section_definitions` rows keyed by `field_definitions.entity_type`. */
    categoryRegistryByEntityType?: ReadonlyMap<string, readonly FieldSectionRegistryRow[]>;
    /** Effective `status_definitions` rows keyed by `status_definitions.entity_type`. */
    statusDefinitionsByEntityType?: ReadonlyMap<string, readonly EntityStatusDefinitionInput[]>;
    /** Org option sets keyed by `set_key`. */
    optionSetsByKey?: ReadonlyMap<string, EntityOptionSetInput>;
    defaultHubKey?: SettingsHubEntityKey;
}): DataModelEntitiesWorkspaceVm {
    const entities = params.entities ?? configurationPrimaryHubEntities();
    const built = entities.map((entity) => {
        const apiTypes = hubEntityApiTypes(entity.hubKey);
        const customFieldsForEntity = apiTypes.flatMap((type) => params.customFieldsByEntityType.get(type) ?? []);
        const categoryRegistry = apiTypes.flatMap(
            (type) => params.categoryRegistryByEntityType?.get(type) ?? [],
        );
        return buildEntityWorkspaceVm({
            entity,
            labels: params.labels,
            defaultsByType: params.defaultsByType,
            customFieldsForEntity,
            categoryRegistry,
            statusDefinitionsByEntityType: params.statusDefinitionsByEntityType,
            optionSetsByKey: params.optionSetsByKey,
        });
    });
    const entitiesByHubKey: Record<string, EntityWorkspaceVm> = {};
    for (const entityVm of built) entitiesByHubKey[entityVm.hubKey] = entityVm;
    return {
        collection: buildEntitiesCollectionVm(built),
        entitiesByHubKey,
        defaultHubKey: params.defaultHubKey ?? built[0]?.hubKey ?? "person",
    };
}

export function parseEntitySelection(
    raw: string | null | undefined,
    vm: DataModelEntitiesWorkspaceVm,
): SettingsHubEntityKey {
    const key = raw?.trim().toLowerCase();
    if (key && vm.entitiesByHubKey[key]) return key as SettingsHubEntityKey;
    return vm.defaultHubKey;
}

export const ENTITY_WORKSPACE_TABS = [
    { key: "overview", label: "Overview" },
    { key: "vocabulary", label: "Vocabulary" },
    { key: "fields", label: "Fields" },
    { key: "relationships", label: "Relationships" },
    { key: "status", label: "Status" },
    { key: "history", label: "History" },
] as const;

export type EntityWorkspaceTabKey = (typeof ENTITY_WORKSPACE_TABS)[number]["key"];

export function parseEntityWorkspaceTab(raw: string | null | undefined): EntityWorkspaceTabKey {
    const key = raw?.trim().toLowerCase();
    if (key === "usage") return "overview";
    return ENTITY_WORKSPACE_TABS.some((tab) => tab.key === key) ? (key as EntityWorkspaceTabKey) : "overview";
}

/** Selected-field workspace tabs inside Entity → Fields. Lands on Definition. */
export const ENTITY_FIELD_DETAIL_TABS = [
    { key: "definition", label: "Definition" },
    { key: "usage", label: "Usage" },
    { key: "history", label: "History" },
] as const;

export type EntityFieldDetailTabKey = (typeof ENTITY_FIELD_DETAIL_TABS)[number]["key"];

/** Selected-object tabs for Relationships and Status. Lands on Definition. */
export const ENTITY_CHILD_DETAIL_TABS = [
    { key: "definition", label: "Definition" },
    { key: "usage", label: "Usage" },
    { key: "history", label: "History" },
] as const;

export type EntityChildDetailTabKey = (typeof ENTITY_CHILD_DETAIL_TABS)[number]["key"];

export const SHOW_ALL_CATEGORY_KEY = "__all__";

/**
 * Ownership / lifecycle filter for the Fields tab. Every option maps onto truth
 * already present on `EntityFieldSummaryVm` — nothing here is inferred.
 * `organization` is the operator name for tenant-configured (`custom`) fields.
 */
export const ENTITY_FIELD_OWNERSHIP_FILTERS = [
    { key: "all", label: "All" },
    { key: "platform", label: "Platform" },
    { key: "organization", label: "Organization" },
    { key: "computed", label: "Computed" },
    { key: "inactive", label: "Inactive" },
] as const;

export type EntityFieldOwnershipFilterKey = (typeof ENTITY_FIELD_OWNERSHIP_FILTERS)[number]["key"];

export function matchesEntityFieldOwnershipFilter(
    field: Pick<EntityFieldSummaryVm, "ownership" | "isActive">,
    filter: EntityFieldOwnershipFilterKey,
): boolean {
    switch (filter) {
        case "all":
            return true;
        case "platform":
            return field.ownership === "platform";
        case "organization":
            return field.ownership === "custom";
        case "computed":
            return field.ownership === "computed";
        case "inactive":
            return !field.isActive;
    }
}

export function entityFieldOwnershipFilterCount(
    fields: readonly Pick<EntityFieldSummaryVm, "ownership" | "isActive">[],
    filter: EntityFieldOwnershipFilterKey,
): number {
    return fields.filter((field) => matchesEntityFieldOwnershipFilter(field, filter)).length;
}

/**
 * `field_definitions.entity_type` / `field_section_definitions.entity_type` that
 * owns new rows for a hub entity. Child records write to `customer_member`; every
 * other hub entity uses its own key.
 */
export function entityDefinitionApiType(hubKey: SettingsHubEntityKey | string): string {
    return hubKey === "inquiry_child" ? "customer_member" : String(hubKey);
}

/** Resolve a `?field=` param (or stale local selection) against the entity's real field list. */
export function parseFieldSelection(
    raw: string | null | undefined,
    entity: Pick<EntityWorkspaceVm, "fields">,
): string | null {
    const key = raw?.trim();
    if (!key) return null;
    return entity.fields.some((field) => field.refKey === key) ? key : null;
}

/**
 * Live vocabulary overlay — applied client-side after a label save or reset so the
 * header, collection row, and Overview stay in sync without waiting on a full
 * server VM re-compose. Structure counts (fields/relationships) are untouched;
 * they do not change when vocabulary changes.
 */
export function withVocabularyOverride(
    entity: EntityWorkspaceVm,
    vocabulary: Pick<EntityVocabularyVm, "singular" | "plural" | "defaultSingular" | "defaultPlural">,
): EntityWorkspaceVm {
    const isOverridden =
        vocabulary.singular !== vocabulary.defaultSingular || vocabulary.plural !== vocabulary.defaultPlural;
    return {
        ...entity,
        displayName: vocabulary.singular,
        pluralDisplayName: vocabulary.plural,
        vocabulary: {
            ...entity.vocabulary,
            ...vocabulary,
            isOverridden,
        },
    };
}

/**
 * Apply a saved field-definition patch to the VM in place. Field edits change the
 * field's own presentation, never the entity's field/relationship counts, so
 * `structure` is preserved and only category grouping is recomputed.
 */
export function withFieldSummaryPatch(
    entity: EntityWorkspaceVm,
    refKey: string,
    patch: Partial<
        Pick<
            EntityFieldSummaryVm,
            "label" | "description" | "helpText" | "categoryKey" | "categoryLabel" | "required" | "isActive"
        >
    >,
): EntityWorkspaceVm {
    const fields = entity.fields.map((field) => (field.refKey === refKey ? { ...field, ...patch } : field));
    return withFieldListReplaced(entity, fields);
}

/**
 * Re-seat a rewritten field list, keeping every derived slice consistent:
 * category counts, the inactive count, and the ownership partition. Field
 * creation is the one field mutation that legitimately moves `structure` totals,
 * so totals are recomputed from the list rather than preserved.
 */
function withFieldListReplaced(
    entity: EntityWorkspaceVm,
    fields: readonly EntityFieldSummaryVm[],
): EntityWorkspaceVm {
    const next = [...fields];
    return {
        ...entity,
        fields: next,
        structure: {
            ...entity.structure,
            fields: {
                platform: next.filter((field) => field.ownership === "platform").length,
                custom: next.filter((field) => field.ownership === "custom").length,
                computed: next.filter((field) => field.ownership === "computed").length,
                total: next.length,
                inactive: next.filter((field) => !field.isActive).length,
            },
        },
        fieldCategories: entity.fieldCategories.map((category) => ({
            ...category,
            fieldCount: next.filter((field) => field.categoryKey === category.key).length,
        })),
    };
}

/** Add a just-created organization field to the VM without a server round trip. */
export function withFieldSummaryAdded(
    entity: EntityWorkspaceVm,
    field: EntityFieldSummaryVm,
): EntityWorkspaceVm {
    if (entity.fields.some((existing) => existing.refKey === field.refKey)) {
        return withFieldSummaryPatch(entity, field.refKey, field);
    }
    return withFieldListReplaced(entity, [...entity.fields, field]);
}

/**
 * Replace the category list after an in-place Categories mutation. Field
 * assignments are untouched, so counts are recomputed from the existing fields
 * rather than trusted from the caller.
 */
export function withFieldCategoriesReplaced(
    entity: EntityWorkspaceVm,
    categories: readonly EntityFieldCategoryVm[],
): EntityWorkspaceVm {
    const labelByKey = new Map(categories.map((category) => [category.key, category.label] as const));
    const fields = entity.fields.map((field) =>
        labelByKey.has(field.categoryKey) ?
            { ...field, categoryLabel: labelByKey.get(field.categoryKey) ?? field.categoryLabel }
        :   field,
    );
    return {
        ...entity,
        fields,
        fieldCategories: categories.map((category) => ({
            ...category,
            fieldCount: fields.filter((field) => field.categoryKey === category.key).length,
        })),
    };
}

/** Replace the selected entity's status values after a status-definitions mutation. */
export function withStatusDomainStatuses(
    entity: EntityWorkspaceVm,
    statuses: readonly EntityStatusValueVm[],
): EntityWorkspaceVm {
    if (!entity.statusDomain) return entity;
    return {
        ...entity,
        statusDomain: {
            ...entity.statusDomain,
            statuses: [...statuses].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
        },
    };
}

/** Replace one option set after a create / add-value / edit-value mutation. */
export function withOptionSetReplaced(
    entity: EntityWorkspaceVm,
    optionSet: EntityOptionSetVm,
): EntityWorkspaceVm {
    const exists = entity.optionSets.some((set) => set.setKey === optionSet.setKey);
    return {
        ...entity,
        optionSets:
            exists ?
                entity.optionSets.map((set) => (set.setKey === optionSet.setKey ? optionSet : set))
            :   [...entity.optionSets, optionSet].sort((a, b) => a.setKey.localeCompare(b.setKey)),
    };
}

/**
 * Replace the organization relationship vocabulary rows. These live in their own
 * VM slice rather than inside `relationships` so that `structure.relationshipsTotal`
 * keeps meaning exactly one thing: the number of platform edges on this entity.
 */
export function withRelationshipVocabulary(
    entity: EntityWorkspaceVm,
    vocabulary: readonly EntityRelationshipSummaryVm[],
): EntityWorkspaceVm {
    return {
        ...entity,
        relationshipVocabulary: [...vocabulary].sort((a, b) => a.label.localeCompare(b.label)),
    };
}

/**
 * Which relationship vocabulary an entity may extend, or `false` when the entity
 * has no operator-editable relationship terms. Family roles hang off the household
 * grain; person connections hang off people. Other entities relate through platform
 * edges only, so offering a create action there would promise a row nobody reads.
 */
export function entitySupportsRelationshipVocabulary(
    hubKey: SettingsHubEntityKey,
): EntityRelationshipVocabularyKind | false {
    if (hubKey === "person") return "person_relationship";
    if (hubKey === "customer") return "family_role";
    return false;
}

/** Collection endpoint that owns a relationship vocabulary kind. */
export function relationshipVocabularyEndpoint(kind: EntityRelationshipVocabularyKind): string {
    return kind === "family_role" ?
            "/api/admin/customer-person-role-types"
        :   "/api/admin/person-relationship-type-settings";
}

export type EntityLabelEffectiveRow = { entity_type: string; singular: string | null; plural: string | null };

/** Client-safe label-map builder (mirrors `entityLabelsMapFromEffective` without server imports). */
export function entityLabelsMapFromRows(rows: readonly EntityLabelEffectiveRow[]): EntityLabelsMap {
    const map: EntityLabelsMap = {};
    for (const row of rows) {
        map[row.entity_type] = { singular: row.singular ?? null, plural: row.plural ?? null };
    }
    return map;
}

/**
 * Rebuilds vocabulary (singular/plural/defaults) for every entity from a fresh
 * `/api/admin/entity-labels` payload — used after a label save/reset or an
 * industry change, which can shift defaults for entities beyond the one being
 * edited. Structure counts are untouched (label edits never change field or
 * relationship counts).
 */
export function rebuildEntitiesWorkspaceVocabulary(
    vm: DataModelEntitiesWorkspaceVm,
    payload: { defaults: readonly EntityLabelEffectiveRow[]; effective: readonly EntityLabelEffectiveRow[] },
): DataModelEntitiesWorkspaceVm {
    const labels = entityLabelsMapFromRows(payload.effective);
    const defaultsByType = new Map(
        payload.defaults.map((row) => [row.entity_type, { singular: row.singular, plural: row.plural }] as const),
    );
    const entitiesByHubKey: Record<string, EntityWorkspaceVm> = {};
    for (const entity of Object.values(vm.entitiesByHubKey)) {
        const defaults = defaultsByType.get(entity.labelsKey);
        entitiesByHubKey[entity.hubKey] = withVocabularyOverride(entity, {
            singular: resolveConfigurationEntitySingularLabel(labels, entity.hubKey),
            plural: resolveConfigurationEntityPluralLabel(labels, entity.hubKey),
            defaultSingular: defaults?.singular?.trim() || entity.vocabulary.defaultSingular,
            defaultPlural: defaults?.plural?.trim() || entity.vocabulary.defaultPlural,
        });
    }
    return {
        ...vm,
        entitiesByHubKey,
        collection: buildEntitiesCollectionVm(Object.values(entitiesByHubKey)),
    };
}

/** Replace one entity in the VM (used after an in-place field edit). */
export function withEntityReplaced(
    vm: DataModelEntitiesWorkspaceVm,
    entity: EntityWorkspaceVm,
): DataModelEntitiesWorkspaceVm {
    const entitiesByHubKey = { ...vm.entitiesByHubKey, [entity.hubKey]: entity };
    return {
        ...vm,
        entitiesByHubKey,
        collection: buildEntitiesCollectionVm(Object.values(entitiesByHubKey)),
    };
}
