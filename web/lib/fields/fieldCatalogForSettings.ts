/**
 * Unified field catalog for Settings → Fields workspace.
 *
 * Merges platform, custom (field_definitions), and computed catalog entries
 * into one operator-facing model.
 */

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import {
    computedFieldsForChildSettingsTab,
    computedFieldsForSettingsEntity,
    type ComputedFieldDefinition,
    type ComputedFieldSettingsEntity,
} from "@/lib/fields/computedFieldCatalog";
import type { FieldOwnershipKind } from "@/lib/fields/fieldOwnership";
import {
    platformFieldsForEntity,
    platformFieldsForEntityExcludingRegistry,
    type PlatformFieldDefinition,
} from "@/lib/fields/platformFieldCatalog";
import { operatorFieldDisplayLabel } from "@/lib/fields/fieldSettingsOperatorUi";

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

function platformEntry(row: PlatformFieldDefinition): SettingsFieldCatalogEntry {
    return {
        id: `platform:${row.refKey}`,
        ownership: "platform",
        refKey: row.refKey,
        label: row.label,
        field_type: row.field_type,
        section_key: row.section_key,
        entity_type: row.entity_type,
        storage_line: `${row.storage_table}.${row.storage_column}`,
        editable: false,
        configurable: false,
        platformField: row,
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
        computedField: row,
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
}): SettingsFieldCatalogEntry[] {
    const entries: SettingsFieldCatalogEntry[] = [];
    const seenRefKeys = new Set<string>();

    for (const entityType of input.entityTypes) {
        const existingKeys = new Set(
            input.customFields
                .filter((f) => f.entity_type.trim().toLowerCase() === entityType.trim().toLowerCase())
                .map((f) => f.field_key.trim().toLowerCase()),
        );
        for (const row of platformFieldsForEntityExcludingRegistry(entityType, existingKeys)) {
            if (seenRefKeys.has(row.refKey)) continue;
            seenRefKeys.add(row.refKey);
            entries.push(platformEntry(row));
        }
    }

    for (const row of input.customFields) {
        if (!input.entityTypes.some((et) => et.trim().toLowerCase() === row.entity_type.trim().toLowerCase())) {
            continue;
        }
        if (!input.includeHiddenCustom && row.is_active === false) continue;
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
    "scheduling",
    "attendance",
    "communications",
    "billing",
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
    const labels: Record<string, string> = {
        identity: "Identity",
        contact: "Contact",
        enrollment: "Enrollment",
        health: "Health",
        medical: "Medical",
        child_profile: "Profile",
        enrollment_profile: "Enrollment",
        profile: "Profile",
        requirements: "Requirements",
        scheduling: "Scheduling",
        attendance: "Attendance",
        runtime_signals: "Runtime Signals",
        communications: "Communications",
        billing: "Billing",
        placement: "Placement",
        lifecycle: "Lifecycle",
        system: "System",
        custom: "Custom",
        general: "General",
        site: "Site",
    };
    return labels[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Operator-facing alias — categories are business concepts, not presentation sections. */
export function categoryDisplayLabel(categoryKey: string): string {
    return sectionDisplayLabel(categoryKey);
}

export function groupCatalogEntriesBySection(
    entries: readonly SettingsFieldCatalogEntry[],
): Map<string, SettingsFieldCatalogEntry[]> {
    const groups = new Map<string, SettingsFieldCatalogEntry[]>();
    for (const entry of entries) {
        const key = entry.section_key?.trim() || "general";
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
