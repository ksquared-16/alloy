/**
 * Compact in-memory Supabase mock for employment / Add Staff service tests.
 *
 * Records every table it is asked to write so a test can assert on ABSENCE —
 * "creating employment wrote nothing to auth users, user_roles, or any access
 * table" is only meaningful if an unexpected write would have been captured.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

export const ORG_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
export const SITE_ID = "33333333-3333-4333-8333-333333333333";

export type EmploymentMockStore = Record<string, Row[]>;

export type EmploymentMock = {
    supabase: SupabaseClient;
    store: EmploymentMockStore;
    /** Every table name that received an insert or update, in order. */
    writes: { table: string; op: "insert" | "update"; row: Row }[];
    /** Every table name that was read, in order — lets a test assert on N+1. */
    reads: string[];
    rpcCalls: { fn: string; args: Row }[];
};

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

const DEFAULT_TABLES = [
    "persons",
    "employments",
    "employment_positions",
    "locations",
    "schedule_assignments",
    "schedule_patterns",
    "customer_members",
    "child_enrollment_agreements",
    "operational_assignment_types",
    "field_definitions",
    "field_values",
    "user_roles",
    "user_access_profiles",
    "user_site_access",
    "user_department_access",
    "app_users",
];

export function createEmploymentMock(seed?: EmploymentMockStore): EmploymentMock {
    const store: EmploymentMockStore = {};
    for (const t of DEFAULT_TABLES) store[t] = clone(seed?.[t] ?? []);
    for (const [k, v] of Object.entries(seed ?? {})) if (!store[k]) store[k] = clone(v);

    const writes: EmploymentMock["writes"] = [];
    const reads: string[] = [];
    const rpcCalls: EmploymentMock["rpcCalls"] = [];
    let idCounter = 0;

    function table(name: string): Row[] {
        if (!store[name]) store[name] = [];
        return store[name];
    }

    function builder(name: string) {
        let rows = () => clone(table(name));
        const filters: ((r: Row) => boolean)[] = [];
        let pending: { op: "insert" | "update"; payload: Row } | null = null;

        const api: Record<string, unknown> = {};

        const applyFilters = (list: Row[]) => list.filter((r) => filters.every((f) => f(r)));

        const runPending = (): Row[] => {
            if (!pending) {
                reads.push(name);
                return applyFilters(rows());
            }
            if (pending.op === "insert") {
                idCounter += 1;
                const row: Row = {
                    id: `${name}-${idCounter}`,
                    created_at: "2026-08-11T00:00:00.000Z",
                    updated_at: "2026-08-11T00:00:00.000Z",
                    ...pending.payload,
                };
                table(name).push(clone(row));
                writes.push({ table: name, op: "insert", row: clone(row) });
                return [clone(row)];
            }
            const targets = applyFilters(table(name));
            const updated: Row[] = [];
            for (const t of targets) {
                Object.assign(t, pending.payload, { updated_at: "2026-08-11T00:00:01.000Z" });
                writes.push({ table: name, op: "update", row: clone(t) });
                updated.push(clone(t));
            }
            return updated;
        };

        api.select = () => api;
        api.eq = (col: string, val: unknown) => {
            filters.push((r) => r[col] === val);
            return api;
        };
        // `.is(col, null)` is how PostgREST asks for NULL — `.eq` cannot express it, and a
        // context-free process instance is found no other way.
        api.is = (col: string, val: unknown) => {
            filters.push((r) => (val === null ? r[col] == null : r[col] === val));
            return api;
        };
        api.in = (col: string, vals: unknown[]) => {
            filters.push((r) => vals.includes(r[col]));
            return api;
        };
        // The canonical resolver matches email/name case-insensitively. Without
        // this the mock would silently return no candidates and the duplicate
        // tests would pass for the wrong reason.
        api.ilike = (col: string, pattern: string) => {
            const rx = new RegExp(
                `^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`,
                "i"
            );
            filters.push((r) => (r[col] == null ? false : rx.test(String(r[col]))));
            return api;
        };
        api.lte = (col: string, val: unknown) => {
            filters.push((r) => r[col] != null && String(r[col]) <= String(val));
            return api;
        };
        api.gte = (col: string, val: unknown) => {
            filters.push((r) => r[col] != null && String(r[col]) >= String(val));
            return api;
        };
        /**
         * PostgREST `.or("a.is.null,b.gt.x")` — a disjunction over the SAME row.
         *
         * Implemented rather than stubbed, because the shapes this mock exists to prove
         * are exactly the ones a permissive `.or` would hide: an effective-dated row is
         * "still in force" when `valid_to IS NULL` **or** it ends after the instant asked
         * about, and a stub returning every row would call a closed record open and the
         * suite would pass for the wrong reason.
         */
        api.or = (expr: string) => {
            const clauses = String(expr).split(",").map((c) => c.trim()).filter(Boolean);
            const predicates = clauses.map((clause) => {
                const first = clause.indexOf(".");
                const second = clause.indexOf(".", first + 1);
                if (first < 0 || second < 0) {
                    throw new Error(`mockEmploymentSupabase: unparseable .or clause "${clause}"`);
                }
                const col = clause.slice(0, first);
                const op = clause.slice(first + 1, second);
                const raw = clause.slice(second + 1);
                // Validated HERE, not inside the row predicate: an unsupported operator is
                // a fault in the test, and it should surface where the query was written
                // rather than later, during filtering, looking like missing data.
                const compare: Record<string, (v: unknown) => boolean> = {
                    is: (v) => (raw === "null" ? v == null : String(v) === raw),
                    eq: (v) => String(v) === raw,
                    neq: (v) => String(v) !== raw,
                    gt: (v) => v != null && String(v) > raw,
                    gte: (v) => v != null && String(v) >= raw,
                    lt: (v) => v != null && String(v) < raw,
                    lte: (v) => v != null && String(v) <= raw,
                };
                const fn = compare[op];
                if (!fn) throw new Error(`mockEmploymentSupabase: unsupported .or operator "${op}"`);
                return (r: Row): boolean => fn(r[col]);
            });
            filters.push((r) => predicates.some((p) => p(r)));
            return api;
        };
        api.order = () => api;
        api.limit = () => api;
        api.insert = (payload: Row) => {
            pending = { op: "insert", payload };
            return api;
        };
        // `.upsert` with `ignoreDuplicates` returns the EXISTING row rather than writing a
        // second one, which is what makes the caller idempotent.
        api.upsert = (payload: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
            const cols = (opts?.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
            const existing =
                cols.length > 0
                    ? table(name).find((r) => cols.every((c) => r[c] === payload[c]))
                    : undefined;
            if (existing) {
                pending = null;
                rows = () => [clone(existing)];
                return api;
            }
            pending = { op: "insert", payload };
            return api;
        };
        api.update = (payload: Row) => {
            pending = { op: "update", payload };
            return api;
        };
        api.maybeSingle = async () => {
            const list = runPending();
            return { data: list[0] ?? null, error: null };
        };
        api.single = async () => {
            const list = runPending();
            if (list.length === 0) return { data: null, error: { message: "no rows" } };
            return { data: list[0], error: null };
        };
        api.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
            Promise.resolve({ data: runPending(), error: null }).then(resolve);

        return api;
    }

    const supabase = {
        from: (name: string) => builder(name),
        rpc: async (fn: string, args: Row) => {
            rpcCalls.push({ fn, args });
            if (fn === "person_is_employed_on") {
                const onDate = String(args.p_on_date);
                const hit = table("employments").some(
                    (e) =>
                        e.org_id === args.p_org_id &&
                        e.person_id === args.p_person_id &&
                        e.employment_status !== "canceled" &&
                        String(e.start_date) <= onDate &&
                        (e.end_date == null || String(e.end_date) >= onDate)
                );
                return { data: hit, error: null };
            }
            return { data: null, error: null };
        },
    } as unknown as SupabaseClient;

    return { supabase, store, writes, reads, rpcCalls };
}

/** Tables that must never be written by employment. Employment is not access. */
export const ACCESS_TABLES = [
    "user_roles",
    "user_access_profiles",
    "user_site_access",
    "user_department_access",
    "app_users",
];
