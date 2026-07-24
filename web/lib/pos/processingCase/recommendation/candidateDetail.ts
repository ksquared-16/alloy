/**
 * Existing-match candidate detail (§3).
 *
 * Enriches an identity candidate (a matched person) with the identifying context an operator needs
 * to decide — name, email, phone, ZIP, household, children, status, last activity — plus the exact
 * reasons Alloy considers it a match. READ-ONLY. Fetched alongside the recommendation so the
 * candidate row can expand IN PLACE inside the Decision Conversation (no navigation away).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CandidateDetail {
    id: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    zip: string | null;
    householdName: string | null;
    /** Children on the same household, e.g. "Marigold (born Aug 14, 2022)". */
    children: string[];
    /** Current lead/enrollment status of the record, humanized. */
    status: string | null;
    /** Last meaningful update. */
    lastUpdated: string | null;
    /** Exact reasons this record is a candidate, e.g. "Exact parent email". */
    matchReasons: string[];
}

function humanize(s: string | null | undefined): string | null {
    if (!s) return null;
    return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function localDateLabel(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw).trim());
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(String(raw));
    if (Number.isNaN(d.getTime())) return String(raw);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Translate the engine's match identifier into an operator-facing reason. */
export function matchReasonLabel(reason: string): string {
    const r = reason.toLowerCase();
    if (r.includes("email")) return "Exact parent email";
    if (r.includes("phone")) return "Exact phone number";
    return humanize(reason) ?? reason;
}

export async function enrichCandidateDetail(
    supabase: SupabaseClient,
    orgId: string,
    candidate: { id: string; matchReason: string }
): Promise<CandidateDetail> {
    const base: CandidateDetail = {
        id: candidate.id,
        fullName: null,
        email: null,
        phone: null,
        zip: null,
        householdName: null,
        children: [],
        status: null,
        lastUpdated: null,
        matchReasons: [matchReasonLabel(candidate.matchReason)],
    };

    const { data: person } = await supabase
        .from("persons")
        .select("first_name, last_name, full_name, email, phone, status_key, updated_at")
        .eq("org_id", orgId)
        .eq("id", candidate.id)
        .maybeSingle();
    const p = person as
        | { first_name?: string | null; last_name?: string | null; full_name?: string | null; email?: string | null; phone?: string | null; status_key?: string | null; updated_at?: string | null }
        | null;
    if (p) {
        base.fullName = (p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ")).trim() || null;
        base.email = p.email ?? null;
        base.phone = p.phone ?? null;
        base.status = humanize(p.status_key);
        base.lastUpdated = p.updated_at ? localDateLabel(p.updated_at) : null;
    }

    // ZIP — canonical person field value.
    const { data: zipRow } = await supabase
        .from("field_values")
        .select("value_text, field_definitions!inner(field_key, entity_type)")
        .eq("org_id", orgId)
        .eq("entity_type", "person")
        .eq("entity_id", candidate.id)
        .eq("field_definitions.field_key", "postal_code")
        .maybeSingle();
    base.zip = (zipRow as { value_text?: string | null } | null)?.value_text ?? null;

    // Household + children via customer_members.
    const { data: membership } = await supabase
        .from("customer_members")
        .select("customer_id")
        .eq("org_id", orgId)
        .eq("person_id", candidate.id)
        .maybeSingle();
    const customerId = (membership as { customer_id?: string | null } | null)?.customer_id ?? null;
    if (customerId) {
        const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
        base.householdName = (cust as { name?: string | null } | null)?.name ?? null;

        const { data: members } = await supabase
            .from("customer_members")
            .select("first_name, last_name, display_name, dob, relationship")
            .eq("org_id", orgId)
            .eq("customer_id", customerId);
        for (const m of (members ?? []) as Array<{ first_name?: string | null; last_name?: string | null; display_name?: string | null; dob?: string | null; relationship?: string | null }>) {
            const isChild = (m.relationship ?? "").toLowerCase().includes("child") || Boolean(m.dob);
            if (!isChild) continue;
            const name = (m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ")).trim();
            if (!name) continue;
            const born = localDateLabel(m.dob);
            base.children.push(born ? `${name} (born ${born})` : name);
        }
    }

    return base;
}
