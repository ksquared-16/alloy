/**
 * Per-operation `after` / `before` payload shape checks (Card 5).
 * Structural only — does not hit DB.
 */

import type { ConfigurationOperationKindV1, ConfigurationOperationV1 } from "./configurationProposalV1";

export type OperationPayloadCheckResult = { ok: true } | { ok: false; error: string };

function isPlainObject(x: unknown): x is Record<string, unknown> {
    return x != null && typeof x === "object" && !Array.isArray(x);
}

function nonEmptyString(x: unknown): x is string {
    return typeof x === "string" && x.trim() !== "";
}

function checkKeys(obj: Record<string, unknown>, allowed: readonly string[], label: string): OperationPayloadCheckResult {
    for (const k of Object.keys(obj)) {
        if (!allowed.includes(k)) {
            return { ok: false, error: `${label} has unknown key: ${k}` };
        }
    }
    return { ok: true };
}

/** Validate operation-specific payload shapes. */
export function validateOperationPayloadShape(op: ConfigurationOperationV1): OperationPayloadCheckResult {
    const kind = op.kind;

    switch (kind) {
        case "create_field": {
            if (!isPlainObject(op.after)) return { ok: false, error: "create_field requires after object" };
            if (!nonEmptyString(op.after.field_key) && !nonEmptyString(op.field_key)) {
                return { ok: false, error: "create_field requires field_key in after or operation" };
            }
            if (!nonEmptyString(op.after.field_type)) {
                return { ok: false, error: "create_field requires after.field_type" };
            }
            return { ok: true };
        }
        case "update_field": {
            if (!nonEmptyString(op.field_key)) return { ok: false, error: "update_field requires field_key" };
            if (!isPlainObject(op.after)) return { ok: false, error: "update_field requires after object" };
            return { ok: true };
        }
        case "set_field_requirement": {
            if (!nonEmptyString(op.field_key)) return { ok: false, error: "set_field_requirement requires field_key" };
            if (!isPlainObject(op.after)) return { ok: false, error: "set_field_requirement requires after object" };
            if (
                op.after.requirement_policy === undefined &&
                op.after.requirement_mode === undefined &&
                op.after.mode === undefined &&
                op.after.is_required === undefined
            ) {
                return {
                    ok: false,
                    error: "set_field_requirement requires requirement_policy, requirement_mode, mode, or is_required in after",
                };
            }
            return { ok: true };
        }
        case "set_field_interaction": {
            if (!nonEmptyString(op.field_key)) return { ok: false, error: "set_field_interaction requires field_key" };
            if (!isPlainObject(op.after)) return { ok: false, error: "set_field_interaction requires after object" };
            if (op.after.interaction_policy === undefined && op.after.editability_mode === undefined) {
                return {
                    ok: false,
                    error: "set_field_interaction requires interaction_policy or editability_mode in after",
                };
            }
            return { ok: true };
        }
        case "set_field_write_target": {
            if (!nonEmptyString(op.field_key)) return { ok: false, error: "set_field_write_target requires field_key" };
            if (!isPlainObject(op.after)) return { ok: false, error: "set_field_write_target requires after object" };
            const o = op.after.ownership ?? op.after;
            if (!isPlainObject(o)) return { ok: false, error: "set_field_write_target requires ownership in after" };
            if (!nonEmptyString(o.write_target_entity) || !nonEmptyString(o.write_target_field)) {
                return {
                    ok: false,
                    error: "set_field_write_target requires write_target_entity and write_target_field",
                };
            }
            return { ok: true };
        }
        case "create_section": {
            if (!nonEmptyString(op.section_key) && !nonEmptyString(op.after?.section_key as string)) {
                return { ok: false, error: "create_section requires section_key" };
            }
            if (!isPlainObject(op.after)) return { ok: false, error: "create_section requires after object" };
            if (!nonEmptyString(op.after.label) && !nonEmptyString(op.section_key)) {
                return { ok: false, error: "create_section requires after.label or section_key" };
            }
            return { ok: true };
        }
        case "update_section": {
            if (!nonEmptyString(op.section_key)) return { ok: false, error: "update_section requires section_key" };
            if (!isPlainObject(op.after)) return { ok: false, error: "update_section requires after object" };
            return { ok: true };
        }
        case "reorder_section": {
            if (!isPlainObject(op.after)) return { ok: false, error: "reorder_section requires after object" };
            const order = op.after.section_order ?? op.after.overview_section_order;
            if (!Array.isArray(order) || !order.every((x) => typeof x === "string")) {
                return { ok: false, error: "reorder_section requires after.section_order string[]" };
            }
            return { ok: true };
        }
        case "archive_section": {
            if (!nonEmptyString(op.section_key)) return { ok: false, error: "archive_section requires section_key" };
            return { ok: true };
        }
        case "expose_field_on_layout": {
            if (!nonEmptyString(op.field_key)) return { ok: false, error: "expose_field_on_layout requires field_key" };
            if (!isPlainObject(op.after)) return { ok: false, error: "expose_field_on_layout requires after object" };
            return { ok: true };
        }
        case "hide_field_on_layout": {
            if (!nonEmptyString(op.field_key)) return { ok: false, error: "hide_field_on_layout requires field_key" };
            return { ok: true };
        }
        case "move_field_to_section": {
            if (!nonEmptyString(op.field_key)) return { ok: false, error: "move_field_to_section requires field_key" };
            if (!nonEmptyString(op.section_key) && !nonEmptyString(op.after?.section_key as string)) {
                return { ok: false, error: "move_field_to_section requires section_key" };
            }
            return { ok: true };
        }
        case "update_option_set": {
            if (!isPlainObject(op.after)) return { ok: false, error: "update_option_set requires after object" };
            if (!nonEmptyString(op.after.set_key) && !nonEmptyString(op.after.option_set_key)) {
                return { ok: false, error: "update_option_set requires after.set_key or option_set_key" };
            }
            return { ok: true };
        }
        case "data_quality_recommendation": {
            if (op.after !== null && op.after !== undefined && !isPlainObject(op.after)) {
                return { ok: false, error: "data_quality_recommendation after must be object or null" };
            }
            if (isPlainObject(op.after)) {
                const allowed = ["code", "message", "recommendation", "integrity_issue_code", "field_key", "section_key"];
                const chk = checkKeys(op.after, allowed, "data_quality_recommendation.after");
                if (!chk.ok) return chk;
            }
            return { ok: true };
        }
        default: {
            const _exhaustive: never = kind;
            return { ok: false, error: `unknown operation kind: ${String(_exhaustive)}` };
        }
    }
}
