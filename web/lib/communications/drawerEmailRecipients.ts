/**
 * Person-first recipients for opportunity/job drawer composer (Cards 15–17, 26–27).
 * No contact_id as anchor; identities are persons rows only.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import { normalizeRecipientKeySms } from "@/lib/communications/recipientKey";
import { fetchRelatedPersonIdsForCommunicationsDrawer } from "@/lib/communications/threadRelatedPersonIds";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export type DrawerEmailRecipientRow = {
    person_id: string;
    /** Lowercase trimmed email when present; omit empty. */
    email: string | null;
    /** E.164-style SMS destination when usable; omit when no valid phone digits. */
    phone: string | null;
    display_name: string;
    relationship_hint: string | null;
    /** Primary person or first deterministic row — refines when channel picker changes in UI. */
    is_suggested_default: boolean;
};

function trimEmail(e: unknown): string | null {
    const s = typeof e === "string" ? e.trim() : "";
    if (!s || !s.includes("@")) return null;
    return s.toLowerCase();
}

function smsToOrNull(raw: unknown): string | null {
    const n = normalizeRecipientKeySms(typeof raw === "string" ? raw : "");
    const digits = n.replace(/\D/g, "");
    return digits.length >= 10 ? n : null;
}

function personLabel(p: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null): string {
    if (!p) return "—";
    const fn = ((p.full_name ?? "") as string).trim();
    if (fn) return fn;
    const a = ([p.first_name, p.last_name].filter(Boolean) as string[]).join(" ").trim();
    return a || "—";
}

/** Opportunity: opportunity_persons, household customer_persons, primary person, primary contact person. */
export async function fetchOpportunityDrawerEmailRecipients(
    supabase: AdminSupabase,
    orgId: string,
    opportunityId: string
): Promise<DrawerEmailRecipientRow[]> {
    const { data: opp } = await supabase
        .from("opportunities")
        .select("primary_person_id, primary_contact_id, customer_id")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    const primaryPid =
        opp && typeof (opp as { primary_person_id?: string }).primary_person_id === "string"
            ? ((opp as { primary_person_id: string }).primary_person_id as string).trim()
            : null;
    const primaryContactId =
        opp && typeof (opp as { primary_contact_id?: string }).primary_contact_id === "string"
            ? ((opp as { primary_contact_id: string }).primary_contact_id as string).trim()
            : null;
    const customerId =
        opp && typeof (opp as { customer_id?: string }).customer_id === "string"
            ? ((opp as { customer_id: string }).customer_id as string).trim()
            : null;

    const { data: opRows } = await supabase
        .from("opportunity_persons")
        .select("person_id, role_type")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);

    const pidSet = new Set<string>();
    const roleMap = new Map<string, string | null>();
    for (const r of (opRows ?? []) as { person_id?: string | null; role_type?: string | null }[]) {
        const pid = r.person_id != null ? String(r.person_id).trim() : "";
        if (!pid || pidSet.has(pid)) continue;
        pidSet.add(pid);
        roleMap.set(pid, r.role_type != null ? String(r.role_type) : null);
    }

    if (customerId) {
        const { data: cpRows } = await supabase
            .from("customer_persons")
            .select("person_id, role_type, is_primary")
            .eq("org_id", orgId)
            .eq("customer_id", customerId);
        for (const r of (cpRows ?? []) as {
            person_id?: string | null;
            role_type?: string | null;
            is_primary?: boolean;
        }[]) {
            const pid = r.person_id != null ? String(r.person_id).trim() : "";
            if (!pid) continue;
            pidSet.add(pid);
            if (!roleMap.has(pid)) {
                roleMap.set(
                    pid,
                    r.role_type === "primary_contact"
                        ? "Primary contact"
                        : r.is_primary
                          ? "Primary on account"
                          : r.role_type != null
                            ? String(r.role_type)
                            : "Family member"
                );
            }
        }
    }

    if (primaryContactId) {
        const { data: cRow } = await supabase
            .from("contacts")
            .select("person_id")
            .eq("id", primaryContactId)
            .eq("org_id", orgId)
            .maybeSingle();
        const contactPid =
            cRow && typeof (cRow as { person_id?: string | null }).person_id === "string"
                ? String((cRow as { person_id: string }).person_id).trim()
                : null;
        if (contactPid) {
            pidSet.add(contactPid);
            if (!roleMap.has(contactPid)) roleMap.set(contactPid, "Primary contact");
        }
    }

    if (primaryPid) pidSet.add(primaryPid);

    if (pidSet.size === 0) return [];

    const { data: people } = await supabase
        .from("persons")
        .select("id, first_name, last_name, full_name, email, phone")
        .eq("org_id", orgId)
        .in("id", [...pidSet]);

    const rows: DrawerEmailRecipientRow[] = [];
    for (const p of (people ?? []) as {
        id: string;
        email?: string | null;
        phone?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
    }[]) {
        const pid = String(p.id);
        rows.push({
            person_id: pid,
            email: trimEmail(p.email),
            phone: smsToOrNull(p.phone),
            display_name: personLabel(p),
            relationship_hint:
                pid === primaryPid ? "Primary person" : roleMap.has(pid) ? (roleMap.get(pid) ?? "Linked") : "Linked person",
            is_suggested_default: false,
        });
    }

    const sortedRows = [...rows].sort((a, b) => {
        const dn = a.display_name.localeCompare(b.display_name);
        if (dn !== 0) return dn;
        return a.person_id.localeCompare(b.person_id);
    });
    let defaultPid: string | null = primaryPid && sortedRows.some((r) => r.person_id === primaryPid) ? primaryPid : sortedRows[0]?.person_id ?? null;
    sortedRows.forEach((r) => {
        r.is_suggested_default = r.person_id === defaultPid;
    });

    sortedRows.sort((a, b) => {
        const d = Number(b.is_suggested_default) - Number(a.is_suggested_default);
        if (d !== 0) return d;
        const l = a.display_name.localeCompare(b.display_name);
        if (l !== 0) return l;
        return a.person_id.localeCompare(b.person_id);
    });

    return sortedRows;
}

