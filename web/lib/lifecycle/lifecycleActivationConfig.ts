/**
 * Lifecycle Activation Preview — audit trail in department metadata.
 * Does not replace lifecycle_builder_v1; points at the bundle used for runtime validation.
 */

export const LIFECYCLE_ACTIVATION_METADATA_KEY = "lifecycle_activation_v1" as const;

export type LifecycleActivationV1 = {
    version: 1;
    lifecycle_name: string;
    primary_entity: "opportunity";
    /** Operator-facing primary record label (e.g. Lead). */
    primary_record_label: string;
    process_id: string;
    stage_key: string;
    stage_label: string;
    work_unit_id: string | null;
    work_unit_name: string | null;
    status_keys: string[];
    /** Parallel labels for status_keys (UI only). */
    status_labels: string[];
    action_definition_id: string | null;
    action_placement_ids: string[];
    /** True when department was created by activation preview (safe to delete). */
    activation_owned: boolean;
    completed_steps: number;
    updated_at: string;
};

export function parseLifecycleActivationV1(raw: unknown): LifecycleActivationV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return null;
    const process_id = typeof o.process_id === "string" ? o.process_id.trim() : "";
    const stage_key = typeof o.stage_key === "string" ? o.stage_key.trim() : "";
    if (!process_id || !stage_key) return null;
    const status_keys = Array.isArray(o.status_keys)
        ? o.status_keys.map((k) => String(k ?? "").trim().toLowerCase()).filter(Boolean)
        : [];
    const status_labels = Array.isArray(o.status_labels)
        ? o.status_labels.map((k) => String(k ?? "").trim()).filter(Boolean)
        : [];
    return {
        version: 1,
        lifecycle_name: typeof o.lifecycle_name === "string" ? o.lifecycle_name.trim() : "",
        primary_entity: "opportunity",
        primary_record_label:
            typeof o.primary_record_label === "string" && o.primary_record_label.trim()
                ? o.primary_record_label.trim()
                : "Lead",
        process_id,
        stage_key,
        stage_label: typeof o.stage_label === "string" ? o.stage_label.trim() : stage_key,
        work_unit_id: typeof o.work_unit_id === "string" ? o.work_unit_id.trim() : null,
        work_unit_name: typeof o.work_unit_name === "string" ? o.work_unit_name.trim() : null,
        status_keys,
        status_labels:
            status_labels.length === status_keys.length
                ? status_labels
                : status_keys.map((k) => k.replace(/_/g, " ")),
        action_definition_id:
            typeof o.action_definition_id === "string" ? o.action_definition_id.trim() : null,
        action_placement_ids: Array.isArray(o.action_placement_ids)
            ? o.action_placement_ids.map((p) => String(p ?? "").trim()).filter(Boolean)
            : [],
        activation_owned: o.activation_owned === true,
        completed_steps: typeof o.completed_steps === "number" ? o.completed_steps : 0,
        updated_at: typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
    };
}

export function mergeLifecycleActivationIntoMetadata(
    metadata: Record<string, unknown>,
    activation: LifecycleActivationV1
): Record<string, unknown> {
    return { ...metadata, [LIFECYCLE_ACTIVATION_METADATA_KEY]: activation };
}

export function lifecycleActivationFromMetadata(metadata: unknown): LifecycleActivationV1 | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    return parseLifecycleActivationV1((metadata as Record<string, unknown>)[LIFECYCLE_ACTIVATION_METADATA_KEY]);
}
