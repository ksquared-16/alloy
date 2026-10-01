/**
 * Creating a destination for a question that came off an imported form.
 *
 * The operator is looking at a field on their own paperwork that Alloy has nowhere to put. The fix they
 * want is "then make somewhere" — and the only correct way to do that is the configuration API every
 * other custom field goes through, so the new field is org-scoped, typed, visible in the field
 * configuration surface, and usable by anything else that reads fields. A Forms-only shadow registry
 * would make the field work on this one draft and nowhere else, which is the failure mode this module
 * exists to avoid.
 *
 * So this file is only the TRANSLATION: a label on a page becomes a valid `field_definitions` POST body
 * and the mapping choice that points the question at it. It performs no I/O, which is what lets the
 * naming rules be tested without a server.
 */

import type { MappingChoice } from "./buildMappingChangePayload";

/** Matches the API's own `FIELD_KEY_REGEX`. Kept here so an invalid key is caught before the request. */
const FIELD_KEY = /^[a-z0-9_]{2,64}$/;

/**
 * The storage key a source label becomes.
 *
 * Named from the source field, because the operator recognises their own wording and nothing else. The
 * key is derived rather than asked for: an operator should never have to invent `student_dob`.
 */
export function fieldKeyFromLabel(label: string): string | null {
    const key = label
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64)
        .replace(/_+$/g, "");
    return FIELD_KEY.test(key) ? key : null;
}

export type CreateFieldRequest = {
    readonly entity_type: string;
    readonly field_key: string;
    readonly field_type: string;
    readonly label: string;
    /** Imported fields are grouped together so an operator can find what an import added. */
    readonly section_key: string;
    readonly config?: { readonly options: readonly string[] };
};

export type CreateFieldPlan =
    | { readonly ok: true; readonly request: CreateFieldRequest; readonly choice: MappingChoice }
    | { readonly ok: false; readonly reason: "unusable_name" | "unknown_entity" | "unusable_type" };

/** The entities an imported question can belong to, in the operator's words. */
export const CREATE_FIELD_ENTITIES = ["customer_member", "person", "customer"] as const;

const FIELD_TYPES = ["text", "number", "date", "boolean", "select", "multiselect"] as const;

export function planCreateFieldFromSource(input: {
    readonly label: string;
    readonly entityType: string;
    readonly fieldType: string;
    readonly options?: readonly string[];
}): CreateFieldPlan {
    if (!(CREATE_FIELD_ENTITIES as readonly string[]).includes(input.entityType)) {
        return { ok: false, reason: "unknown_entity" };
    }
    if (!(FIELD_TYPES as readonly string[]).includes(input.fieldType)) {
        return { ok: false, reason: "unusable_type" };
    }
    const label = input.label.trim();
    const field_key = fieldKeyFromLabel(label);
    if (!field_key) return { ok: false, reason: "unusable_name" };

    /*
     * A select with no choices is rejected by the configuration API, and rightly — a choice field
     * nobody can choose from is not a field. The source's own options are carried over when it had
     * them; when it did not, the question is stored as text rather than as a broken select.
     */
    const choices = (input.options ?? []).map((o) => o.trim()).filter(Boolean);
    const needsChoices = input.fieldType === "select" || input.fieldType === "multiselect";
    const field_type = needsChoices && choices.length === 0 ? "text" : input.fieldType;

    return {
        ok: true,
        request: {
            entity_type: input.entityType,
            field_key,
            field_type,
            label,
            section_key: "imported",
            ...(needsChoices && choices.length ? { config: { options: choices } } : {}),
        },
        choice: {
            id: `created:${input.entityType}:${field_key}`,
            label,
            destination: { entity_type: input.entityType, field_key },
        },
    };
}
