/**
 * POS-FP7 — binding-driven destination handoff.
 *
 * Proves the doctrine "Processing does not own truth": on approval, the realized
 * change lands on a canonical record (a CRM person), owned by CRM — Processing only
 * references it. This is the smallest real write, NOT the Outcome Engine.
 *
 * FP7 replaces the FP5 email-regex guess with the MEANING layer: a form field is a
 * person field only when its `field_source` binds it (`entity_type: "person"`,
 * `field_key: "email" | "first_name" | "last_name"`). We promote the BOUND values.
 * If no field is mapped to `person.email`, we do NOT guess — we return a
 * `needs_mapping` result and create nothing, so an operator can fix the mapping.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { safeParseFormSchema, type FormField } from "@/lib/forms/schema";

export interface HandoffResult {
    kind: "person" | "routed" | "needs_mapping";
    recordType?: string;
    recordId?: string;
    created?: boolean;
    note?: string;
}

export interface BoundPerson {
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    /** True when the form schema binds a field to person.email (regardless of value). */
    hasEmailBinding: boolean;
}

/**
 * Pure: resolve a submission's values to the person fields its bindings declare.
 * No guessing — only fields whose `field_source` targets person are considered.
 * Unit-testable without a database (covered by the substitute gate).
 */
export function extractBoundPerson(schemaJson: unknown, values: Record<string, unknown>): BoundPerson {
    const parsed = safeParseFormSchema(schemaJson);
    if (!parsed.success) return { email: null, phone: null, firstName: null, lastName: null, hasEmailBinding: false };

    let email: string | null = null;
    let phone: string | null = null;
    let firstName: string | null = null;
    let lastName: string | null = null;
    let hasEmailBinding = false;

    const valueFor = (id: string): string | null => {
        const raw = values[id];
        if (raw == null) return null;
        const s = typeof raw === "string" ? raw.trim() : String(raw);
        return s.length > 0 ? s : null;
    };

    const walk = (fields: FormField[]) => {
        for (const f of fields) {
            if (f.type === "group") {
                walk(f.fields);
                continue;
            }
            const src = f.field_source;
            if (!src || src.entity_type !== "person") continue;
            if (src.field_key === "email") {
                hasEmailBinding = true;
                const v = valueFor(f.id);
                if (v) email = v.toLowerCase();
            } else if (src.field_key === "phone") {
                phone = valueFor(f.id) ?? phone;
            } else if (src.field_key === "first_name") {
                firstName = valueFor(f.id) ?? firstName;
            } else if (src.field_key === "last_name") {
                lastName = valueFor(f.id) ?? lastName;
            }
        }
    };
    walk(parsed.data.fields);

    return { email, phone, firstName, lastName, hasEmailBinding };
}

/**
 * Run the minimal canonical write for a Processing Case's primary source.
 * Promotes the BOUND person fields. Returns `needs_mapping` (and creates nothing)
 * when the form has no `person.email` binding or that field had no value, so the
 * approval is honest rather than guessed. Throws only on a genuine DB failure.
 */
export async function runMinimalDestinationHandoff(
    supabase: SupabaseClient,
    orgId: string,
    source: { source_kind: string; source_id: string } | null
): Promise<HandoffResult> {
    if (!source || source.source_kind !== "form_submission") {
        return { kind: "routed", note: "No form-submission source to promote." };
    }

    const { data: sub, error: subErr } = await supabase
        .from("form_submissions")
        .select("payload, form_definition_version_id")
        .eq("org_id", orgId)
        .eq("id", source.source_id)
        .maybeSingle();
    if (subErr) throw new Error(subErr.message);
    const subRow = sub as { payload?: Record<string, unknown>; form_definition_version_id?: string | null } | null;
    if (!subRow) return { kind: "routed", note: "Submission not found." };

    const valuesRaw = subRow.payload?.values;
    const values =
        valuesRaw && typeof valuesRaw === "object" && !Array.isArray(valuesRaw)
            ? (valuesRaw as Record<string, unknown>)
            : {};

    let schemaJson: unknown = null;
    if (subRow.form_definition_version_id) {
        const { data: ver, error: verErr } = await supabase
            .from("form_definition_versions")
            .select("schema_json")
            .eq("org_id", orgId)
            .eq("id", subRow.form_definition_version_id)
            .maybeSingle();
        if (verErr) throw new Error(verErr.message);
        schemaJson = (ver as { schema_json?: unknown } | null)?.schema_json ?? null;
    }

    const bound = extractBoundPerson(schemaJson, values);
    if (!bound.hasEmailBinding) {
        return {
            kind: "needs_mapping",
            note: "No form field is mapped to person.email. Map one in the form editor, then re-approve.",
        };
    }
    if (!bound.email) {
        return {
            kind: "needs_mapping",
            note: "The field mapped to person.email had no value in this submission.",
        };
    }

    const { data: existing, error: lookupErr } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .ilike("email", bound.email)
        .limit(1)
        .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);
    if (existing && typeof (existing as { id?: string }).id === "string") {
        return { kind: "person", recordType: "person", recordId: (existing as { id: string }).id, created: false };
    }

    const { data: inserted, error: insertErr } = await supabase
        .from("persons")
        .insert({ org_id: orgId, email: bound.email, first_name: bound.firstName, last_name: bound.lastName })
        .select("id")
        .single();
    if (insertErr || !inserted) throw new Error(insertErr?.message ?? "Could not create person");
    return { kind: "person", recordType: "person", recordId: (inserted as { id: string }).id, created: true };
}
