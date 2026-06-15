/**
 * POS-FP5 — minimal destination handoff (validation slice).
 *
 * Proves the doctrine "Processing does not own truth": on approval, the realized
 * change lands on a canonical record (a CRM person), owned by CRM — Processing only
 * references it. This is intentionally the smallest real write, NOT the Outcome
 * Engine. For a form-submission source we extract a contact from the submission
 * payload and create-or-link a `persons` row; anything else (or a payload with no
 * email) is a safe no-op route that still completes the case.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface HandoffResult {
    kind: "person" | "routed";
    recordType?: string;
    recordId?: string;
    created?: boolean;
    note?: string;
}

export interface ExtractedContact {
    email: string | null;
    firstName: string | null;
    lastName: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIRST_KEYS = ["first_name", "firstname", "first", "given_name"];
const LAST_KEYS = ["last_name", "lastname", "last", "family_name", "surname"];

/**
 * Pure: pull a best-effort contact out of an arbitrary form-submission payload.
 * Unit-testable without a database (covered by the substitute gate).
 */
export function extractContactFromPayload(payload: Record<string, unknown>): ExtractedContact {
    const entries = Object.entries(payload ?? {});

    let email: string | null = null;
    for (const [, v] of entries) {
        if (typeof v === "string" && EMAIL_RE.test(v.trim())) {
            email = v.trim().toLowerCase();
            break;
        }
    }

    const pick = (keys: string[]): string | null => {
        for (const [k, v] of entries) {
            if (keys.includes(k.toLowerCase()) && typeof v === "string" && v.trim()) {
                return v.trim();
            }
        }
        return null;
    };

    return { email, firstName: pick(FIRST_KEYS), lastName: pick(LAST_KEYS) };
}

/**
 * Run the minimal canonical write for a Processing Case's primary source.
 * Never throws on "nothing to promote" — returns a `routed` result so the case
 * still completes; throws only on a genuine DB failure.
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
        .select("payload")
        .eq("org_id", orgId)
        .eq("id", source.source_id)
        .maybeSingle();
    if (subErr) throw new Error(subErr.message);

    const payload = ((sub as { payload?: Record<string, unknown> } | null)?.payload ?? {});
    const { email, firstName, lastName } = extractContactFromPayload(payload);
    if (!email) {
        return { kind: "routed", note: "Submission has no email field; nothing promoted." };
    }

    const { data: existing, error: lookupErr } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);
    if (existing && typeof (existing as { id?: string }).id === "string") {
        return { kind: "person", recordType: "person", recordId: (existing as { id: string }).id, created: false };
    }

    const { data: inserted, error: insertErr } = await supabase
        .from("persons")
        .insert({ org_id: orgId, email, first_name: firstName, last_name: lastName })
        .select("id")
        .single();
    if (insertErr || !inserted) throw new Error(insertErr?.message ?? "Could not create person");
    return { kind: "person", recordType: "person", recordId: (inserted as { id: string }).id, created: true };
}
