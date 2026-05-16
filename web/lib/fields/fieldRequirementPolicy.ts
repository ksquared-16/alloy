/**
 * Field requirement policy (Configuration / Layout Assist V1 — Card 1).
 * Stored on `field_definitions.requirement_policy` (jsonb). `is_required` remains for legacy UI/API.
 */

export const FIELD_REQUIREMENT_POLICY_VERSION = 1 as const;

export const FIELD_REQUIREMENT_MODES = [
    "required",
    "optional",
    "conditionally_required",
    "required_on_save",
    "required_before_status_change",
    "required_before_action",
] as const;

export type FieldRequirementMode = (typeof FIELD_REQUIREMENT_MODES)[number];

export const FIELD_REQUIREMENT_VALIDATION_SCOPES = ["save", "status_change", "action", "all"] as const;

export type FieldRequirementValidationScope = (typeof FIELD_REQUIREMENT_VALIDATION_SCOPES)[number];

/** Simple v1 predicate for conditionally_required (extensible later). */
export type FieldRequirementConditionV1 = {
    field_key: string;
    op: "eq" | "neq" | "empty" | "not_empty";
    value?: string | number | boolean | null;
};

export type FieldRequirementPolicyV1 = {
    version: typeof FIELD_REQUIREMENT_POLICY_VERSION;
    mode: FieldRequirementMode;
    validation_message?: string | null;
    validation_scope?: FieldRequirementValidationScope | null;
    /** Future-ready: require only when actor has one of these role_keys. */
    required_by_role?: string[] | null;
    /** Future-ready: require only when entity status is in this set. */
    required_by_status?: string[] | null;
    /** For required_before_status_change — target status keys on transition. */
    status_keys?: string[] | null;
    /** For required_before_action — admin/workflow action keys. */
    action_keys?: string[] | null;
    condition?: FieldRequirementConditionV1 | null;
};

export type FieldRequirementEvaluationPhase = "save" | "status_change" | "action" | "display";

export type FieldRequirementEvaluationContext = {
    phase: FieldRequirementEvaluationPhase;
    /** Current or target status when phase involves status. */
    status_key?: string | null;
    action_key?: string | null;
    role_keys?: string[];
    values?: Record<string, unknown>;
};

export type FieldRequirementViolation = {
    code: "required" | "conditionally_required" | "required_on_save" | "required_before_status_change" | "required_before_action";
    field_key: string;
    message: string;
    mode: FieldRequirementMode;
};

export type ParseFieldRequirementPolicyResult =
    | { ok: true; value: FieldRequirementPolicyV1 }
    | { ok: false; error: string };

function isNonEmptyStringArray(x: unknown): x is string[] {
    return Array.isArray(x) && x.every((v) => typeof v === "string" && v.trim() !== "");
}

function parseCondition(raw: unknown): FieldRequirementConditionV1 | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;
    const field_key = typeof o.field_key === "string" ? o.field_key.trim() : "";
    const op = o.op;
    if (!field_key) return undefined;
    if (op !== "eq" && op !== "neq" && op !== "empty" && op !== "not_empty") return undefined;
    const cond: FieldRequirementConditionV1 = { field_key, op };
    if ("value" in o) cond.value = o.value as string | number | boolean | null;
    return cond;
}

