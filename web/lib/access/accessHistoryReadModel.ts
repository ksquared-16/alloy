import type { SupabaseClient } from "@supabase/supabase-js";

import {
    presentAccessEvent,
    type AccessEventRow,
    type AccessHistoryEntry,
    type AccessHistoryDisplayNames,
} from "@/lib/access/accessHistoryPresenter";
import type { PermissionCatalogEntry } from "@/lib/admin/permissionGrid";

/**
 * THE canonical Access history projection. One read model, three surfaces.
 *
 * The organization feed, the user detail and the role detail all call this. None of them queries
 * `mutation_events` directly — if they did, three screens would each own a slightly different idea
 * of what an access change is, and the first divergence would be invisible.
 *
 * ── ORG COMES FROM THE CALLER'S CONTEXT, NEVER FROM THE SUBJECT ──
 *
 * Every query filters `org_id` from the authenticated access context. A `subjectId` is a FILTER
 * inside that org, never a way to select which org is read: letting a subject id widen scope is
 * precisely how a forged id reads another tenant's history.
 *
 * ── BOUNDED FROM V1 ──
 *
 * `limit` is clamped and the order is `committed_at DESC, id DESC`. The id is a uuid, so it is not a
 * chronological tiebreaker — it is a DETERMINISTIC one, which is what pagination actually needs:
 * two events in the same microsecond must not swap places between page 1 and page 2. The keyset
 * cursor carries both halves for the same reason.
 */

export const ACCESS_HISTORY_DOMAIN = "access" as const;
export const ACCESS_HISTORY_DEFAULT_LIMIT = 25;
export const ACCESS_HISTORY_MAX_LIMIT = 100;

export type AccessHistoryQuery = {
    orgId: string;
    /** Restrict to one person's access — membership, removal and scope events about them. */
    subjectUserId?: string | null;
    /** Restrict to one role — creation, update and capability changes on it. */
    roleKey?: string | null;
    limit?: number;
    /** Keyset cursor from a previous page's `nextCursor`. */
    cursor?: { committedAt: string; id: string } | null;
};

export type AccessHistoryPage = {
    entries: AccessHistoryEntry[];
    nextCursor: { committedAt: string; id: string } | null;
};

function clampLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit)) return ACCESS_HISTORY_DEFAULT_LIMIT;
    return Math.min(Math.max(Math.trunc(limit as number), 1), ACCESS_HISTORY_MAX_LIMIT);
}

/**
 * Read one page of access history.
 *
 * `names` and `catalog` are supplied by the caller so this module does no presentation lookups of
 * its own — the same reason the presenter takes them: one data-access owner, one rendering owner.
 */
export async function readAccessHistory(
    supabase: SupabaseClient,
    query: AccessHistoryQuery,
    names: AccessHistoryDisplayNames,
    catalog: PermissionCatalogEntry[]
): Promise<AccessHistoryPage> {
    const limit = clampLimit(query.limit);

    let q = supabase
        .from("mutation_events")
        .select("id, committed_at, command_key, subject_id, subject_type, previous_state, new_state, operator_id, origin, context_payload")
        .eq("org_id", query.orgId)
        .eq("domain", ACCESS_HISTORY_DOMAIN)
        .order("committed_at", { ascending: false })
        .order("id", { ascending: false })
        // One extra row decides whether another page exists, without a second count query.
        .limit(limit + 1);

    if (query.subjectUserId) {
        // Person context: events whose SUBJECT is this person. A capability change on a role they
        // hold is a role event, and belongs to the role's history — showing it here would imply the
        // person was individually changed.
        q = q.eq("subject_id", query.subjectUserId);
    }

    if (query.roleKey) {
        // Role context keys on the stored role_key rather than the role's uuid, because the uuid is
        // gone once the role is deleted and the history must survive that.
        q = q.eq("context_payload->>role_key", query.roleKey);
    }

    if (query.cursor) {
        // Keyset, not offset: an event inserted between page reads must not shift the window and
        // cause a duplicate or a skip.
        q = q.or(
            `committed_at.lt.${query.cursor.committedAt},and(committed_at.eq.${query.cursor.committedAt},id.lt.${query.cursor.id})`
        );
    }

    const { data, error } = await q;
    if (error) throw new Error(`access_history_read_failed: ${error.message}`);

    const rows = (data ?? []) as unknown as AccessEventRow[];
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];

    return {
        entries: page.map((row) => presentAccessEvent(row, names, catalog)),
        nextCursor:
            rows.length > limit && last ? { committedAt: last.committed_at, id: last.id } : null,
    };
}
