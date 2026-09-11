import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import {
    readAccessHistory,
    ACCESS_HISTORY_DEFAULT_LIMIT,
    ACCESS_HISTORY_MAX_LIMIT,
} from "@/lib/access/accessHistoryReadModel";
import type { AccessHistoryDisplayNames } from "@/lib/access/accessHistoryPresenter";
import type { PermissionCatalogEntry } from "@/lib/admin/permissionGrid";

export const dynamic = "force-dynamic";

/**
 * ONE route for Access history — organization, user and role.
 *
 * The three surfaces differ by FILTER, not by endpoint. Three endpoints over the same events would
 * be three chances for one of them to forget the org boundary, and the boundary is the whole
 * security property here.
 *
 * ── ORG COMES FROM THE SESSION, NEVER FROM THE QUERY ──
 *
 * There is deliberately no `org_id` parameter. `subject` and `role` are filters INSIDE the caller's
 * own organization; a forged subject id narrows the result to nothing rather than reaching another
 * tenant's events. `requireUsersRolesManageAuth` is the same gate the Access chapters and every
 * Access mutation route already use, so viewing who changed access requires the authority to change
 * it — no new capability was invented for reading.
 *
 * ── NOT RAW EVENTS ──
 *
 * The response is presenter-ready rows, not `mutation_events`. A client that had to interpret
 * `previous_state` would become a second presenter, and the first divergence between it and the role
 * editor would be invisible.
 */
export async function GET(request: NextRequest) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { orgId } = auth.access;

    const url = new URL(request.url);
    const subjectUserId = url.searchParams.get("subject");
    const roleKey = url.searchParams.get("role");
    const rawLimit = Number(url.searchParams.get("limit") ?? ACCESS_HISTORY_DEFAULT_LIMIT);
    const cursorAt = url.searchParams.get("cursor_at");
    const cursorId = url.searchParams.get("cursor_id");

    const supabase = createAdminClient();

    let page;
    try {
        page = await readAccessHistory(
            supabase,
            {
                orgId,
                subjectUserId,
                roleKey,
                limit: Number.isFinite(rawLimit) ? rawLimit : ACCESS_HISTORY_DEFAULT_LIMIT,
                cursor: cursorAt && cursorId ? { committedAt: cursorAt, id: cursorId } : null,
            },
            // Names are resolved AFTER the page is read, from the ids the page actually contains —
            // see `resolveDisplayNames`. Reading first keeps the lookup bounded by page size rather
            // than by the size of the organization.
            await resolveDisplayNames(supabase, orgId),
            await readCatalog(supabase)
        );
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }

    return NextResponse.json({
        entries: page.entries,
        next_cursor: page.nextCursor
            ? { cursor_at: page.nextCursor.committedAt, cursor_id: page.nextCursor.id }
            : null,
        limit: Math.min(Math.max(Math.trunc(rawLimit) || ACCESS_HISTORY_DEFAULT_LIMIT, 1), ACCESS_HISTORY_MAX_LIMIT),
    });
}

/**
 * Current labels for the organization's roles, people and locations.
 *
 * Org-scoped and complete rather than per-event, because the alternative — one lookup per row — is
 * the unbounded cohort read the Financials defect was. An organization's role and location catalogs
 * are small; people are read from the membership list, which is the same bound the Users chapter
 * already accepts.
 *
 * Anything absent from these maps is not an error. The presenter's fallback ladder turns a missing
 * id into "Deleted role (key)" rather than dropping the event, which is what keeps history readable
 * after the thing it describes is gone.
 */
async function resolveDisplayNames(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string
): Promise<AccessHistoryDisplayNames> {
    const [roles, locations, members] = await Promise.all([
        supabase.from("role_definitions").select("role_key, role_label").eq("org_id", orgId),
        supabase.from("locations").select("id, name").eq("org_id", orgId),
        supabase.from("user_roles").select("user_id").eq("org_id", orgId),
    ]);

    const roleMap = new Map<string, string>();
    for (const r of (roles.data ?? []) as { role_key: string; role_label: string | null }[]) {
        if (r.role_label) roleMap.set(r.role_key, r.role_label);
    }

    const locationMap = new Map<string, string>();
    for (const l of (locations.data ?? []) as { id: string; name: string | null }[]) {
        if (l.name) locationMap.set(l.id, l.name);
    }

    const peopleMap = new Map<string, string>();
    const ids = [...new Set(((members.data ?? []) as { user_id: string }[]).map((m) => m.user_id))];
    // `auth.admin.getUserById` is the identity source the members route already uses; there is no
    // other canonical one, so history uses it rather than introducing a second notion of a person.
    await Promise.all(
        ids.map(async (id) => {
            const { data } = await supabase.auth.admin.getUserById(id);
            const email = data?.user?.email;
            if (email) peopleMap.set(id, email);
        })
    );

    return { people: peopleMap, roles: roleMap, locations: locationMap };
}

async function readCatalog(
    supabase: ReturnType<typeof createAdminClient>
): Promise<PermissionCatalogEntry[]> {
    const { data } = await supabase
        .from("permission_definitions")
        .select("key, group_key, label")
        .eq("is_active", true);
    return (data ?? []) as PermissionCatalogEntry[];
}
