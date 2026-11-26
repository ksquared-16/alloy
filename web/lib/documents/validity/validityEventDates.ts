/**
 * D7 batch B2 — the authoritative event dates an event-renewal validity policy resolves from.
 *
 *   child     birthday ← customer_members.dob; enrollment starts ← child_enrollment_agreements.start_date for agreements
 *             that represented (or will represent) service: pending_start, active, ending, ended. Canceled and voided
 *             agreements never did, so they renew nothing.
 *   person    birthday ← persons.date_of_birth; no enrollment of their own.
 *   household / opportunity   no birthday and no enrollment of their own — every event is unavailable.
 *
 * Read with the service-role client inside the caller's organization, only for subjects the caller already evaluates;
 * no date is ever returned to a client here — it only shapes the validity verdict. A failed read returns `null` (the
 * caller then reports `event_dates_not_resolved` rather than a guessed date).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ValidityEventDates } from "@/lib/documents/validity/documentValidity";

export const SERVICE_ENROLLMENT_STATUSES = Object.freeze(["pending_start", "active", "ending", "ended"] as const);

export type EventSubjectRef = { subject_type: string; subject_id: string };

const CHUNK = 150;
function chunks<T>(xs: T[]): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
    return out;
}

export const eventSubjectKey = (r: EventSubjectRef) => `${r.subject_type}:${r.subject_id}`;

export async function loadValidityEventDates(
    supabase: SupabaseClient,
    orgId: string,
    refs: readonly EventSubjectRef[],
): Promise<Map<string, ValidityEventDates> | null> {
    const out = new Map<string, ValidityEventDates>();
    const unique = [...new Map(refs.map((r) => [eventSubjectKey(r), r])).values()];
    for (const r of unique) out.set(eventSubjectKey(r), { birthday: null, enrollment_starts: r.subject_type === "child" ? [] : null });
    const childIds = unique.filter((r) => r.subject_type === "child").map((r) => r.subject_id);
    const personIds = unique.filter((r) => r.subject_type === "person").map((r) => r.subject_id);
    try {
        for (const c of chunks(childIds)) {
            const { data, error } = await supabase.from("customer_members").select("id, dob").eq("org_id", orgId).in("id", c);
            if (error) return null;
            for (const row of (data ?? []) as Array<{ id: string; dob: string | null }>) {
                const k = `child:${row.id}`;
                out.set(k, { ...out.get(k)!, birthday: row.dob ? String(row.dob).slice(0, 10) : null });
            }
            const { data: ag, error: agErr } = await supabase
                .from("child_enrollment_agreements")
                .select("customer_member_id, start_date, status")
                .eq("org_id", orgId)
                .in("customer_member_id", c)
                .in("status", [...SERVICE_ENROLLMENT_STATUSES]);
            if (agErr) return null;
            for (const row of (ag ?? []) as Array<{ customer_member_id: string; start_date: string | null }>) {
                if (!row.start_date) continue;
                const k = `child:${row.customer_member_id}`;
                const cur = out.get(k);
                if (cur) out.set(k, { ...cur, enrollment_starts: [...(cur.enrollment_starts ?? []), String(row.start_date).slice(0, 10)] });
            }
        }
        for (const c of chunks(personIds)) {
            const { data, error } = await supabase.from("persons").select("id, date_of_birth").eq("org_id", orgId).in("id", c);
            if (error) return null;
            for (const row of (data ?? []) as Array<{ id: string; date_of_birth: string | null }>) {
                const k = `person:${row.id}`;
                out.set(k, { ...out.get(k)!, birthday: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : null });
            }
        }
    } catch {
        return null;
    }
    return out;
}

/** The event dates of ONE document's owner (its primary current owner association), for the validity route. */
export async function loadDocumentOwnerEventDates(
    supabase: SupabaseClient,
    orgId: string,
    documentId: string,
): Promise<ValidityEventDates | null> {
    const { data, error } = await supabase
        .from("document_subjects")
        .select("subject_type, subject_id, is_primary")
        .eq("org_id", orgId)
        .eq("document_id", documentId)
        .eq("association", "owner")
        .is("ended_at", null);
    if (error) return null;
    const owners = (data ?? []) as Array<{ subject_type: string; subject_id: string; is_primary: boolean | null }>;
    const owner = owners.find((o) => o.is_primary) ?? owners[0] ?? null;
    if (!owner) return { birthday: null, enrollment_starts: null };
    const events = await loadValidityEventDates(supabase, orgId, [owner]);
    return events?.get(eventSubjectKey(owner)) ?? null;
}
