/**
 * Hydrate child-scoped contact links from customer_member_contacts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildScopedContactLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";

/** Schema-valid member contact projection (no sort_order on customer_member_contacts). */
export const CUSTOMER_MEMBER_CONTACTS_LINK_SELECT =
    "id, customer_member_id, contact_id, role_key, is_active, contact:contacts(id, person_id, first_name, last_name, email, phone)";

/** Schema-valid role label projection. */
export const CUSTOMER_MEMBER_CONTACT_ROLES_SELECT = "role_key, role_label, sort_order";

export type ChildScopedContactMemberRow = {
    id: string;
    person_id?: string | null;
};

export type FetchChildScopedContactLinksResult = {
    links: ChildScopedContactLinkRow[];
    memberContactsQueryError: string | null;
    roleLabelsQueryError: string | null;
};

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function logChildScopedContactLinksQueryError(scope: string, message: string, context: Record<string, unknown>): void {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(`[child_scoped_contact_links] ${scope}`, { ...context, message });
    }
}

export function childScopedContactLinksFetchFailed(result: FetchChildScopedContactLinksResult): boolean {
    return Boolean(result.memberContactsQueryError || result.roleLabelsQueryError);
}

export function memberRowsFromInquiryChildren(
    children: Array<{ customer_member_id: string; person_id?: string | null }>,
): ChildScopedContactMemberRow[] {
    return children
        .map((child) => ({
            id: String(child.customer_member_id ?? "").trim(),
            person_id: child.person_id ?? null,
        }))
        .filter((row) => row.id.length > 0);
}

/** Attach scoped links + query failure markers on a drawer/opportunity record bag. */
export async function attachChildScopedContactLinksToRecord(
    supabase: SupabaseClient,
    orgId: string,
    memberRows: ChildScopedContactMemberRow[],
    out: Record<string, unknown>,
): Promise<FetchChildScopedContactLinksResult> {
    const result = await fetchChildScopedContactLinksForMembers(supabase, orgId, memberRows);
    out._child_scoped_contact_links = result.links;
    if (childScopedContactLinksFetchFailed(result)) {
        out._child_scoped_contact_links_query_failed = true;
        out._child_scoped_contact_links_query_error = [
            result.memberContactsQueryError,
            result.roleLabelsQueryError,
        ]
            .filter(Boolean)
            .join("; ");
    } else {
        out._child_scoped_contact_links_query_failed = false;
        delete out._child_scoped_contact_links_query_error;
    }
    return result;
}

export async function fetchChildScopedContactLinksForMembers(
    supabase: SupabaseClient,
    orgId: string,
    memberRows: ChildScopedContactMemberRow[],
): Promise<FetchChildScopedContactLinksResult> {
    const memberIds = memberRows.map((m) => m.id).filter(Boolean);
    if (memberIds.length === 0) {
        return { links: [], memberContactsQueryError: null, roleLabelsQueryError: null };
    }

    const personIdByMemberId = new Map(
        memberRows.map((m) => [m.id, trimOrNull(m.person_id)]),
    );

    const { data: linkRows, error: memberContactsError } = await supabase
        .from("customer_member_contacts")
        .select(CUSTOMER_MEMBER_CONTACTS_LINK_SELECT)
        .eq("org_id", orgId)
        .in("customer_member_id", memberIds)
        .eq("is_active", true);

    if (memberContactsError) {
        logChildScopedContactLinksQueryError("member_contacts_select_failed", memberContactsError.message, {
            org_id: orgId,
            member_count: memberIds.length,
        });
        return {
            links: [],
            memberContactsQueryError: memberContactsError.message,
            roleLabelsQueryError: null,
        };
    }

    const roleKeys = [
        ...new Set((linkRows ?? []).map((row: { role_key?: string | null }) => trimOrNull(row.role_key)).filter(Boolean)),
    ] as string[];

    let roleLabelsQueryError: string | null = null;
    let roleRows: { role_key: string; role_label: string | null; sort_order?: number | null }[] = [];

    if (roleKeys.length > 0) {
        const roleRes = await supabase
            .from("customer_member_contact_roles")
            .select(CUSTOMER_MEMBER_CONTACT_ROLES_SELECT)
            .eq("org_id", orgId)
            .in("role_key", roleKeys);

        if (roleRes.error) {
            roleLabelsQueryError = roleRes.error.message;
            logChildScopedContactLinksQueryError("role_labels_select_failed", roleRes.error.message, {
                org_id: orgId,
                role_key_count: roleKeys.length,
            });
        } else {
            roleRows = (roleRes.data ?? []) as typeof roleRows;
        }
    }

    const roleMetaByKey = new Map(
        roleRows.map((r) => [
            r.role_key,
            {
                label: r.role_label ?? r.role_key,
                sort_order: typeof r.sort_order === "number" ? r.sort_order : null,
            },
        ]),
    );

    const out: ChildScopedContactLinkRow[] = [];
    for (const raw of linkRows ?? []) {
        const row = raw as {
            customer_member_id: string;
            contact_id?: string | null;
            role_key?: string | null;
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
        const roleMeta = roleMetaByKey.get(roleKey);
        out.push({
            customer_member_id: memberId,
            child_person_id: personIdByMemberId.get(memberId) ?? null,
            person_id: trimOrNull(contact?.person_id),
            contact_id: trimOrNull(row.contact_id) ?? trimOrNull(contact?.id),
            display_name: displayName,
            role_type: roleKey,
            role_label: roleMeta?.label ?? roleKey,
            is_primary: roleKey === "primary_contact" || roleKey === "primary",
            phone: trimOrNull(contact?.phone),
            email: trimOrNull(contact?.email),
            sort_order: roleMeta?.sort_order ?? null,
        });
    }

    const links = out.sort((a, b) => {
        const orderA = a.sort_order ?? 999;
        const orderB = b.sort_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return a.display_name.localeCompare(b.display_name);
    });

    return {
        links,
        memberContactsQueryError: null,
        roleLabelsQueryError,
    };
}
