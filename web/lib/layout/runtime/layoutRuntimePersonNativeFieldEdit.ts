/**
 * Layout runtime person native + field_values edits (employee, employer, consent).
 */

import { patchLinkedPersonFromOpportunityDrawer } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { normalizeRefKeyOnRead, parseLayoutRefKey } from "@/lib/layout/layoutRefKeyAliases";
import { resolveLayoutRuntimePersonId } from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export const LAYOUT_RUNTIME_PERSON_NATIVE_EDITABLE_REF_KEYS = [
    "person.is_employee",
    "person.employee_id",
    "person.employer",
    "person.sms_opt_in",
    "person.email_opt_in",
    "person.communication_opt_out",
] as const;

const PERSON_NATIVE_EDITABLE_REF_KEY_SET = new Set<string>(LAYOUT_RUNTIME_PERSON_NATIVE_EDITABLE_REF_KEYS);

export function isLayoutRuntimePersonNativeEditableRefKey(refKey: string): boolean {
    return PERSON_NATIVE_EDITABLE_REF_KEY_SET.has(normalizeRefKeyOnRead(refKey.trim()));
}

function personFieldKeyFromRefKey(refKey: string): string | null {
    const normalized = normalizeRefKeyOnRead(refKey.trim());
    if (!PERSON_NATIVE_EDITABLE_REF_KEY_SET.has(normalized)) return null;
    const { fieldKey } = parseLayoutRefKey(normalized);
    return fieldKey || null;
}

function readBooleanDraftValue(raw: unknown): string {
    if (raw === true || raw === "true" || raw === "Yes" || raw === "yes") return "true";
    if (raw === false || raw === "false" || raw === "No" || raw === "no") return "false";
    return "";
}

export function readLayoutRuntimePersonNativeFieldValue(record: ProofRuntimeRecord, refKey: string): string {
    const fieldKey = personFieldKeyFromRefKey(refKey);
    if (!fieldKey) return "";
    const normalized = normalizeRefKeyOnRead(refKey.trim());
    const raw = record[normalized] ?? record[fieldKey];
    if (fieldKey === "is_employee" || fieldKey.endsWith("_opt_in") || fieldKey === "communication_opt_out") {
        return readBooleanDraftValue(raw);
    }
    return raw == null ? "" : String(raw).trim();
}

export function collectLayoutRuntimePersonNativeBaseline(record: ProofRuntimeRecord): Record<string, string> {
    const baseline: Record<string, string> = {};
    for (const refKey of LAYOUT_RUNTIME_PERSON_NATIVE_EDITABLE_REF_KEYS) {
        baseline[refKey] = readLayoutRuntimePersonNativeFieldValue(record, refKey);
    }
    return baseline;
}

function patchValueForFieldKey(fieldKey: string, draftValue: string): unknown {
    if (fieldKey === "is_employee") return draftValue === "true";
    if (fieldKey === "employee_id") return draftValue.trim() || null;
    if (fieldKey === "employer") return draftValue.trim() || null;
    if (fieldKey === "sms_opt_in" || fieldKey === "email_opt_in" || fieldKey === "communication_opt_out") {
        if (draftValue === "true") return true;
        if (draftValue === "false") return false;
        return null;
    }
    return draftValue.trim() || null;
}

export function buildLayoutRuntimePersonNativePatch(
    baseline: Record<string, string>,
    draft: Record<string, string>,
): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const refKey of LAYOUT_RUNTIME_PERSON_NATIVE_EDITABLE_REF_KEYS) {
        const fieldKey = personFieldKeyFromRefKey(refKey);
        if (!fieldKey) continue;
        const base = (baseline[refKey] ?? "").trim();
        const next = (draft[refKey] ?? "").trim();
        if (base === next) continue;
        patch[fieldKey] = patchValueForFieldKey(fieldKey, next);
    }

    if (patch.is_employee === false && !("employee_id" in patch)) {
        patch.employee_id = null;
    }

    return patch;
}

export async function saveLayoutRuntimePersonNativeEdits(input: {
    record: ProofRuntimeRecord;
    baseline: Record<string, string>;
    draft: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const body = buildLayoutRuntimePersonNativePatch(input.baseline, input.draft);
    if (Object.keys(body).length === 0) return { ok: true };

    const personId = resolveLayoutRuntimePersonId(input.record);
    if (!personId) return { ok: false, error: "Person record is missing an id for save." };

    const result = await patchLinkedPersonFromOpportunityDrawer({ personId, body });
    if (!result.ok) return { ok: false, error: result.error ?? "Person save failed" };

    for (const refKey of LAYOUT_RUNTIME_PERSON_NATIVE_EDITABLE_REF_KEYS) {
        const fieldKey = personFieldKeyFromRefKey(refKey);
        if (!fieldKey || !(fieldKey in body)) continue;
        const next = input.draft[refKey] ?? "";
        input.record[refKey] = fieldKey === "is_employee" ? next === "true" : next;
        input.record[fieldKey] = body[fieldKey];
    }

    return { ok: true };
}
