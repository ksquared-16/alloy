/**
 * Field editability + ownership policy (Configuration / Layout Assist V1 — Card 2).
 * Stored on `field_definitions.interaction_policy` (jsonb).
 */

export const FIELD_INTERACTION_POLICY_VERSION = 1 as const;

export const FIELD_EDITABILITY_MODES = [
    "editable",
    "read_only",
    "editable_by_permission",
    "editable_through_related_record",
    "action_controlled",
    "system_controlled",
] as const;

export type FieldEditabilityMode = (typeof FIELD_EDITABILITY_MODES)[number];

export const FIELD_WRITE_BEHAVIORS = ["direct", "related_record", "none"] as const;

export type FieldWriteBehavior = (typeof FIELD_WRITE_BEHAVIORS)[number];

export type FieldOwnershipMetadataV1 = {
    source_entity: string;
    source_field: string;
    write_target_entity: string;
    write_target_field: string;
    write_behavior: FieldWriteBehavior;
    lock_reason?: string | null;
    required_permissions?: string[] | null;
};

export type FieldInteractionPolicyV1 = {
    version: typeof FIELD_INTERACTION_POLICY_VERSION;
    editability_mode: FieldEditabilityMode;
    ownership?: FieldOwnershipMetadataV1 | null;
};

export type FieldInteractionEvaluationContext = {
    permission_keys?: string[];
    /** Surface attempting edit, e.g. drawer, form. */
    surface?: string;
};

export type ResolvedFieldEditability = {
    editable: boolean;
    editability_mode: FieldEditabilityMode;
    lock_reason: string | null;
    write_target: {
        entity: string;
        field: string;
        behavior: FieldWriteBehavior;
    } | null;
    required_permissions: string[];
};

export type ParseFieldInteractionPolicyResult =
    | { ok: true; value: FieldInteractionPolicyV1 }
    | { ok: false; error: string };

function parseOwnership(raw: unknown): FieldOwnershipMetadataV1 | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;
    const source_entity = typeof o.source_entity === "string" ? o.source_entity.trim() : "";
    const source_field = typeof o.source_field === "string" ? o.source_field.trim() : "";
    const write_target_entity = typeof o.write_target_entity === "string" ? o.write_target_entity.trim() : "";
    const write_target_field = typeof o.write_target_field === "string" ? o.write_target_field.trim() : "";
    const write_behavior = o.write_behavior;
    if (!source_entity || !source_field || !write_target_entity || !write_target_field) return undefined;
    if (write_behavior !== "direct" && write_behavior !== "related_record" && write_behavior !== "none") {
        return undefined;
    }
    const required_permissions = Array.isArray(o.required_permissions)
        ? o.required_permissions.filter((x): x is string => typeof x === "string" && x.trim() !== "")
        : null;
    const lock_reason =
        o.lock_reason === undefined || o.lock_reason === null
            ? null
            : typeof o.lock_reason === "string"
              ? o.lock_reason.trim() || null
              : undefined;
    if (lock_reason === undefined) return undefined;

    return {
        source_entity,
        source_field,
        write_target_entity,
        write_target_field,
        write_behavior: write_behavior as FieldWriteBehavior,
        lock_reason,
        required_permissions,
    };
}

export function parseFieldInteractionPolicy(raw: unknown): ParseFieldInteractionPolicyResult {
    if (raw == null) {
        return { ok: false, error: "interaction_policy must be an object" };
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "interaction_policy must be an object" };
    }
    const o = raw as Record<string, unknown>;
    if (o.version !== FIELD_INTERACTION_POLICY_VERSION) {
        return { ok: false, error: `interaction_policy.version must be ${FIELD_INTERACTION_POLICY_VERSION}` };
    }
    const editability_mode = o.editability_mode;
    if (
        typeof editability_mode !== "string" ||
        !FIELD_EDITABILITY_MODES.includes(editability_mode as FieldEditabilityMode)
    ) {
        return { ok: false, error: `editability_mode must be one of: ${FIELD_EDITABILITY_MODES.join(", ")}` };
    }

    const ownership = parseOwnership(o.ownership);
    if (o.ownership !== undefined && o.ownership !== null && ownership === undefined) {
        return { ok: false, error: "ownership must include source_*, write_target_*, write_behavior" };
    }

    if (editability_mode === "editable_through_related_record") {
        if (!ownership || ownership.write_behavior !== "related_record") {
            return {
                ok: false,
                error: "editable_through_related_record requires ownership.write_behavior related_record",
            };
        }
    }

    if (editability_mode === "action_controlled" && !ownership?.lock_reason) {
        return { ok: false, error: "action_controlled requires ownership.lock_reason" };
    }

    return {
        ok: true,
        value: {
            version: FIELD_INTERACTION_POLICY_VERSION,
            editability_mode: editability_mode as FieldEditabilityMode,
            ownership: ownership ?? null,
        },
    };
}

export type FieldDefinitionInteractionSource = {
    field_key: string;
    entity_type: string;
    is_system?: boolean;
    interaction_policy?: unknown | null;
};

