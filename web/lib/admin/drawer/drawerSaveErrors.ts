/**
 * Card 4 — Parse structured field-policy validation errors from admin PATCH responses.
 */

import {
    FIELD_POLICY_VALIDATION_ERROR,
    type FieldPolicyPatchViolation,
} from "@/lib/fields/enforceDrawerFieldPoliciesOnPatch";

export type ParsedDrawerFieldPolicySaveError = {
    violations: FieldPolicyPatchViolation[];
    globalMessage: string;
    byFieldKey: Record<string, string>;
};

function isViolationRow(v: unknown): v is FieldPolicyPatchViolation {
    if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>;
    return typeof o.field_key === "string" && typeof o.message === "string";
}

/** Parse opportunity/job PATCH 400 field validation payload. */
export function parseDrawerFieldPolicySaveResponse(json: unknown): ParsedDrawerFieldPolicySaveError | null {
    if (json == null || typeof json !== "object" || Array.isArray(json)) return null;
    const o = json as Record<string, unknown>;
    const err = typeof o.error === "string" ? o.error.trim() : "";
    const raw = o.violations;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    if (err !== FIELD_POLICY_VALIDATION_ERROR && !raw.every(isViolationRow)) return null;

    const violations = raw.filter(isViolationRow).map((v) => ({
        field_key: v.field_key.trim(),
        code:
            v.code === "required_on_save" || v.code === "read_only" || v.code === "required"
                ? v.code
                : "required",
        message: v.message.trim() || `Validation failed for ${v.field_key}.`,
    }));
    if (violations.length === 0) return null;

    const byFieldKey = violationsToFieldErrorMap(violations);
    const globalMessage = err || FIELD_POLICY_VALIDATION_ERROR;

    return { violations, globalMessage, byFieldKey };
}

export function violationsToFieldErrorMap(violations: FieldPolicyPatchViolation[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const v of violations) {
        const key = v.field_key.trim();
        if (!key) continue;
        if (!out[key]) out[key] = v.message;
    }
    return out;
}

/** Human-readable summary for global save banner (includes field labels when known). */
export function buildFieldValidationSummary(
    violations: FieldPolicyPatchViolation[],
    labelByFieldKey: Record<string, string> = {}
): string {
    if (violations.length === 0) return FIELD_POLICY_VALIDATION_ERROR;
    if (violations.length === 1) {
        const v = violations[0]!;
        const label = labelByFieldKey[v.field_key] ?? v.field_key;
        return `${label}: ${v.message}`;
    }
    const parts = violations.map((v) => {
        const label = labelByFieldKey[v.field_key] ?? v.field_key;
        return `${label} — ${v.message}`;
    });
    return `${FIELD_POLICY_VALIDATION_ERROR} (${violations.length} fields)`;
}

export function listUnmappedFieldValidationErrors(
    byFieldKey: Record<string, string>,
    visibleFieldKeys: Set<string>,
    labelByFieldKey: Record<string, string> = {}
): { field_key: string; message: string; label: string }[] {
    const out: { field_key: string; message: string; label: string }[] = [];
    for (const [field_key, message] of Object.entries(byFieldKey)) {
        if (visibleFieldKeys.has(field_key)) continue;
        out.push({ field_key, message, label: labelByFieldKey[field_key] ?? field_key });
    }
    return out;
}
