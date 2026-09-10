/**
 * A small in-memory stand-in for PostgREST, so the trust chain can be exercised
 * end to end rather than stubbed a row at a time.
 *
 * This matters for what the certification actually proves. Returning a canned
 * row would test that the resolver reads fields; issuing a real credential and
 * then authenticating with it tests that the digest written at issuance is the
 * digest the resolver selects on — which is the part that would silently break.
 *
 * It models only what these modules use, and it FAILS LOUDLY on anything else,
 * so a future query shape cannot be quietly unproven.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

function matchesOr(row: Row, expr: string): boolean {
    // "col.eq.value,col2.eq.value"
    return expr.split(",").some((clause) => {
        const [col, op, ...rest] = clause.split(".");
        const value = rest.join(".");
        if (op !== "eq") throw new Error(`fakeSupabase: unsupported or() operator: ${op}`);
        return row[col] === value;
    });
}

export function createFakeSupabase(tables: Tables) {
    const db: Tables = JSON.parse(JSON.stringify(tables));

    function from(table: string) {
        if (!db[table]) db[table] = [];
        let working = [...db[table]];
        let pendingInsert: Row | null = null;
        let pendingUpdate: Row | null = null;

        const api: Record<string, unknown> = {};

        api.select = () => api;
        api.eq = (col: string, val: unknown) => {
            working = working.filter((r) => r[col] === val);
            return api;
        };
        api.or = (expr: string) => {
            working = working.filter((r) => matchesOr(r, expr));
            return api;
        };
        api.insert = (payload: Row) => {
            pendingInsert = { id: `${table}-${db[table].length + 1}`, ...payload };
            db[table].push(pendingInsert);
            working = [pendingInsert];
            return api;
        };
        api.update = (payload: Row) => {
            pendingUpdate = payload;
            return api;
        };
        api.maybeSingle = async () => {
            if (pendingUpdate) {
                for (const r of working) Object.assign(r, pendingUpdate);
            }
            if (working.length > 1) {
                return { data: null, error: { message: "multiple rows returned" } };
            }
            return { data: working[0] ?? null, error: null };
        };
        // An update() with no maybeSingle() still has to apply. Awaiting the
        // builder is how the production code performs a fire-and-forget write.
        api.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
            if (pendingUpdate) {
                for (const r of working) Object.assign(r, pendingUpdate);
            }
            return Promise.resolve({ data: working, error: null }).then(resolve);
        };

        return api;
    }

    // Shared fixed-window counters, so a rate-limit test exercises the same
    // consume-and-decide contract the SQL function implements.
    const windows = new Map<string, number>();

    /**
     * Mirrors `public.location_site_id` — the declared site-resolution authority:
     * a bounded, cycle-safe ancestor walk. Modelled rather than stubbed, because
     * the boundary contract depends on it and a stub would prove nothing.
     */
    function siteIdOf(locationId: string): string | null {
        const rows = db.locations ?? [];
        let cur: string | null = locationId;
        const seen = new Set<string>();
        for (let hops = 0; cur && hops < 8; hops++) {
            if (seen.has(cur)) return null;
            seen.add(cur);
            const row = rows.find((r) => r.id === cur) as Record<string, unknown> | undefined;
            if (!row) return null;
            if (row.location_type === "site") return String(row.id);
            cur = (row.parent_location_id as string | null) ?? null;
        }
        return null;
    }

    async function listExternalLocations(a: Record<string, unknown>) {
        const orgId = a.p_org_id as string;
        const mode = a.p_boundary_mode as string;
        const boundary = ((a.p_boundary as string[]) ?? []).filter(Boolean);
        const types = (a.p_types as string[] | null) ?? null;
        const parentId = (a.p_parent_id as string | null) ?? null;
        const locationIds = (a.p_location_ids as string[] | null) ?? null;
        const updatedSince = (a.p_updated_since as string | null) ?? null;
        const cursorSort = (a.p_cursor_sort as string | null) ?? null;
        const cursorId = (a.p_cursor_id as string | null) ?? null;
        const limit = Math.max(1, Math.min(Number(a.p_limit ?? 50), 200));

        const rows = (db.locations ?? []).filter((r) => {
            if (r.org_id !== orgId) return false;
            if (!["site", "unit"].includes(String(r.location_type))) return false;
            if (mode !== "org_wide") {
                const inBoundary =
                    boundary.includes(String(r.id)) || boundary.includes(String(siteIdOf(String(r.id)) ?? ""));
                if (!inBoundary) return false;
            }
            if (types && !types.includes(String(r.location_type))) return false;
            if (parentId && r.parent_location_id !== parentId) return false;
            if (locationIds && !locationIds.includes(String(r.id))) return false;
            if (updatedSince && String(r.updated_at ?? r.created_at) <= updatedSince) return false;
            return true;
        });

        const shaped = rows.map((r) => ({
            id: String(r.id),
            location_type: String(r.location_type),
            unit_role: (r.unit_role as string | null) ?? null,
            label: (r.label as string | null) ?? null,
            parent_location_id: (r.parent_location_id as string | null) ?? null,
            site_id: siteIdOf(String(r.id)),
            is_active: r.is_active !== false,
            timezone: (r.timezone as string | null) ?? null,
            sort_key: String(r.updated_at ?? r.created_at),
        }));

        shaped.sort((x, y) => (x.sort_key === y.sort_key ? x.id.localeCompare(y.id) : x.sort_key.localeCompare(y.sort_key)));

        const after = cursorSort
            ? shaped.filter((r) => r.sort_key > cursorSort || (r.sort_key === cursorSort && r.id > String(cursorId)))
            : shaped;

        return { data: after.slice(0, limit), error: null };
    }

    async function rpc(fn: string, args: Record<string, unknown>) {
        if (fn === "list_external_locations") return listExternalLocations(args);
        if (fn !== "consume_rate_limit") throw new Error(`fakeSupabase: unsupported rpc ${fn}`);
        const key = String(args.p_bucket_key);
        const limit = Number(args.p_limit);
        const windowSeconds = Number(args.p_window_seconds);
        const next = (windows.get(key) ?? 0) + 1;
        windows.set(key, next);
        return {
            data: [
                {
                    allowed: next <= limit,
                    current_count: next,
                    reset_at: new Date(Date.now() + windowSeconds * 1000).toISOString(),
                },
            ],
            error: null,
        };
    }

    return {
        client: { from, rpc } as unknown as SupabaseClient,
        resetWindows() {
            windows.clear();
        },
        db,
        rows(table: string) {
            return db[table] ?? [];
        },
    };
}
