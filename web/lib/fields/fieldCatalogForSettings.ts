/**
 * Unified field catalog for Settings → Fields workspace.
 *
 * Merges platform, custom (field_definitions), and computed catalog entries
 * into one operator-facing model.
 */

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import { platformCategoryLabel } from "@/lib/adminV2/configuration/configurationCategoryCatalog";
import {
    computedFieldsForChildSettingsTab,
    computedFieldsForSettingsEntity,
    type ComputedFieldDefinition,
    type ComputedFieldSettingsEntity,
} from "@/lib/fields/computedFieldCatalog";
import { conceptKindForComputedField } from "@/lib/fields/fieldConceptModel";
import type { FieldOwnershipKind } from "@/lib/fields/fieldOwnership";
import {
    platformFieldsForEntity,
    isPlatformNativeField,
    type PlatformFieldDefinition,
} from "@/lib/fields/platformFieldCatalog";
import { operatorFieldDisplayLabel } from "@/lib/fields/fieldSettingsOperatorUi";
import { readFieldLifecycleState } from "@/lib/fields/fieldLifecycleModel";

export type SettingsHubEntityKey = ComputedFieldSettingsEntity;

export type SettingsFieldCatalogEntry = {
    id: string;
    ownership: FieldOwnershipKind;
    refKey: string;
    label: string;
    field_type: string;
    section_key: string;
    description?: string;
    entity_type: string;
    storage_line?: string;
    editable: boolean;
    configurable: boolean;
    fieldDef?: FieldDef;
    platformField?: PlatformFieldDefinition;
    computedField?: ComputedFieldDefinition;
};

export type FieldOwnershipCounts = {
    platform: number;
    custom: number;
    computed: number;
    total: number;
};

function layoutRefKey(entityType: string, fieldKey: string): string {
    const et = entityType.trim().toLowerCase();
    if (et === "customer_member") return `child.${fieldKey === "dob" ? "date_of_birth" : fieldKey}`;
    return `${et}.${fieldKey}`;
}

function platformEntry(row: PlatformFieldDefinition, override?: FieldDef): SettingsFieldCatalogEntry {
    const entityType = row.entity_type;
    const section_key = override?.section_key?.trim() || row.section_key;
    const label = override
        ? operatorFieldDisplayLabel(entityType, {
              field_key: override.field_key,
              is_system: override.is_system,
              label: override.label,
              config: override.config,
          })
        : row.label;
    return {
        id: `platform:${row.refKey}`,
        ownership: "platform",
        refKey: row.refKey,
        label,
        field_type: row.field_type,
        section_key,
        entity_type: entityType,
        storage_line: `${row.storage_table}.${row.storage_column}`,
        editable: false,
        configurable: false,
        platformField: row,
        fieldDef: override,
    };
}

function customEntry(entityType: string, row: FieldDef): SettingsFieldCatalogEntry {
    const refKey = layoutRefKey(entityType, row.field_key);
    return {
        id: `custom:${row.id}`,
        ownership: "custom",
        refKey,
        label: operatorFieldDisplayLabel(entityType, {
            field_key: row.field_key,
            is_system: row.is_system,
            label: row.label,
            config: row.config,
        }),
        field_type: row.field_type,
        section_key: row.section_key?.trim() || "general",
        description: row.description ?? row.help_text ?? undefined,
        entity_type: entityType,
        storage_line: "field_values (tenant registry)",
        editable: true,
        configurable: !row.is_system,
        fieldDef: row,
    };
}

function computedEntry(row: ComputedFieldDefinition): SettingsFieldCatalogEntry {
    const withConcept: ComputedFieldDefinition = {
        ...row,
        concept_kind: conceptKindForComputedField(row),
    };
    return {
        id: `computed:${row.refKey}`,
        ownership: "computed",
        refKey: row.refKey,
        label: row.label,
        field_type: row.field_type,
        section_key: row.section_key,
        description: row.description,
        entity_type: row.entity_type,
        storage_line: row.source_derivation,
        editable: false,
        configurable: false,
        computedField: withConcept,
    };
}

export function settingsEntityForHubKey(entity: SettingsHubEntityKey): ComputedFieldSettingsEntity {
    return entity;
}

export function computedFieldsForHubEntity(entity: SettingsHubEntityKey): ComputedFieldDefinition[] {
    if (entity === "inquiry_child") return computedFieldsForChildSettingsTab();
    return computedFieldsForSettingsEntity(entity);
}

