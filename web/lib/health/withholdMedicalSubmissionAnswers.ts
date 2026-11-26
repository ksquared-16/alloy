/**
 * A SUBMISSION READ WITHOUT MEDICAL ACCESS — the payload minus the child's medical answers.
 *
 * Every admin reader that returns a form submission's raw payload passes it through here with the
 * caller's grants. With `health.view` nothing changes. Without it, the answers Medical classifies
 * (`medicalFormFieldIds`) and rows of `health.*` / `medical.*` collections are removed, and the
 * payload says so (`meta.medical_answers_withheld`) — absent, never blanked into "no allergies".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { safeParseFormSchema } from "@/lib/forms/schema";
import { canViewHealth, type HealthAccessSubject } from "@/lib/health/healthAccess";
import { loadHealthCaptureDeclarations, type HealthCaptureDeclaration } from "@/lib/health/healthCaptureDeclaration";
import { medicalFormFieldIds } from "@/lib/health/medicalFormAnswers";

type Payload = { values?: Record<string, unknown>; groups?: Record<string, unknown>; meta?: Record<string, unknown> } & Record<string, unknown>;

export function withholdMedicalAnswersFromPayload(schemaJson: unknown, declaration: HealthCaptureDeclaration | null | undefined, payload: unknown): unknown {
    if (!payload || typeof payload !== "object") return payload;
    const parsed = safeParseFormSchema(schemaJson);
    const p = payload as Payload;
    // A payload whose form cannot be read is withheld whole: we cannot tell what is medical in it.
    if (!parsed.success) return { meta: { ...(p.meta ?? {}), medical_answers_withheld: true, answers_withheld_reason: "form_unreadable" } };
    const medical = medicalFormFieldIds(parsed.data, declaration);
    let withheld = false;
    const values = { ...(p.values ?? {}) };
    for (const id of Object.keys(values)) if (medical.has(id)) { delete values[id]; withheld = true; }
    const groups = { ...(p.groups ?? {}) };
    for (const id of Object.keys(groups)) if (medical.has(id)) { delete groups[id]; withheld = true; }
    if (!withheld) return payload;
    return { ...p, values, groups, meta: { ...(p.meta ?? {}), medical_answers_withheld: true } };
}

/**
 * Withhold medical answers from loaded submission rows (each with `payload` and
 * `form_definition_version_id`), for a caller without `health.view`. Rows are returned as new
 * objects; the stored submission is never touched.
 */
export async function withholdMedicalAnswersFromSubmissions<T extends { payload?: unknown; form_definition_version_id?: string | null }>(
    supabase: SupabaseClient,
    orgId: string,
    rows: readonly T[],
    health: HealthAccessSubject,
): Promise<T[]> {
    if (canViewHealth(health) || rows.length === 0) return [...rows];
    const versionIds = [...new Set(rows.map((r) => r.form_definition_version_id).filter((v): v is string => Boolean(v)))];
    const schemas = new Map<string, unknown>();
    if (versionIds.length > 0) {
        const { data, error } = await supabase.from("form_definition_versions").select("id, schema_json").eq("org_id", orgId).in("id", versionIds);
        if (error) throw new Error(error.message);
        for (const v of (data ?? []) as { id: string; schema_json: unknown }[]) schemas.set(v.id, v.schema_json);
    }
    const declarations = await loadHealthCaptureDeclarations(supabase, orgId, versionIds);
    return rows.map((r) => {
        if (!("payload" in r)) return r;
        const vid = r.form_definition_version_id ?? "";
        return { ...r, payload: withholdMedicalAnswersFromPayload(schemas.get(vid) ?? null, declarations.get(vid), r.payload) };
    });
}
