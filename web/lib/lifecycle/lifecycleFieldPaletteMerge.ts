/**
 * Merge platform lifecycle field catalog with org field_definitions for Settings palette.
 *
 * Registry-first with enrollment operator visibility doctrine (E3).
 * Org rows and catalog bindings are filtered through isEnrollmentOperatorFieldVisible.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    CHILDCARE_PROGRAM_FIELD_MODEL,
    isEnrollmentOperatorFieldVisible,
    isLegacyChildProgramFieldKey,
    lifecycleRequirementEntityToFieldDefinitionEntity,
} from "@/lib/fields/childcareFieldCatalogDoctrine";
import {
    lifecycleFieldPaletteForStage,
    type LifecycleFieldRequirementDefinition,
    type LifecycleRequirementEntityKey,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    customFieldRuleId,
    lifecycleFieldRuleBinding,
} from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import type { OrgFieldDefinitionRow } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import { isDeprecatedLifecycleFieldRule, sanitizeLifecycleFieldRuleIds } from "@/lib/lifecycle/lifecycleConfiguration";

export type LifecycleFieldPaletteFieldSource = "catalog" | "system" | "custom";

export type LifecycleFieldPaletteEntry = {
    rule_id: string;
    entity: LifecycleRequirementEntityKey;
    field_label: string;
    /** Internal — not shown in operator UI */
    field_key: string | null;
    field_source: LifecycleFieldPaletteFieldSource;
    runtime_enforced: boolean;
    form_coverage_supported: boolean;
    config_only: boolean;
};

function catalogEntryToPalette(entry: LifecycleFieldRequirementDefinition): LifecycleFieldPaletteEntry {
    const binding = lifecycleFieldRuleBinding(entry.rule_id);
    return {
        rule_id: entry.rule_id,
        entity: entry.entity,
        field_label: entry.field_label,
        field_key: binding?.field_key ?? null,
        field_source: binding?.field_key ? "catalog" : "catalog",
        runtime_enforced: binding?.runtime_enforced ?? entry.runtime_enforced,
        form_coverage_supported: binding?.form_coverage_supported ?? false,
        config_only: !(binding?.runtime_enforced ?? entry.runtime_enforced),
    };
}

function orgRowToPalette(entity: LifecycleRequirementEntityKey, row: OrgFieldDefinitionRow): LifecycleFieldPaletteEntry {
    const rule_id = customFieldRuleId(entity, row.field_key);
    return {
        rule_id,
        entity,
        field_label: row.label,
        field_key: row.field_key,
        field_source: row.is_system ? "system" : "custom",
        runtime_enforced: false,
        form_coverage_supported: true,
        config_only: true,
    };
}

function fieldDefinitionEntityForPalette(
    entityKey: LifecycleRequirementEntityKey,
    row?: OrgFieldDefinitionRow | null
): string {
    const fromRow = row?.entity_type?.trim();
    if (fromRow) return fromRow;
    return lifecycleRequirementEntityToFieldDefinitionEntity(entityKey);
}

function paletteEntryPassesVisibility(
    entityKey: LifecycleRequirementEntityKey,
    fieldKey: string | null,
    row?: OrgFieldDefinitionRow | null
): boolean {
    if (!fieldKey?.trim()) return true;
    const entityType = fieldDefinitionEntityForPalette(entityKey, row);
    return isEnrollmentOperatorFieldVisible(entityType, fieldKey, {
        is_system: row?.is_system ?? true,
        config: row?.config ?? null,
    });
}

function catalogPaletteEntryVisible(entry: LifecycleFieldPaletteEntry): boolean {
    return paletteEntryPassesVisibility(entry.entity, entry.field_key);
}

function shouldSkipOrgRow(
    entityKey: LifecycleRequirementEntityKey,
    row: OrgFieldDefinitionRow,
    paletteByFieldKey: Set<string>
): boolean {
    if (!paletteEntryPassesVisibility(entityKey, row.field_key, row)) return true;
    if (isLegacyChildProgramFieldKey(row.field_key)) return true;
    if (
        row.field_key === CHILDCARE_PROGRAM_FIELD_MODEL.legacy_alias_field_key &&
        paletteByFieldKey.has(CHILDCARE_PROGRAM_FIELD_MODEL.canonical_field_key)
    ) {
        return true;
    }
    return false;
}