/** Parse and normalize requirement policy JSON (strict shape). */
export function parseFieldRequirementPolicy(raw: unknown): ParseFieldRequirementPolicyResult {
    if (raw == null) {
        return { ok: false, error: "requirement_policy must be an object" };
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "requirement_policy must be an object" };
    }
    const o = raw as Record<string, unknown>;
    if (o.version !== FIELD_REQUIREMENT_POLICY_VERSION) {
        return { ok: false, error: `requirement_policy.version must be ${FIELD_REQUIREMENT_POLICY_VERSION}` };
    }
    const mode = o.mode;
    if (typeof mode !== "string" || !FIELD_REQUIREMENT_MODES.includes(mode as FieldRequirementMode)) {
        return { ok: false, error: `requirement_policy.mode must be one of: ${FIELD_REQUIREMENT_MODES.join(", ")}` };
    }

    const validation_scope = o.validation_scope;
    if (
        validation_scope !== undefined &&
        validation_scope !== null &&
        (typeof validation_scope !== "string" ||
            !FIELD_REQUIREMENT_VALIDATION_SCOPES.includes(validation_scope as FieldRequirementValidationScope))
    ) {
        return { ok: false, error: `validation_scope must be one of: ${FIELD_REQUIREMENT_VALIDATION_SCOPES.join(", ")}` };
    }

    if (o.required_by_role !== undefined && o.required_by_role !== null && !isNonEmptyStringArray(o.required_by_role)) {
        return { ok: false, error: "required_by_role must be an array of non-empty strings" };
    }
    if (o.required_by_status !== undefined && o.required_by_status !== null && !isNonEmptyStringArray(o.required_by_status)) {
        return { ok: false, error: "required_by_status must be an array of non-empty strings" };
    }
    if (mode === "required_before_status_change") {
        if (!isNonEmptyStringArray(o.status_keys)) {
            return { ok: false, error: "required_before_status_change requires status_keys[]" };
        }
    }
    if (mode === "required_before_action") {
        if (!isNonEmptyStringArray(o.action_keys)) {
            return { ok: false, error: "required_before_action requires action_keys[]" };
        }
    }
    if (mode === "conditionally_required") {
        const cond = parseCondition(o.condition);
        if (!cond) {
            return { ok: false, error: "conditionally_required requires condition { field_key, op }" };
        }
    }

    const validation_message =
        o.validation_message === undefined || o.validation_message === null
            ? null
            : typeof o.validation_message === "string"
              ? o.validation_message.trim() || null
              : undefined;
    if (validation_message === undefined) {
        return { ok: false, error: "validation_message must be a string or null" };
    }

    const value: FieldRequirementPolicyV1 = {
        version: FIELD_REQUIREMENT_POLICY_VERSION,
        mode: mode as FieldRequirementMode,
        validation_message,
        validation_scope: (validation_scope as FieldRequirementValidationScope | null) ?? "save",
        required_by_role: (o.required_by_role as string[] | null) ?? null,
        required_by_status: (o.required_by_status as string[] | null) ?? null,
        status_keys: (o.status_keys as string[] | null) ?? null,
        action_keys: (o.action_keys as string[] | null) ?? null,
        condition: mode === "conditionally_required" ? parseCondition(o.condition)! : (parseCondition(o.condition) ?? null),
    };

    return { ok: true, value };
}

/** Derive policy from legacy `is_required` when column is null. */
export function requirementPolicyFromLegacyIsRequired(is_required: boolean): FieldRequirementPolicyV1 {
    return {
        version: FIELD_REQUIREMENT_POLICY_VERSION,
        mode: is_required ? "required" : "optional",
        validation_scope: "save",
        validation_message: null,
        required_by_role: null,
        required_by_status: null,
        status_keys: null,
        action_keys: null,
        condition: null,
    };
}

export type FieldDefinitionRequirementSource = {
    field_key: string;
    is_required?: boolean;
    requirement_policy?: unknown | null;
};

/** Effective policy: column → legacy boolean. */
export function resolveFieldRequirementPolicy(row: FieldDefinitionRequirementSource): FieldRequirementPolicyV1 {
    if (row.requirement_policy != null) {
        const parsed = parseFieldRequirementPolicy(row.requirement_policy);
        if (parsed.ok) return parsed.value;
    }
    return requirementPolicyFromLegacyIsRequired(!!row.is_required);
}

/** Map policy mode to legacy boolean for DB/UI compatibility. */
export function legacyIsRequiredFromPolicy(policy: FieldRequirementPolicyV1): boolean {
    return policy.mode === "required" || policy.mode === "required_on_save";
}

function scopeApplies(policy: FieldRequirementPolicyV1, phase: FieldRequirementEvaluationPhase): boolean {
    const scope = policy.validation_scope ?? "save";
    if (scope === "all") return true;
    if (scope === "save" && phase === "save") return true;
    if (scope === "status_change" && phase === "status_change") return true;
    if (scope === "action" && phase === "action") return true;
    return false;
}

function roleGatePasses(policy: FieldRequirementPolicyV1, ctx: FieldRequirementEvaluationContext): boolean {
    const roles = policy.required_by_role;
    if (!roles?.length) return true;
    const actor = ctx.role_keys ?? [];
    return roles.some((r) => actor.includes(r));
}

