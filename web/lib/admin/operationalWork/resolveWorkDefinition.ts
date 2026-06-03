import {
    lifecycleWorkDefinitionsHasStageBindings,
    parseLifecycleWorkDefinitionsV1,
} from "@/lib/admin/operationalWork/lifecycleWorkDefinitionsConfig";
import {
    getPlatformWorkDefinition,
    listPlatformWorkDefinitions,
    PLATFORM_DEFAULT_WORK_DEFINITION_STAGE_BINDINGS,
} from "@/lib/admin/operationalWork/platformWorkDefinitionCatalog";
import type {
    EffectiveWorkDefinition,
    LifecycleWorkDefinitionEntryConfig,
    LifecycleWorkDefinitionsV1,
    PlatformWorkDefinition,
    PlatformWorkDefinitionKey,
    ResolveWorkDefinitionsParams,
} from "@/lib/admin/operationalWork/workDefinitionTypes";

function applyMetadataOverrides(
    catalog: PlatformWorkDefinition,
    entry: LifecycleWorkDefinitionEntryConfig | undefined,
): EffectiveWorkDefinition {
    const enabled = entry?.enabled ?? catalog.platform_enabled;
    const metadata_overrides: EffectiveWorkDefinition["metadata_overrides"] = {};
    if (entry?.display_name_override?.trim()) {
        metadata_overrides.display_name = entry.display_name_override.trim();
    }
    if (entry?.default_title_override?.trim()) {
        metadata_overrides.default_title = entry.default_title_override.trim();
    }
    if (entry?.due_policy_override) {
        metadata_overrides.due_policy = entry.due_policy_override;
    }
    if (entry?.assignee_policy_override) {
        metadata_overrides.assignee_policy = entry.assignee_policy_override;
    }

    return {
        ...catalog,
        display_name: entry?.display_name_override?.trim() || catalog.display_name,
        default_title: entry?.default_title_override?.trim() || catalog.default_title,
        due_policy: entry?.due_policy_override ?? catalog.due_policy,
        assignee_policy: entry?.assignee_policy_override ?? catalog.assignee_policy,
        enabled,
        metadata_overrides: Object.keys(metadata_overrides).length ? metadata_overrides : undefined,
    };
}

function stageAllowsDefinition(
    key: PlatformWorkDefinitionKey,
    stageKey: string,
    config: LifecycleWorkDefinitionsV1 | null,
): boolean {
    if (key === "manual_ad_hoc") return true;

    const trimmedStage = stageKey.trim();
    if (!trimmedStage) return true;

    if (config && lifecycleWorkDefinitionsHasStageBindings(config)) {
        const binding = config.stage_bindings[trimmedStage];
        if (!binding) return false;
        return binding.available_definition_keys.includes(key);
    }

    const defaultBinding = PLATFORM_DEFAULT_WORK_DEFINITION_STAGE_BINDINGS[trimmedStage];
    if (!defaultBinding) return true;
    return defaultBinding.available_definition_keys.includes(key);
}

function resolveSingleDefinition(
    key: PlatformWorkDefinitionKey,
    config: LifecycleWorkDefinitionsV1 | null,
): EffectiveWorkDefinition | null {
    const catalog = getPlatformWorkDefinition(key);
    if (!catalog) return null;
    return applyMetadataOverrides(catalog, config?.definitions[key]);
}

/**
 * Resolve one catalog definition merged with lifecycle metadata.
 * Does not instantiate runtime work.
 */
export function resolveWorkDefinition(
    key: string,
    params: ResolveWorkDefinitionsParams = {},
): EffectiveWorkDefinition | null {
    const trimmed = key.trim();
    if (!trimmed) return null;

    const catalog = getPlatformWorkDefinition(trimmed);
    if (!catalog) return null;

    const config = parseLifecycleWorkDefinitionsV1(params.departmentMetadata ?? null);
    const effective = resolveSingleDefinition(catalog.key, config);
    if (!effective) return null;

    if (!params.includeDisabled && !effective.enabled) return null;

    const stageKey = params.stageKey?.trim() || null;
    if (stageKey && !stageAllowsDefinition(catalog.key, stageKey, config)) {
        return null;
    }

    return effective;
}

/**
 * Resolve all catalog definitions merged with lifecycle metadata.
 * Does not instantiate runtime work.
 */
export function resolveEffectiveWorkDefinitions(
    params: ResolveWorkDefinitionsParams = {},
): EffectiveWorkDefinition[] {
    const config = parseLifecycleWorkDefinitionsV1(params.departmentMetadata ?? null);
    const stageKey = params.stageKey?.trim() || null;
    const includeDisabled = params.includeDisabled === true;

    const results: EffectiveWorkDefinition[] = [];

    for (const catalog of listPlatformWorkDefinitions()) {
        const effective = applyMetadataOverrides(catalog, config?.definitions[catalog.key]);
        if (!includeDisabled && !effective.enabled) continue;
        if (stageKey && !stageAllowsDefinition(catalog.key, stageKey, config)) continue;
        results.push(effective);
    }

    return results;
}

/** Keys available for a stage after merge — convenience for future picker (B3). */
export function resolveAvailableWorkDefinitionKeys(params: ResolveWorkDefinitionsParams = {}): PlatformWorkDefinitionKey[] {
    return resolveEffectiveWorkDefinitions(params).map((def) => def.key);
}