/** Prefer catalog label when org field_definitions still use legacy system labels (e.g. Mobile for phone). */
export function resolveLifecycleFieldPaletteDisplayLabel(
    catalogLabel: string,
    fieldKey: string | null,
    orgLabel: string | undefined
): string {
    const trimmedOrg = orgLabel?.trim() ?? "";
    if (!trimmedOrg || trimmedOrg === catalogLabel) return catalogLabel;
    if (fieldKey === "phone" && /^mobile$/i.test(trimmedOrg)) return catalogLabel;
    return trimmedOrg;
}

function overlayOrgLabels(
    palette: LifecycleFieldPaletteEntry[],
    orgByEntity: Partial<Record<LifecycleRequirementEntityKey, OrgFieldDefinitionRow[]>>
): LifecycleFieldPaletteEntry[] {
    return palette.map((entry) => {
        if (!entry.field_key) return entry;
        const orgRows = orgByEntity[entry.entity] ?? [];
        const match = orgRows.find((r) => r.field_key === entry.field_key);
        if (!match?.label) return entry;
        const field_label = resolveLifecycleFieldPaletteDisplayLabel(
            entry.field_label,
            entry.field_key,
            match.label
        );
        if (field_label === entry.field_label) return entry;
        return { ...entry, field_label, field_source: match.is_system ? "system" : entry.field_source };
    });
}

export function mergeLifecycleFieldPaletteForStage(
    stage: LifecycleOperatorStage,
    orgByEntity?: Partial<Record<LifecycleRequirementEntityKey, OrgFieldDefinitionRow[]>> | null
): LifecycleFieldPaletteEntry[] {
    const catalogPalette = lifecycleFieldPaletteForStage(stage);
    const byRuleId = new Map<string, LifecycleFieldPaletteEntry>();

    for (const entry of catalogPalette) {
        if (isDeprecatedLifecycleFieldRule(entry.rule_id)) continue;
        const paletteEntry = catalogEntryToPalette(entry);
        if (!catalogPaletteEntryVisible(paletteEntry)) continue;
        byRuleId.set(entry.rule_id, paletteEntry);
    }

    const org = orgByEntity ?? {};

    for (const [entityKey, rows] of Object.entries(org) as Array<
        [LifecycleRequirementEntityKey, OrgFieldDefinitionRow[]]
    >) {
        const catalogKeys = new Set(
            [...byRuleId.values()]
                .filter((e) => e.entity === entityKey && e.field_key)
                .map((e) => e.field_key as string)
        );
        for (const row of rows) {
            if (catalogKeys.has(row.field_key)) continue;
            if (shouldSkipOrgRow(entityKey, row, catalogKeys)) continue;
            const custom = orgRowToPalette(entityKey, row);
            if (!byRuleId.has(custom.rule_id)) {
                byRuleId.set(custom.rule_id, custom);
                catalogKeys.add(row.field_key);
            }
        }
    }

    return overlayOrgLabels([...byRuleId.values()], org).sort((a, b) => {
        if (a.entity !== b.entity) return a.entity.localeCompare(b.entity);
        return a.field_label.localeCompare(b.field_label);
    });
}

/** Keep only rule ids present in the operator-visible palette (drops hidden legacy selections). */
export function filterFieldRuleIdsToPalette(
    ruleIds: readonly string[],
    palette: readonly LifecycleFieldPaletteEntry[]
): string[] {
    const allowed = new Set(palette.map((p) => p.rule_id));
    return sanitizeLifecycleFieldRuleIds(ruleIds.filter((id) => allowed.has(id)));
}

export function validateFieldRuleIdsAgainstPalette(
    ruleIds: readonly string[],
    palette: readonly LifecycleFieldPaletteEntry[]
): string[] | null {
    const filtered = filterFieldRuleIdsToPalette(ruleIds, palette);
    if (filtered.length !== sanitizeLifecycleFieldRuleIds(ruleIds).length) return null;
    return filtered;
}
