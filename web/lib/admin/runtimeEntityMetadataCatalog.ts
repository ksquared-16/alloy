/**
 * Catalog of known `work_units.metadata` / `departments.metadata` keys used by runtime code.
 * Used for read-only Settings visibility (Card 7) — keep in sync when new keys are consumed.
 */

export type RuntimeMetadataEntity = "work_unit" | "department";

export type RuntimeMetadataKeyCategory = "crm_attention" | "activity_signals" | "tenant_routing" | "internal_seed" | "unknown";

export type RuntimeMetadataKeyInfo = {
    /** Short title for grouped UI */
    label: string;
    category: RuntimeMetadataKeyCategory;
    /** Which row types use this key in app code */
    entities: RuntimeMetadataEntity[];
    /** Operator-facing description */
    description: string;
    /** Optional JSON-ish shape reference (read-only help, not a runtime validator) */
    schemaSummary?: string;
};

/**
 * Keys with first-class runtime consumers in `web/` (excluding scripts-only demos unless noted).
 */
export const RUNTIME_METADATA_KEY_INFO: Record<string, RuntimeMetadataKeyInfo> = {
    lifecycle_progression_requirements_v1: {
        label: "Lifecycle progression requirements",
        category: "crm_attention",
        entities: ["department"],
        description:
            "Per-stage required and recommended information labels for enrollment lifecycle. Merged with platform defaults in completion preflight.",
        schemaSummary: `{ "version": 1, "stages": { "waitlist": { "required_labels": ["Child", "Program"], "recommended_labels": [] } } }`,
    },
    opportunity_attention_rules: {
        label: "Opportunity attention rules",
        category: "crm_attention",
        entities: ["work_unit", "department"],
        description:
            "Drives `resolveOpportunityAttention` / queue membership tuning via `resolveOpportunityAttentionConfigFromMetadata`. " +
            "Work-unit metadata applies on that unit’s queue path; department metadata applies for department-level preview APIs.",
        schemaSummary: `{
  "version": 1,
  "thresholdsHours": {
    "stale_new_inquiry": 48,
    "stale_qualified": 72,
    "stale_quote_followup": 72,
    "missing_quote_after_execution": 72
  },
  "stale_high_value_days": 2,
  "stale_mid_funnel_days": 7,
  "reason_overrides": {
    "follow_up_date_passed": { "enabled": true, "label": "…", "severity": "high" }
  },
  "auxiliary_signals_enabled": false
}`,
    },
    activity_signal_rules: {
        label: "Activity signal rules",
        category: "activity_signals",
        entities: ["work_unit", "department"],
        description:
            "Array consumed by Activity Signals v1 (`parseActivitySignalRulesFromMetadata` / `resolveActivitySignalRules`). " +
            "Work-unit rules win when non-empty; otherwise department rules apply.",
        schemaSummary: `[
  {
    "key": "stale_example",
    "entity_type": "opportunities",
    "label": "No activity",
    "threshold_minutes": 120,
    "severity": "medium",
    "status_keys": ["qualified", "quoted"]
  }
]`,
    },
    tenant_slice: {
        label: "Tenant slice",
        category: "tenant_routing",
        entities: ["department"],
        description:
            "Bootstrap / product routing hint: `growth` or `scaffold` (validated in tenant bootstrap payloads). " +
            "Not interpreted by opportunity attention or activity signals directly.",
    },
    placeholder: {
        label: "Placeholder (scaffold)",
        category: "internal_seed",
        entities: ["department"],
        description:
            "Set on some scaffold department seeds; no CRM drawer/queue runtime reader found in application code — treat as structural/bootstrap marker.",
    },
    lifecycle_stage: {
        label: "Lifecycle stage (bootstrap copy)",
        category: "internal_seed",
        entities: ["department"],
        description:
            "Optional string written by vertical bootstrap on department rows (must be a known stage when set). " +
            "CRM lifecycle presentation and KPI rollups use `status_definitions.metadata.lifecycle_stage`, not this department field — treat as org seed / documentation unless a future feature reads it.",
    },
};

export function metadataRootKeys(metadata: unknown): string[] {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    return Object.keys(metadata as Record<string, unknown>).sort((a, b) => a.localeCompare(b));
}

export function categorizeMetadataKey(key: string): RuntimeMetadataKeyCategory {
    const info = RUNTIME_METADATA_KEY_INFO[key];
    return info?.category ?? "unknown";
}

/** If a cataloged key appears on the wrong row type, treat as unknown so operators notice possible misconfiguration. */
export function categorizeMetadataKeyForEntity(key: string, entity: RuntimeMetadataEntity): RuntimeMetadataKeyCategory {
    const info = RUNTIME_METADATA_KEY_INFO[key];
    if (!info) return "unknown";
    if (!info.entities.includes(entity)) return "unknown";
    return info.category;
}