/** Safe defaults for legacy rows without interaction_policy. */
export function defaultInteractionPolicyForField(row: FieldDefinitionInteractionSource): FieldInteractionPolicyV1 {
    if (row.is_system) {
        return {
            version: FIELD_INTERACTION_POLICY_VERSION,
            editability_mode: "system_controlled",
            ownership: {
                source_entity: row.entity_type,
                source_field: row.field_key,
                write_target_entity: row.entity_type,
                write_target_field: row.field_key,
                write_behavior: "none",
                lock_reason: "system_controlled",
                required_permissions: null,
            },
        };
    }
    return {
        version: FIELD_INTERACTION_POLICY_VERSION,
        editability_mode: "editable",
        ownership: {
            source_entity: row.entity_type,
            source_field: row.field_key,
            write_target_entity: row.entity_type,
            write_target_field: row.field_key,
            write_behavior: "direct",
            lock_reason: null,
            required_permissions: null,
        },
    };
}

export function resolveFieldInteractionPolicy(row: FieldDefinitionInteractionSource): FieldInteractionPolicyV1 {
    if (row.interaction_policy != null) {
        const parsed = parseFieldInteractionPolicy(row.interaction_policy);
        if (parsed.ok) return parsed.value;
    }
    return defaultInteractionPolicyForField(row);
}

function permissionGate(policy: FieldInteractionPolicyV1, ctx: FieldInteractionEvaluationContext): boolean {
    const required = policy.ownership?.required_permissions ?? [];
    if (!required.length) return true;
    const keys = ctx.permission_keys ?? [];
    return required.some((p) => keys.includes(p));
}

/**
 * Resolve whether the field is editable in context and where writes should route.
 */
export function resolveFieldEditability(
    row: FieldDefinitionInteractionSource,
    ctx: FieldInteractionEvaluationContext = {}
): ResolvedFieldEditability {
    const policy = resolveFieldInteractionPolicy(row);
    const ownership = policy.ownership ?? defaultInteractionPolicyForField(row).ownership!;
    const lock_reason = ownership.lock_reason ?? null;
    const required_permissions = ownership.required_permissions ?? [];

    let editable = false;
    switch (policy.editability_mode) {
        case "editable":
            editable = true;
            break;
        case "editable_by_permission":
            editable = permissionGate(policy, ctx);
            break;
        case "editable_through_related_record":
            editable = ownership.write_behavior === "related_record" && permissionGate(policy, ctx);
            break;
        case "read_only":
        case "action_controlled":
        case "system_controlled":
            editable = false;
            break;
        default:
            editable = false;
    }

    const write_target =
        ownership.write_behavior === "none"
            ? null
            : {
                  entity: ownership.write_target_entity,
                  field: ownership.write_target_field,
                  behavior: ownership.write_behavior,
              };

    return {
        editable,
        editability_mode: policy.editability_mode,
        lock_reason,
        write_target,
        required_permissions,
    };
}

/** Whether interaction policy has a valid write path when marked editable. */
export function hasValidWriteTarget(row: FieldDefinitionInteractionSource): boolean {
    const parsed =
        row.interaction_policy != null ? parseFieldInteractionPolicy(row.interaction_policy) : null;
    if (parsed && !parsed.ok) return false;
    const policy = parsed?.ok ? parsed.value : resolveFieldInteractionPolicy(row);
    const resolved = resolveFieldEditability(
        { ...row, interaction_policy: policy },
        { permission_keys: ["__synthetic_all__"] }
    );
    if (!resolved.editable) return true;
    if (resolved.editability_mode === "read_only" || resolved.editability_mode === "system_controlled") {
        return true;
    }
    if (resolved.editability_mode === "action_controlled") {
        return resolved.write_target?.behavior === "none";
    }
    if (!resolved.write_target) return false;
    if (resolved.write_target.behavior === "none") return false;
    return Boolean(resolved.write_target.entity.trim() && resolved.write_target.field.trim());
}

export function normalizeFieldDefinitionInteractionWrite(
    interaction_policy: unknown
): { interaction_policy: FieldInteractionPolicyV1 } | { error: string } {
    const parsed = parseFieldInteractionPolicy(interaction_policy);
    if (!parsed.ok) return { error: parsed.error };
    return { interaction_policy: parsed.value };
}

/** Preset: person name field shown on opportunity, writes to person. */
export function personFieldOnOpportunityInteractionPolicy(
    personFieldKey: string
): FieldInteractionPolicyV1 {
    return {
        version: FIELD_INTERACTION_POLICY_VERSION,
        editability_mode: "editable_through_related_record",
        ownership: {
            source_entity: "opportunity",
            source_field: personFieldKey,
            write_target_entity: "person",
            write_target_field: personFieldKey,
            write_behavior: "related_record",
            lock_reason: null,
            required_permissions: null,
        },
    };
}

/** Preset: tour date on opportunity — workflow-owned. */
export function actionControlledFieldInteractionPolicy(
    entityType: string,
    fieldKey: string,
    lockReason: string
): FieldInteractionPolicyV1 {
    return {
        version: FIELD_INTERACTION_POLICY_VERSION,
        editability_mode: "action_controlled",
        ownership: {
            source_entity: entityType,
            source_field: fieldKey,
            write_target_entity: entityType,
            write_target_field: fieldKey,
            write_behavior: "none",
            lock_reason: lockReason,
            required_permissions: null,
        },
    };
}