/** Job: customer_persons + opportunity_persons (via opportunity_id) + primary person. */
export async function fetchJobDrawerEmailRecipients(
    supabase: AdminSupabase,
    orgId: string,
    jobId: string
): Promise<DrawerEmailRecipientRow[]> {
    const { data: job } = await supabase
        .from("jobs")
        .select("primary_person_id, customer_id, opportunity_id")
        .eq("id", jobId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!job) return [];

    const primaryPidRaw = (job as { primary_person_id?: string | null }).primary_person_id;
    const customerId = (job as { customer_id?: string | null }).customer_id;
    const oppId = (job as { opportunity_id?: string | null }).opportunity_id;
    const primaryPid = typeof primaryPidRaw === "string" && primaryPidRaw.trim() ? primaryPidRaw.trim() : null;

    const pidSet = new Set<string>();
    const hintMap = new Map<string, string | null>();

    if (customerId) {
        const { data: cpRows } = await supabase
            .from("customer_persons")
            .select("person_id, is_primary, role_type")
            .eq("org_id", orgId)
            .eq("customer_id", customerId);
        const rowsCp = ((cpRows ?? []) as {
            person_id?: string | null;
            is_primary?: boolean;
            role_type?: string | null;
        }[]).sort((a, b) => {
            const sc = (r: typeof a) =>
                Number(!!r.is_primary && r.role_type === "primary_contact") * 3 +
                Number(!!r.is_primary) * 2 +
                Number(r.role_type === "primary_contact");
            const d = sc(b) - sc(a);
            if (d !== 0) return d;
            return 0;
        });
        for (const r of rowsCp) {
            const pid = r.person_id != null ? String(r.person_id).trim() : "";
            if (!pid) continue;
            pidSet.add(pid);
            if (!hintMap.has(pid))
                hintMap.set(
                    pid,
                    r.role_type === "primary_contact"
                        ? "Primary contact role"
                        : r.is_primary
                          ? "Primary on customer"
                          : "Family member"
                );
        }
    }

    if (oppId) {
        const { data: oppRows } = await supabase
            .from("opportunity_persons")
            .select("person_id, role_type")
            .eq("org_id", orgId)
            .eq("opportunity_id", oppId);
        for (const r of (oppRows ?? []) as { person_id?: string | null; role_type?: string | null }[]) {
            const pid = r.person_id != null ? String(r.person_id).trim() : "";
            if (!pid) continue;
            pidSet.add(pid);
            if (!hintMap.has(pid)) hintMap.set(pid, r.role_type != null ? `Opportunity (${r.role_type})` : "Related via opportunity");
        }
    }

    if (primaryPid) pidSet.add(primaryPid);

    if (pidSet.size === 0) return [];

    const { data: people } = await supabase
        .from("persons")
        .select("id, first_name, last_name, full_name, email, phone")
        .eq("org_id", orgId)
        .in("id", [...pidSet]);

    const rows: DrawerEmailRecipientRow[] = [];
    for (const p of (people ?? []) as {
        id: string;
        email?: string | null;
        phone?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
    }[]) {
        const pid = String(p.id);
        let hint = hintMap.get(pid) ?? null;
        if (primaryPid === pid) hint = "Primary person (job)";
        rows.push({
            person_id: pid,
            email: trimEmail(p.email),
            phone: smsToOrNull(p.phone),
            display_name: personLabel(p),
            relationship_hint: hint,
            is_suggested_default: false,
        });
    }

    const sortedRows = [...rows].sort((a, b) => {
        const dn = a.display_name.localeCompare(b.display_name);
        if (dn !== 0) return dn;
        return a.person_id.localeCompare(b.person_id);
    });

    let defaultPid: string | null = primaryPid && sortedRows.some((r) => r.person_id === primaryPid)
        ? primaryPid
        : sortedRows[0]?.person_id ?? null;
    sortedRows.forEach((r) => {
        r.is_suggested_default = r.person_id === defaultPid;
    });

    sortedRows.sort((a, b) => {
        const d = Number(b.is_suggested_default) - Number(a.is_suggested_default);
        if (d !== 0) return d;
        const l = a.display_name.localeCompare(b.display_name);
        if (l !== 0) return l;
        return a.person_id.localeCompare(b.person_id);
    });

    return sortedRows;
}

