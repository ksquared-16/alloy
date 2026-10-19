/**
 * WHICH FAMILIES CANNOT PAY FROM THEIR PAPERWORK — the operator's list of payerless Enrollment links.
 *
 * A link minted before payer binding (#1477) names no `recipient_person_id`, so the family sees "We could
 * not confirm who is paying" and no Pay button. Re-launching repairs nothing (a resume hands back the same
 * link), so these links are only found by asking for them. This read answers that, and nothing more:
 *
 *   - an ACTIVE Enrollment link (created_via enrollment_start, not expired) with no payer;
 *   - whose paperwork is still OPEN (in_progress) — a finished or abandoned packet is history and is not
 *     listed, because linkPayerBinding refuses it (session_not_open) and offering it would be a dead end;
 *   - named in business terms: the child, the household, when it was sent, and how many primary contacts
 *     the operator will choose between.
 *
 * Nothing is written. The decision itself is linkPayerBinding's (GET/POST /links/[linkId]/payer).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE } from "@/lib/admin/person/householdPrimaryContact";

export type LinkNeedingPayer = {
    readonly linkId: string;
    readonly sessionId: string;
    readonly sentAt: string | null;
    readonly childId: string | null;
    readonly childName: string | null;
    readonly householdId: string;
    readonly householdName: string | null;
    /** Primary contacts the operator would choose between. 0 means the household needs one first. */
    readonly candidateCount: number;
};

const PAGE = 500;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

type LinkRow = { id: string; created_at?: string | null; expires_at?: string | null; metadata?: Record<string, unknown> | null };

export async function listLinksNeedingPayer(
    supabase: SupabaseClient,
    input: { orgId: string; now?: Date },
): Promise<LinkNeedingPayer[]> {
    const nowMs = (input.now ?? new Date()).getTime();

    // Active Enrollment links with no payer. Paged by id: PostgREST caps a read at 1000 rows.
    const links: LinkRow[] = [];
    for (let after = ""; ; ) {
        let q = supabase
            .from("form_public_links")
            .select("id, created_at, expires_at, metadata")
            .eq("org_id", input.orgId)
            .eq("is_active", true)
            .eq("metadata->>created_via", "enrollment_start")
            .is("metadata->>recipient_person_id", null)
            .order("id", { ascending: true })
            .limit(PAGE);
        if (after) q = q.gt("id", after);
        const { data, error } = await q;
        if (error) throw new Error(`link read failed: ${error.message}`);
        const page = (data ?? []) as LinkRow[];
        links.push(...page.filter((l) => !l.expires_at || Date.parse(l.expires_at) > nowMs));
        if (page.length < PAGE) break;
        after = page[page.length - 1]!.id;
    }
    if (links.length === 0) return [];

    const { data: sessionData, error: sessionError } = await supabase
        .from("form_packet_sessions")
        .select("id, started_via_public_link_id, status, crm_snapshot, process_instance_id")
        .eq("org_id", input.orgId)
        .eq("status", "in_progress")
        .in("started_via_public_link_id", links.map((l) => l.id));
    if (sessionError) throw new Error(`session read failed: ${sessionError.message}`);
    type SessionRow = { id: string; started_via_public_link_id: string; crm_snapshot?: Record<string, unknown> | null; process_instance_id?: string | null };
    const openByLink = new Map<string, SessionRow[]>();
    for (const s of (sessionData ?? []) as SessionRow[]) {
        openByLink.set(s.started_via_public_link_id, [...(openByLink.get(s.started_via_public_link_id) ?? []), s]);
    }

    // Exactly one open session — the same condition linkPayerBinding requires before it will bind.
    const rows = links
        .map((l) => ({ link: l, session: (openByLink.get(l.id) ?? []).length === 1 ? openByLink.get(l.id)![0]! : null }))
        .filter((r): r is { link: LinkRow; session: SessionRow } => r.session !== null && str(r.session.crm_snapshot?.customer_id) !== "");
    if (rows.length === 0) return [];

    const householdIds = [...new Set(rows.map((r) => str(r.session.crm_snapshot?.customer_id)))];
    const instanceIds = [...new Set(rows.map((r) => str(r.session.process_instance_id)).filter(Boolean))];

    const [households, contacts, instances] = await Promise.all([
        supabase.from("customers").select("id, name").eq("org_id", input.orgId).in("id", householdIds),
        supabase
            .from("customer_persons")
            .select("customer_id, person_id")
            .eq("org_id", input.orgId)
            .eq("role_type", HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE)
            .in("customer_id", householdIds),
        instanceIds.length
            ? supabase.from("process_instances").select("id, subject_type, subject_id").eq("org_id", input.orgId).in("id", instanceIds)
            : Promise.resolve({ data: [], error: null }),
    ]);
    for (const r of [households, contacts, instances]) if (r.error) throw new Error(`read failed: ${r.error.message}`);

    const householdName = new Map(((households.data ?? []) as Array<{ id: string; name?: string | null }>).map((h) => [h.id, str(h.name) || null]));
    const contactCount = new Map<string, Set<string>>();
    for (const c of (contacts.data ?? []) as Array<{ customer_id: string; person_id: string }>) {
        contactCount.set(c.customer_id, (contactCount.get(c.customer_id) ?? new Set()).add(c.person_id));
    }
    const childByInstance = new Map(
        ((instances.data ?? []) as Array<{ id: string; subject_type?: string | null; subject_id?: string | null }>)
            .filter((i) => i.subject_type === "child" && i.subject_id)
            .map((i) => [i.id, i.subject_id as string]),
    );
    const childIds = [...new Set(childByInstance.values())];
    const childName = new Map<string, string | null>();
    if (childIds.length) {
        const { data, error } = await supabase
            .from("customer_members")
            .select("id, display_name, first_name, last_name")
            .eq("org_id", input.orgId)
            .in("id", childIds);
        if (error) throw new Error(`child read failed: ${error.message}`);
        for (const m of (data ?? []) as Array<{ id: string; display_name?: string | null; first_name?: string | null; last_name?: string | null }>) {
            childName.set(m.id, str(m.display_name) || [str(m.first_name), str(m.last_name)].filter(Boolean).join(" ") || null);
        }
    }

    return rows
        .map(({ link, session }) => {
            const householdId = str(session.crm_snapshot?.customer_id);
            const childId = childByInstance.get(str(session.process_instance_id)) ?? null;
            return {
                linkId: link.id,
                sessionId: session.id,
                sentAt: link.created_at ?? null,
                childId,
                childName: childId ? childName.get(childId) ?? null : null,
                householdId,
                householdName: householdName.get(householdId) ?? null,
                candidateCount: contactCount.get(householdId)?.size ?? 0,
            };
        })
        .sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? ""));
}
