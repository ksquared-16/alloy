import { isKnownWorkDefinitionKey } from "@/lib/admin/operationalWork/platformWorkDefinitionCatalog";
import type {
    LifecycleWorkDefinitionEntryConfig,
    LifecycleWorkDefinitionStageBinding,
    LifecycleWorkDefinitionsV1,
    PlatformWorkDefinitionKey,
    WorkDefinitionAssigneePolicy,
    WorkDefinitionDuePolicy,
} from "@/lib/admin/operationalWork/workDefinitionTypes";

export const LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY = "lifecycle_work_definitions_v1" as const;

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function parseDuePolicy(v: unknown): WorkDefinitionDuePolicy | null {
    if (!isRecord(v)) return null;
    const kind = trimOrNull(v.kind);
    if (kind === "none") return { kind: "none" };
    if (kind !== "offset_from_create") return null;
    const daysRaw = v.days;
    const hoursRaw = v.hours;
    const days = typeof daysRaw === "number" && Number.isFinite(daysRaw) && daysRaw >= 0 ? Math.floor(daysRaw) : undefined;
    const hours = typeof hoursRaw === "number" && Number.isFinite(hoursRaw) && hoursRaw >= 0 ? Math.floor(hoursRaw) : undefined;
    if (days == null && hours == null) return { kind: "offset_from_create", days: 1 };
    return { kind: "offset_from_create", days, hours };
}

function parseAssigneePolicy(v: unknown): WorkDefinitionAssigneePolicy | null {
    if (!isRecord(v)) return null;
    const kind = trimOrNull(v.kind);
    if (kind === "record_owner" || kind === "creator" || kind === "unassigned") {
        return { kind };
    }
    if (kind === "role") {
        const roleKey = trimOrNull(v.role_key);
        if (!roleKey) return null;
        return { kind: "role", role_key: roleKey };
    }
    return null;
}

function parseDefinitionEntry(key: string, v: unknown): LifecycleWorkDefinitionEntryConfig | null {
    if (!isKnownWorkDefinitionKey(key) || !isRecord(v)) return null;
    if (typeof v.enabled !== "boolean") return null;

    const entry: LifecycleWorkDefinitionEntryConfig = { enabled: v.enabled };
    const displayName = trimOrNull(v.display_name_override);
    if (displayName) entry.display_name_override = displayName;
    const defaultTitle = trimOrNull(v.default_title_override);
    if (defaultTitle) entry.default_title_override = defaultTitle;
    const duePolicy = parseDuePolicy(v.due_policy_override);
    if (duePolicy) entry.due_policy_override = duePolicy;
    const assigneePolicy = parseAssigneePolicy(v.assignee_policy_override);
    if (assigneePolicy) entry.assignee_policy_override = assigneePolicy;
    return entry;
}

function parseStageBinding(v: unknown): LifecycleWorkDefinitionStageBinding | null {
    if (!isRecord(v)) return null;
    const raw = v.available_definition_keys;
    if (!Array.isArray(raw)) return null;
    const available_definition_keys: PlatformWorkDefinitionKey[] = [];
    for (const item of raw) {
        if (typeof item !== "string") continue;
        const key = item.trim();
        if (isKnownWorkDefinitionKey(key) && !available_definition_keys.includes(key)) {
            available_definition_keys.push(key);
        }
    }
    if (!available_definition_keys.length) return null;
    return { available_definition_keys };
}

/**
 * Parse lifecycle_work_definitions_v1 from department metadata.
 * Returns null when absent or invalid — callers fall back to catalog defaults.
 */
export function parseLifecycleWorkDefinitionsV1(
    metadata: Record<string, unknown> | null | undefined,
): LifecycleWorkDefinitionsV1 | null {
    if (!metadata || !isRecord(metadata)) return null;
    const root = metadata[LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY];
    if (!isRecord(root)) return null;
    if (root.version !== 1) return null;

    const definitions: LifecycleWorkDefinitionsV1["definitions"] = {};
    const rawDefinitions = root.definitions;
    if (isRecord(rawDefinitions)) {
        for (const [key, value] of Object.entries(rawDefinitions)) {
            const parsed = parseDefinitionEntry(key, value);
            if (parsed) {
                definitions[key.trim() as PlatformWorkDefinitionKey] = parsed;
            }
        }
    }

    const stage_bindings: LifecycleWorkDefinitionsV1["stage_bindings"] = {};
    const rawBindings = root.stage_bindings;
    if (isRecord(rawBindings)) {
        for (const [stageKey, value] of Object.entries(rawBindings)) {
            const trimmedStage = stageKey.trim();
            if (!trimmedStage) continue;
            const parsed = parseStageBinding(value);
            if (parsed) stage_bindings[trimmedStage] = parsed;
        }
    }

    if (!Object.keys(definitions).length && !Object.keys(stage_bindings).length) {
        return null;
    }

    return {
        version: 1,
        definitions,
        stage_bindings,
    };
}

/** Whether parsed config includes any stage binding entries. */
export function lifecycleWorkDefinitionsHasStageBindings(config: LifecycleWorkDefinitionsV1 | null): boolean {
    return config != null && Object.keys(config.stage_bindings).length > 0;
}
