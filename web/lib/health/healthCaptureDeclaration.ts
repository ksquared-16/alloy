/**
 * WHAT A FORM CAPTURES FOR MEDICAL — declared by the form, read by Processing.
 *
 * Two kinds of medical information arrive on forms in shapes a repeatable row cannot hold:
 *
 *   - the official immunization GRID (the Oregon CIS prints one box per vaccine and dose, and its
 *     fidelity PDF maps those flat fields, so they must stay flat);
 *   - a medical CONSENT (a release or treatment authorization: text the family agreed to, and the
 *     signature that agreed to it).
 *
 * The form says which of its fields mean what, in its definition's `metadata.health_capture`. The
 * form schema is untouched (it is strict and Forms-owned). Processing reads the declaration and
 * proposes records; only an operator's approval writes them, through Medical.
 *
 *   metadata.health_capture = {
 *     immunization_grid: {
 *       vaccines: [{ vaccine_key: "dtap", dose_field_ids: ["imm_dtap_dose_1", …] }, …],
 *       history: [{ vaccine_key: "varicella", field_id: "imm_had_chickenpox", state: "had_disease" }]
 *     },
 *     medical_consent: {
 *       consent_kind: "medical_records_release",
 *       text_field_ids: ["mr_authorization", "mr_purposes", "mr_limits", "mr_agreement"],
 *       signature_field_ids: ["mr_signature"]
 *     }
 *   }
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { immunizationVaccine } from "@/lib/health/immunizationVaccines";

export const MEDICAL_CONSENT_KINDS = ["medical_records_release", "emergency_medical_treatment"] as const;
export type MedicalConsentKind = (typeof MEDICAL_CONSENT_KINDS)[number];

export type ImmunizationGridDeclaration = {
    readonly vaccines: readonly { readonly vaccine_key: string; readonly dose_field_ids: readonly string[] }[];
    readonly history: readonly { readonly vaccine_key: string; readonly field_id: string; readonly state: string }[];
};

export type MedicalConsentDeclaration = {
    readonly consent_kind: MedicalConsentKind;
    readonly text_field_ids: readonly string[];
    readonly signature_field_ids: readonly string[];
};

export type HealthCaptureDeclaration = {
    readonly immunization_grid: ImmunizationGridDeclaration | null;
    readonly medical_consent: MedicalConsentDeclaration | null;
};

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);

/** Parse a definition's metadata. Anything malformed or naming an unknown vaccine is dropped, never guessed. */
export function parseHealthCaptureDeclaration(metadata: unknown): HealthCaptureDeclaration | null {
    if (!metadata || typeof metadata !== "object") return null;
    const raw = (metadata as Record<string, unknown>).health_capture;
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;

    let grid: ImmunizationGridDeclaration | null = null;
    const g = r.immunization_grid as Record<string, unknown> | undefined;
    if (g && typeof g === "object") {
        const vaccines = (Array.isArray(g.vaccines) ? g.vaccines : [])
            .map((v) => v as Record<string, unknown>)
            .filter((v) => immunizationVaccine(String(v.vaccine_key ?? "")))
            .map((v) => ({ vaccine_key: String(v.vaccine_key).trim().toLowerCase(), dose_field_ids: strings(v.dose_field_ids) }))
            .filter((v) => v.dose_field_ids.length > 0);
        const history = (Array.isArray(g.history) ? g.history : [])
            .map((h) => h as Record<string, unknown>)
            .filter((h) => immunizationVaccine(String(h.vaccine_key ?? "")) && typeof h.field_id === "string" && typeof h.state === "string")
            .map((h) => ({ vaccine_key: String(h.vaccine_key).trim().toLowerCase(), field_id: String(h.field_id), state: String(h.state) }));
        if (vaccines.length > 0 || history.length > 0) grid = { vaccines, history };
    }

    let consent: MedicalConsentDeclaration | null = null;
    const c = r.medical_consent as Record<string, unknown> | undefined;
    if (c && typeof c === "object" && (MEDICAL_CONSENT_KINDS as readonly string[]).includes(String(c.consent_kind))) {
        const signatures = strings(c.signature_field_ids);
        if (signatures.length > 0) {
            consent = {
                consent_kind: String(c.consent_kind) as MedicalConsentKind,
                text_field_ids: strings(c.text_field_ids),
                signature_field_ids: signatures,
            };
        }
    }
    return grid || consent ? { immunization_grid: grid, medical_consent: consent } : null;
}

/** version id → declaration, for the versions a case's submissions were made on. One read each way. */
export async function loadHealthCaptureDeclarations(
    supabase: SupabaseClient,
    orgId: string,
    versionIds: readonly string[],
): Promise<Map<string, HealthCaptureDeclaration>> {
    const out = new Map<string, HealthCaptureDeclaration>();
    const ids = [...new Set(versionIds.filter(Boolean))];
    if (ids.length === 0) return out;
    const { data: versions } = await supabase
        .from("form_definition_versions")
        .select("id, form_definition_id")
        .eq("org_id", orgId)
        .in("id", ids);
    const defIds = [...new Set(((versions ?? []) as { form_definition_id: string }[]).map((v) => v.form_definition_id))];
    if (defIds.length === 0) return out;
    const { data: defs } = await supabase.from("form_definitions").select("id, metadata").eq("org_id", orgId).in("id", defIds);
    const declByDef = new Map(((defs ?? []) as { id: string; metadata: unknown }[]).map((d) => [d.id, parseHealthCaptureDeclaration(d.metadata)]));
    for (const v of (versions ?? []) as { id: string; form_definition_id: string }[]) {
        const decl = declByDef.get(v.form_definition_id);
        if (decl) out.set(v.id, decl);
    }
    return out;
}