/** Person drawer: the opened person is the sole composer recipient. */
export async function fetchPersonDrawerEmailRecipients(
    supabase: AdminSupabase,
    orgId: string,
    personId: string
): Promise<DrawerEmailRecipientRow[]> {
    const { data } = await supabase
        .from("persons")
        .select("id, first_name, last_name, full_name, email, phone")
        .eq("id", personId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!data || typeof data !== "object") return [];
    const row = data as {
        id?: string;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        email?: string | null;
        phone?: string | null;
    };
    return [
        {
            person_id: personId,
            email: trimEmail(row.email),
            phone: smsToOrNull(row.phone),
            display_name: personLabel(row),
            relationship_hint: null,
            is_suggested_default: true,
        },
    ];
}

export async function assertRecipientPersonEligibleForDrawerEmail(
    supabase: AdminSupabase,
    orgId: string,
    entityType: "opportunities" | "jobs" | "persons",
    entityId: string,
    personId: string
): Promise<boolean> {
    if (entityType === "persons") {
        if (personId !== entityId) return false;
        return (await getPersonEmailOrNull(supabase, orgId, personId)) !== null;
    }
    const related = await fetchRelatedPersonIdsForCommunicationsDrawer(supabase, orgId, entityType, entityId);
    if (!related.includes(personId)) return false;
    return (await getPersonEmailOrNull(supabase, orgId, personId)) !== null;
}

export async function assertRecipientPersonEligibleForDrawerSms(
    supabase: AdminSupabase,
    orgId: string,
    entityType: "opportunities" | "jobs" | "persons",
    entityId: string,
    personId: string
): Promise<boolean> {
    if (entityType === "persons") {
        if (personId !== entityId) return false;
        return (await getPersonSmsToOrNull(supabase, orgId, personId)) !== null;
    }
    const related = await fetchRelatedPersonIdsForCommunicationsDrawer(supabase, orgId, entityType, entityId);
    if (!related.includes(personId)) return false;
    return (await getPersonSmsToOrNull(supabase, orgId, personId)) !== null;
}

export async function getPersonEmailOrNull(supabase: AdminSupabase, orgId: string, personId: string): Promise<string | null> {
    const { data } = await supabase.from("persons").select("email").eq("id", personId).eq("org_id", orgId).maybeSingle();
    return trimEmail((data as { email?: string | null } | null)?.email);
}

export async function getPersonSmsToOrNull(supabase: AdminSupabase, orgId: string, personId: string): Promise<string | null> {
    const { data } = await supabase.from("persons").select("phone").eq("id", personId).eq("org_id", orgId).maybeSingle();
    return smsToOrNull((data as { phone?: string | null } | null)?.phone ?? null);
}
