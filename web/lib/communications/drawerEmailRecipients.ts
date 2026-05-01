/**
 * Person-first email recipients for opportunity/job drawer composer (Cards 15–17).
 * No contact_id as anchor; identities are persons rows only.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export type DrawerEmailRecipientRow = {
    person_id: string;
    email: string;
    display_name: string;
    relationship_hint: string | null;
    /** Single primary default — used to pre-select one checkbox. */
    is_suggested_default: boolean;
};

function trimEmail(e: unknown): string | null {
    const s = typeof e === "string" ? e.trim() : "";
    if (!s || !s.includes("@")) return null;
    return s.toLowerCase();
}

function personLabel(p: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null): string {
    if (!p) return "—";
    const fn = ((p.full_name ?? "") as string).trim();
    if (fn) return fn;
    const a = ([p.first_name, p.last_name].filter(Boolean) as string[]).join(" ").trim();
    return a || "—";
}

/** Opportunity: opportunity_persons + persons with email; always consider primary_person if present and not duplicated. */
export async function fetchOpportunityDrawerEmailRecipients(
    supabase: AdminSupabase,
    orgId: string,
    opportunityId: string
): Promise<DrawerEmailRecipientRow[]> {
    const { data: opp } = await supabase
        .from("opportunities")
        .select("primary_person_id")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    const primaryPid =
        opp && typeof (opp as { primary_person_id?: string }).primary_person_id === "string"
            ? ((opp as { primary_person_id: string }).primary_person_id as string).trim()
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
    if (primaryPid) pidSet.add(primaryPid);

    if (pidSet.size === 0) return [];

    const { data: people } = await supabase
        .from("persons")
        .select("id, first_name, last_name, full_name, email")
        .eq("org_id", orgId)
        .in("id", [...pidSet]);

    const rows: DrawerEmailRecipientRow[] = [];
    for (const p of (people ?? []) as {
        id: string;
        email?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
    }[]) {
        const email = trimEmail(p.email);
        if (!email) continue;
        const pid = String(p.id);
        rows.push({
            person_id: pid,
            email,
            display_name: personLabel(p),
            relationship_hint:
                pid === primaryPid ? "Primary person" : roleMap.has(pid) ? (roleMap.get(pid) ?? "Linked") : "Linked person",
            is_suggested_default: false,
        });
    }

    const byId = new Map(rows.map((r) => [r.person_id, r]));
    /** Default: primary with email else first deterministic by name then id. */
    const sortedForDefault = [...rows].sort((a, b) => {
        const dn = a.display_name.localeCompare(b.display_name);
        if (dn !== 0) return dn;
        return a.person_id.localeCompare(b.person_id);
    });

    let defaultPid: string | null = primaryPid && byId.has(primaryPid) ? primaryPid : sortedForDefault[0]?.person_id ?? null;
    rows.forEach((r) => {
        r.is_suggested_default = r.person_id === defaultPid;
    });

    rows.sort((a, b) => {
        const d = Number(b.is_suggested_default) - Number(a.is_suggested_default);
        if (d !== 0) return d;
        const l = a.display_name.localeCompare(b.display_name);
        if (l !== 0) return l;
        return a.person_id.localeCompare(b.person_id);
    });

    return rows;
}

/** Job: customer_persons (+ optional opportunity_persons via job.opportunity_id) + primary person; person-first only. */
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
                          : "Household member"
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
        .select("id, first_name, last_name, full_name, email")
        .eq("org_id", orgId)
        .in("id", [...pidSet]);

    const rows: DrawerEmailRecipientRow[] = [];
    for (const p of (people ?? []) as {
        id: string;
        email?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
    }[]) {
        const email = trimEmail(p.email);
        if (!email) continue;
        const pid = String(p.id);
        let hint = hintMap.get(pid) ?? null;
        if (primaryPid === pid) hint = "Primary person (job)";
        rows.push({
            person_id: pid,
            email,
            display_name: personLabel(p),
            relationship_hint: hint,
            is_suggested_default: false,
        });
    }

    const sortedForDefault = [...rows].sort((a, b) => {
        const dn = a.display_name.localeCompare(b.display_name);
        if (dn !== 0) return dn;
        return a.person_id.localeCompare(b.person_id);
    });

    let defaultPid: string | null = primaryPid && rows.some((r) => r.person_id === primaryPid) ? primaryPid : sortedForDefault[0]?.person_id ?? null;
    rows.forEach((r) => {
        r.is_suggested_default = r.person_id === defaultPid;
    });

    rows.sort((a, b) => {
        const d = Number(b.is_suggested_default) - Number(a.is_suggested_default);
        if (d !== 0) return d;
        const l = a.display_name.localeCompare(b.display_name);
        if (l !== 0) return l;
        return a.person_id.localeCompare(b.person_id);
    });

    return rows;
}

export async function assertRecipientPersonEligibleForDrawerEmail(
    supabase: AdminSupabase,
    orgId: string,
    entityType: "opportunities" | "jobs",
    entityId: string,
    personId: string
): Promise<boolean> {
    const list =
        entityType === "jobs"
            ? await fetchJobDrawerEmailRecipients(supabase, orgId, entityId)
            : await fetchOpportunityDrawerEmailRecipients(supabase, orgId, entityId);
    return list.some((r) => r.person_id === personId);
}

export async function getPersonEmailOrNull(supabase: AdminSupabase, orgId: string, personId: string): Promise<string | null> {
    const { data } = await supabase.from("persons").select("email").eq("id", personId).eq("org_id", orgId).maybeSingle();
    return trimEmail((data as { email?: string | null } | null)?.email);
}
