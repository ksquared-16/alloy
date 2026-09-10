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

    async function rpc(fn: string, args: Record<string, unknown>) {
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