export function buildSettingsFieldCatalogEntries(input: {
    hubEntity: SettingsHubEntityKey;
    entityTypes: readonly string[];
    customFields: readonly FieldDef[];
    includeHiddenCustom?: boolean;
    includeArchivedCustom?: boolean;
}): SettingsFieldCatalogEntry[] {
    const entries: SettingsFieldCatalogEntry[] = [];
    const seenRefKeys = new Set<string>();

    for (const entityType of input.entityTypes) {
        const defsForEntity = input.customFields.filter(
            (f) => f.entity_type.trim().toLowerCase() === entityType.trim().toLowerCase(),
        );
        const defByKey = new Map(defsForEntity.map((f) => [f.field_key.trim().toLowerCase(), f] as const));

        for (const row of platformFieldsForEntity(entityType).filter((f) => f.operator_visible)) {
            if (seenRefKeys.has(row.refKey)) continue;
            const override = defByKey.get(row.field_key.trim().toLowerCase());
            seenRefKeys.add(row.refKey);
            entries.push(platformEntry(row, override));
        }
    }

    for (const row of input.customFields) {
        if (!input.entityTypes.some((et) => et.trim().toLowerCase() === row.entity_type.trim().toLowerCase())) {
            continue;
        }
        const lifecycle = readFieldLifecycleState(row);
        if (!input.includeArchivedCustom && lifecycle === "archived") continue;
        if (!input.includeHiddenCustom && lifecycle === "hidden") continue;
        if (isPlatformNativeField(row.entity_type, row.field_key)) continue;
        const entry = customEntry(row.entity_type, row);
        if (seenRefKeys.has(entry.refKey)) continue;
        seenRefKeys.add(entry.refKey);
        entries.push(entry);
    }

    for (const row of computedFieldsForHubEntity(input.hubEntity)) {
        if (seenRefKeys.has(row.refKey)) continue;
        seenRefKeys.add(row.refKey);
        entries.push(computedEntry(row));
    }

    return entries.sort((a, b) => {
        if (a.section_key !== b.section_key) return a.section_key.localeCompare(b.section_key);
        return a.label.localeCompare(b.label);
    });
}

/**
 * What an operator may change on a field row.
 *
 * - `full`: tenant custom field — label, category, help/description, status, delete.
 * - `presentation`: platform/system field_definition — safe organization only
 *   (label, category, help/description). Storage, type, resolver, ownership, delete stay locked.
 * - `view`: pure platform-catalog or computed field — read-only until a persisted
 *   override layer exists (see follow-up in configuration-workspace-doctrine.md).
 */
export type FieldEditMode = "full" | "presentation" | "view";

export type FieldEditCapability = {
    mode: FieldEditMode;
    canEditLabel: boolean;
    canEditCategory: boolean;
    canEditDescription: boolean;
    /** Storage/type is never operator-editable — platform runtime safety. */
    canEditType: boolean;
    canEditStatus: boolean;
    canDelete: boolean;
};

const VIEW_ONLY_CAPABILITY: FieldEditCapability = {
    mode: "view",
    canEditLabel: false,
    canEditCategory: false,
    canEditDescription: false,
    canEditType: false,
    canEditStatus: false,
    canDelete: false,
};

export function fieldRowEditCapability(
    entry: SettingsFieldCatalogEntry,
    canMutate: boolean,
): FieldEditCapability {
    if (!canMutate) return VIEW_ONLY_CAPABILITY;

    if (entry.fieldDef?.is_system === true) {
        return {
            mode: "presentation",
            canEditLabel: true,
            canEditCategory: true,
            canEditDescription: true,
            canEditType: false,
            canEditStatus: false,
            canDelete: false,
        };
    }

    if (entry.ownership !== "custom" || !entry.fieldDef) return VIEW_ONLY_CAPABILITY;

    if (!entry.configurable) return VIEW_ONLY_CAPABILITY;

    return {
        mode: "full",
        canEditLabel: true,
        canEditCategory: true,
        canEditDescription: true,
        canEditType: false,
        canEditStatus: true,
        canDelete: true,
    };
}

export function countFieldsByOwnership(entries: readonly SettingsFieldCatalogEntry[]): FieldOwnershipCounts {
    const counts: FieldOwnershipCounts = { platform: 0, custom: 0, computed: 0, total: entries.length };
    for (const entry of entries) {
        counts[entry.ownership] += 1;
    }
    return counts;
}

/** Static platform + computed counts for nav badges (custom loaded separately). */
export function staticCatalogCountsForHubEntity(entity: SettingsHubEntityKey): Omit<FieldOwnershipCounts, "total"> {
    const entityTypes = hubEntityApiTypes(entity);
    let platform = 0;
    for (const et of entityTypes) {
        platform += platformFieldsForEntity(et).filter((f) => f.operator_visible).length;
    }
    const computed = computedFieldsForHubEntity(entity).length;
    return { platform, custom: 0, computed };
}

export function hubEntityApiTypes(entity: SettingsHubEntityKey): readonly string[] {
    if (entity === "inquiry_child") return ["customer_member", "inquiry_child"];
    return [entity];
}

export function filterCatalogByOwnership(
    entries: readonly SettingsFieldCatalogEntry[],
    filter: FieldOwnershipKind | "all",
): SettingsFieldCatalogEntry[] {
    if (filter === "all") return [...entries];
    return entries.filter((e) => e.ownership === filter);
}

export const FIELD_SECTION_DISPLAY_ORDER = [
    "identity",
    "contact",
    "enrollment",
    "health",
    "medical",
    "child_profile",
    "profile",
    "requirements",
    "attendance",
    "scheduling",
    "communications",
    "billing",
    "licensing",
    "transportation",
    "behavior",
    "nutrition",
    "runtime_signals",
    "placement",
    "lifecycle",
    "system",
    "custom",
    "general",
    "site",
] as const;

