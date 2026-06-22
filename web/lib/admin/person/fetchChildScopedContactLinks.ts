/**
 * Hydrate child-scoped contact links from customer_member_contacts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildScopedContactLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

type MemberRow = {
    id: string;
    person_id?: string | null;
};

export async function fetchChildScopedContactLinksForMembers(
    supabase: SupabaseClient,
    orgId: string,
    memberRows: MemberRow[],
): Promise<ChildScopedContactLinkRow[]> {
    const memberIds = memberRows.map((m) => m.id).filter(Boolean);
    if (memberIds.length === 0) return [];

    const personIdByMemberId = new Map(
        memberRows.map((m) => [m.id, trimOrNull(m.person_id)]),
    );

    const { data: linkRows } = await supabase
        .from("customer_member_contacts")
        .select("id, customer_member_id, contact_id, role_key, is_active, sort_order, contact:contacts(id, person_id, first_name, last_name, email, phone)")
        .eq("org_id", orgId)
        .in("customer_member_id", memberIds)
        .eq("is_active", true);

    const roleKeys = [
        ...new Set((linkRows ?? []).map((row: { role_key?: string | null }) => trimOrNull(row.role_key)).filter(Boolean)),
    ] as string[];

    const { data: roleRows } =
        roleKeys.length > 0 ?
            await supabase
                .from("customer_member_contact_roles")
                .select("role_key, label")
                .eq("org_id", orgId)
                .in("role_key", roleKeys)
        :   { data: [] as { role_key: string; label: string | null }[] };

    const roleLabelByKey = new Map((roleRows ?? []).map((r) => [r.role_key, r.label ?? r.role_key]));

    const out: ChildScopedContactLinkRow[] = [];
    for (const raw of linkRows ?? []) {
        const row = raw as {
            customer_member_id: string;
            contact_id?: string | null;
            role_key?: string | null;
            sort_order?: number | null;
            contact?: {
                id?: string;
                person_id?: string | null;
                first_name?: string | null;
                last_name?: string | null;
                email?: string | null;
                phone?: string | null;
            } | null;
        };
        const memberId = String(row.customer_member_id);
        const contact = row.contact ?? null;
        const displayName =
            contact ?
                [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim()
                || trimOrNull(contact.email)
                || trimOrNull(contact.phone)
                || "Unnamed contact"
            :   "Unnamed contact";
        const roleKey = trimOrNull(row.role_key) ?? "contact";
        out.push({
            customer_member_id: memberId,
            child_person_id: personIdByMemberId.get(memberId) ?? null,
            person_id: trimOrNull(contact?.person_id),
            contact_id: trimOrNull(row.contact_id) ?? trimOrNull(contact?.id),
            display_name: displayName,
            role_type: roleKey,
            role_label: roleLabelByKey.get(roleKey) ?? roleKey,
            is_primary: roleKey === "primary_contact" || roleKey === "primary",
            phone: trimOrNull(contact?.phone),
            email: trimOrNull(contact?.email),
            sort_order: typeof row.sort_order === "number" ? row.sort_order : null,
        });
    }

    return out.sort((a, b) => {
        const orderA = a.sort_order ?? 999;
        const orderB = b.sort_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return a.display_name.localeCompare(b.display_name);
    });
}
