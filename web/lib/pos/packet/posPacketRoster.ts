/**
 * POS Packet Composer — household roster reads (children + recipients for an anchor).
 *
 * Reuses existing tables only (no schema changes): customer_members, customer_persons,
 * opportunity_persons, opportunities, contacts, persons. Org-scoped reads; the caller
 * supplies an admin/service Supabase client + orgId.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchEntityType } from "./launchFromEntity";

export interface AnchorContext {
    entity_type: LaunchEntityType;
    entity_id: string;
    opportunity_id: string | null;
    customer_id: string | null;
}

export interface RosterChild {
    customer_member_id: string;
    label: string;
    dob: string | null;
}

export interface RosterRecipient {
    person_id: string;
    label: string;
    email: string | null;
    phone: string | null;
    relationship: string | null;
}

export interface PacketRoster {
    anchor: AnchorContext;
    children: RosterChild[];
    recipients: RosterRecipient[];
}

function personLabel(p: { full_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; id: string }): string {
    const full = (p.full_name ?? "").trim();
    if (full) return full;
    const fl = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    if (fl) return fl;
    if (p.email?.trim()) return p.email.trim();
    return `${p.id.slice(0, 8)}…`;
}

function childLabel(m: { display_name?: string | null; first_name?: string | null; last_name?: string | null; id: string }): string {
    const dn = (m.display_name ?? "").trim();
    if (dn) return dn;
    const fl = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
    if (fl) return fl;
    return `${m.id.slice(0, 8)}…`;
}

/** Resolve the household (customer) + opportunity context for a chosen anchor record. */
export async function resolveAnchorContext(
    supabase: SupabaseClient,
    orgId: string,
    entityType: LaunchEntityType,
    entityId: string
): Promise<AnchorContext> {
    const ctx: AnchorContext = { entity_type: entityType, entity_id: entityId, opportunity_id: null, customer_id: null };

    if (entityType === "opportunity") {
        const { data } = await supabase.from("opportunities").select("customer_id").eq("org_id", orgId).eq("id", entityId).maybeSingle();
        ctx.opportunity_id = entityId;
        ctx.customer_id = (data as { customer_id?: string | null } | null)?.customer_id ?? null;
    } else if (entityType === "customer") {
        ctx.customer_id = entityId;
    } else if (entityType === "customer_member") {
        const { data } = await supabase.from("customer_members").select("customer_id").eq("org_id", orgId).eq("id", entityId).maybeSingle();
        ctx.customer_id = (data as { customer_id?: string | null } | null)?.customer_id ?? null;
    } else if (entityType === "person") {
        const { data } = await supabase.from("customer_persons").select("customer_id").eq("org_id", orgId).eq("person_id", entityId).limit(1).maybeSingle();
        ctx.customer_id = (data as { customer_id?: string | null } | null)?.customer_id ?? null;
    }
    return ctx;
}

export async function childrenForAnchor(supabase: SupabaseClient, orgId: string, ctx: AnchorContext): Promise<RosterChild[]> {
    if (!ctx.customer_id) return [];
    const { data } = await supabase
        .from("customer_members")
        .select("id, display_name, first_name, last_name, dob, is_active")
        .eq("org_id", orgId)
        .eq("customer_id", ctx.customer_id)
        .order("display_name", { ascending: true });
    const rows = (data ?? []) as Array<{ id: string; display_name: string | null; first_name: string | null; last_name: string | null; dob: string | null; is_active?: boolean | null }>;
    return rows
        .filter((m) => m.is_active !== false)
        .map((m) => ({ customer_member_id: m.id, label: childLabel(m), dob: m.dob ?? null }));
}

export async function recipientsForAnchor(supabase: SupabaseClient, orgId: string, ctx: AnchorContext): Promise<RosterRecipient[]> {
    const personIds = new Set<string>();
    const roleByPerson = new Map<string, string>();

    if (ctx.customer_id) {
        const { data: cp } = await supabase
            .from("customer_persons")
            .select("person_id, role_type, is_primary")
            .eq("org_id", orgId)
            .eq("customer_id", ctx.customer_id);
        for (const r of (cp ?? []) as Array<{ person_id: string; role_type: string | null; is_primary: boolean | null }>) {
            personIds.add(r.person_id);
            if (!roleByPerson.has(r.person_id)) {
                roleByPerson.set(r.person_id, r.is_primary ? "Primary on account" : r.role_type ?? "Parent / guardian");
            }
        }
    }

    if (ctx.opportunity_id) {
        const { data: opp } = await supabase
            .from("opportunities")
            .select("primary_person_id, primary_contact_id")
            .eq("org_id", orgId)
            .eq("id", ctx.opportunity_id)
            .maybeSingle();
        const oppRow = opp as { primary_person_id?: string | null; primary_contact_id?: string | null } | null;
        if (oppRow?.primary_person_id) {
            personIds.add(oppRow.primary_person_id);
            if (!roleByPerson.has(oppRow.primary_person_id)) roleByPerson.set(oppRow.primary_person_id, "Primary contact");
        }
        const { data: op } = await supabase.from("opportunity_persons").select("person_id, role_type").eq("org_id", orgId).eq("opportunity_id", ctx.opportunity_id);
        for (const r of (op ?? []) as Array<{ person_id: string; role_type: string | null }>) {
            personIds.add(r.person_id);
            if (!roleByPerson.has(r.person_id)) roleByPerson.set(r.person_id, r.role_type ?? "Linked person");
        }
        if (oppRow?.primary_contact_id) {
            const { data: con } = await supabase.from("contacts").select("person_id").eq("org_id", orgId).eq("id", oppRow.primary_contact_id).maybeSingle();
            const pid = (con as { person_id?: string | null } | null)?.person_id;
            if (pid) {
                personIds.add(pid);
                if (!roleByPerson.has(pid)) roleByPerson.set(pid, "Primary contact");
            }
        }
    }

    if (personIds.size === 0) return [];

    const { data: people } = await supabase
        .from("persons")
        .select("id, first_name, last_name, full_name, email, phone")
        .eq("org_id", orgId)
        .in("id", [...personIds]);
    const rows = (people ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; full_name: string | null; email: string | null; phone: string | null }>;
    return rows.map((p) => ({
        person_id: p.id,
        label: personLabel(p),
        email: p.email ?? null,
        phone: p.phone ?? null,
        relationship: roleByPerson.get(p.id) ?? "Linked person",
    }));
}

export async function loadPacketRoster(
    supabase: SupabaseClient,
    orgId: string,
    entityType: LaunchEntityType,
    entityId: string
): Promise<PacketRoster> {
    const anchor = await resolveAnchorContext(supabase, orgId, entityType, entityId);
    const [children, recipients] = await Promise.all([childrenForAnchor(supabase, orgId, anchor), recipientsForAnchor(supabase, orgId, anchor)]);
    return { anchor, children, recipients };
}