export function sectionDisplayLabel(sectionKey: string): string {
    const key = sectionKey.trim().toLowerCase();
    if (!key) return "General";
    const aliases: Record<string, string> = {
        child_profile: "Child Profile",
        enrollment_profile: "Enrollment",
        enrollment: "Enrollment",
        profile: "Child Profile",
        medical: "Child Profile",
        health: "Child Profile",
        runtime_signals: "Runtime Signals",
        relationships: "Relationships",
    };
    if (aliases[key]) return aliases[key];
    return platformCategoryLabel(key);
}

/** Operator-facing alias — categories are business concepts, not presentation sections. */
export function categoryDisplayLabel(categoryKey: string): string {
    return sectionDisplayLabel(categoryKey);
}

/**
 * Settings → Child hub ownership grains — surface presentation without inventing storage.
 * A field may appear under Child while owned by Enrollment (inquiry_child / OCM).
 */
export type ChildHubOwnershipGrain =
    | "child_profile"
    | "enrollment"
    | "relationships"
    | "calculated"
    | "runtime_signals";

export const CHILD_HUB_OWNERSHIP_GRAIN_ORDER: readonly ChildHubOwnershipGrain[] = [
    "child_profile",
    "enrollment",
    "relationships",
    "calculated",
    "runtime_signals",
] as const;

export const CHILD_HUB_OWNERSHIP_GRAIN_LABELS: Readonly<Record<ChildHubOwnershipGrain, string>> = {
    child_profile: "Child Profile",
    enrollment: "Enrollment",
    relationships: "Relationships",
    calculated: "Calculated",
    runtime_signals: "Runtime Signals",
};

export function childHubOwnerGrainLabel(entityType: string): string {
    const et = entityType.trim().toLowerCase();
    if (et === "customer_member") return "Child Profile";
    if (et === "inquiry_child") return "Enrollment";
    return et.replace(/_/g, " ");
}

export function childHubOwnershipGrainForEntry(entry: SettingsFieldCatalogEntry): ChildHubOwnershipGrain {
    if (entry.ownership === "computed") {
        const concept = entry.computedField?.concept_kind;
        if (concept === "calculated_field") return "calculated";
        return "runtime_signals";
    }
    const section = catalogEntrySectionKey(entry).toLowerCase();
    if (section === "relationships" || entry.refKey.includes("relationship")) return "relationships";
    if (entry.entity_type === "inquiry_child") return "enrollment";
    if (entry.entity_type === "customer_member") return "child_profile";
    if (section === "enrollment" || section === "enrollment_profile" || section === "placement") {
        return "enrollment";
    }
    if (section === "child_profile" || section === "profile" || section === "medical" || section === "health") {
        return "child_profile";
    }
    return entry.entity_type === "inquiry_child" ? "enrollment" : "child_profile";
}

export function groupCatalogEntriesByChildOwnershipGrain(
    entries: readonly SettingsFieldCatalogEntry[],
): Map<ChildHubOwnershipGrain, SettingsFieldCatalogEntry[]> {
    const groups = new Map<ChildHubOwnershipGrain, SettingsFieldCatalogEntry[]>();
    for (const grain of CHILD_HUB_OWNERSHIP_GRAIN_ORDER) {
        groups.set(grain, []);
    }
    for (const entry of entries) {
        const grain = childHubOwnershipGrainForEntry(entry);
        const list = groups.get(grain) ?? [];
        list.push(entry);
        groups.set(grain, list);
    }
    return groups;
}

/** Resolved section key for grouping — persisted field_definitions override catalog defaults. */
export function catalogEntrySectionKey(entry: SettingsFieldCatalogEntry): string {
    return entry.fieldDef?.section_key?.trim() || entry.section_key?.trim() || "general";
}

export function groupCatalogEntriesBySection(
    entries: readonly SettingsFieldCatalogEntry[],
): Map<string, SettingsFieldCatalogEntry[]> {
    const groups = new Map<string, SettingsFieldCatalogEntry[]>();
    for (const entry of entries) {
        const key = catalogEntrySectionKey(entry);
        const list = groups.get(key) ?? [];
        list.push(entry);
        groups.set(key, list);
    }
    return groups;
}

export function orderedSectionKeys(groups: Map<string, SettingsFieldCatalogEntry[]>): string[] {
    const keys = [...groups.keys()];
    return keys.sort((a, b) => {
        const orderA = FIELD_SECTION_DISPLAY_ORDER.indexOf(a as (typeof FIELD_SECTION_DISPLAY_ORDER)[number]);
        const orderB = FIELD_SECTION_DISPLAY_ORDER.indexOf(b as (typeof FIELD_SECTION_DISPLAY_ORDER)[number]);
        const safeA = orderA >= 0 ? orderA : 999;
        const safeB = orderB >= 0 ? orderB : 999;
        if (safeA !== safeB) return safeA - safeB;
        return a.localeCompare(b);
    });
}