function statusGatePasses(policy: FieldRequirementPolicyV1, ctx: FieldRequirementEvaluationContext): boolean {
    const statuses = policy.required_by_status;
    if (!statuses?.length) return true;
    const sk = ctx.status_key?.trim();
    if (!sk) return false;
    return statuses.includes(sk);
}

function evaluateCondition(cond: FieldRequirementConditionV1, values: Record<string, unknown>): boolean {
    const raw = values[cond.field_key];
    switch (cond.op) {
        case "empty":
            return raw === null || raw === undefined || raw === "";
        case "not_empty":
            return raw !== null && raw !== undefined && raw !== "";
        case "eq":
            return raw === cond.value;
        case "neq":
            return raw !== cond.value;
        default:
            return false;
    }
}

function isValueEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

/**
 * Whether the field is required in the given evaluation context.
 * Does not check visibility — pair with layout integrity for "required but hidden".
 */
export function isFieldRequiredInContext(
    row: FieldDefinitionRequirementSource,
    ctx: FieldRequirementEvaluationContext,
    value?: unknown
): boolean {
    const policy = resolveFieldRequirementPolicy(row);
    if (!roleGatePasses(policy, ctx)) return false;
    if (!statusGatePasses(policy, ctx)) return false;

    const values = ctx.values ?? {};
    const v = value !== undefined ? value : values[row.field_key];

    switch (policy.mode) {
        case "optional":
            return false;
        case "required":
            return scopeApplies(policy, ctx.phase) || ctx.phase === "display";
        case "required_on_save":
            return ctx.phase === "save";
        case "required_before_status_change": {
            if (ctx.phase !== "status_change") return false;
            const keys = policy.status_keys ?? [];
            const target = ctx.status_key?.trim();
            if (!target || !keys.includes(target)) return false;
            return isValueEmpty(v);
        }
        case "required_before_action": {
            if (ctx.phase !== "action") return false;
            const keys = policy.action_keys ?? [];
            const ak = ctx.action_key?.trim();
            if (!ak || !keys.includes(ak)) return false;
            return isValueEmpty(v);
        }
        case "conditionally_required": {
            if (!policy.condition) return false;
            if (!evaluateCondition(policy.condition, values)) return false;
            return isValueEmpty(v);
        }
        default:
            return false;
    }
}

/** Collect violations for enforcement (empty value + required in context). */
export function evaluateFieldRequirementViolations(
    row: FieldDefinitionRequirementSource,
    ctx: FieldRequirementEvaluationContext,
    value?: unknown
): FieldRequirementViolation[] {
    const policy = resolveFieldRequirementPolicy(row);
    const v = value !== undefined ? value : ctx.values?.[row.field_key];
    if (!isFieldRequiredInContext(row, ctx, v)) return [];
    if (!isValueEmpty(v)) return [];

    const message =
        policy.validation_message?.trim() ||
        `Field "${row.field_key}" is required (${policy.mode}).`;

    return [
        {
            code:
                policy.mode === "required_on_save"
                    ? "required_on_save"
                    : policy.mode === "required_before_status_change"
                      ? "required_before_status_change"
                      : policy.mode === "required_before_action"
                        ? "required_before_action"
                        : policy.mode === "conditionally_required"
                          ? "conditionally_required"
                          : "required",
            field_key: row.field_key,
            message,
            mode: policy.mode,
        },
    ];
}

/** Merge policy + sync legacy boolean for persistence. */
export function normalizeFieldDefinitionRequirementWrite(input: {
    is_required?: boolean;
    requirement_policy?: unknown | null;
}): { requirement_policy: FieldRequirementPolicyV1; is_required: boolean } | { error: string } {
    if (input.requirement_policy !== undefined && input.requirement_policy !== null) {
        const parsed = parseFieldRequirementPolicy(input.requirement_policy);
        if (!parsed.ok) return { error: parsed.error };
        return {
            requirement_policy: parsed.value,
            is_required: legacyIsRequiredFromPolicy(parsed.value),
        };
    }
    if (input.is_required !== undefined) {
        const policy = requirementPolicyFromLegacyIsRequired(!!input.is_required);
        return { requirement_policy: policy, is_required: !!input.is_required };
    }
    return { error: "Either is_required or requirement_policy is required" };
}
