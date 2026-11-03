/**
 * SCHEMA-AWARE CLIENT — wraps an in-memory Supabase mock so every request is checked against the
 * schema replayed from `supabase/migrations` (migrationSchema.ts) before it reaches the store, the
 * way PostgREST checks it against Postgres:
 *
 *   · an unknown table → `{ data: null, error: { code: "42P01" } }`;
 *   · an unknown column in a projection, filter, order, insert or update → `{ code: "42703" }`;
 *   · a projection returns only the projected columns, as the server does.
 *
 * A refused request never reaches the store — a refused delete removes nothing. Every request that
 * does run is logged in order (`ops`), so a test can prove what was read and deleted, and when.
 * `fail` plants a server failure on one request (by table and kind) without any schema change.
 *
 * Embedded resources (`rel(...)`, `alias:rel!fk(...)`) are passed through unchecked: the mock does
 * not model joins, and the fixture under test never embeds.
 */
import type { MigrationSchema } from "./migrationSchema";

export type SchemaOp = { kind: "select" | "insert" | "update" | "delete"; table: string; columns: string[] | "*"; filters: string[]; rows: number | null; refused: string | null };
export type PlantedFailure = { table: string; kind: SchemaOp["kind"]; code: string; skip?: number };

const plain = /^[A-Za-z_][A-Za-z_0-9]*$/;
/** `a->>b` and `a->b` address column `a`. */
const baseColumn = (c: string) => c.split("->")[0].trim();

function projection(cols: string | undefined): { columns: string[] | "*"; checked: string[] } {
    if (cols == null || cols.trim() === "*") return { columns: "*", checked: [] };
    const parts: string[] = [];
    let depth = 0, cur = "";
    for (const c of cols) {
        if (c === "(") depth++;
        if (c === ")") depth--;
        if (c === "," && depth === 0) { parts.push(cur.trim()); cur = ""; continue; }
        cur += c;
    }
    if (cur.trim()) parts.push(cur.trim());
    const checked: string[] = [];
    const columns: string[] = [];
    for (const p of parts) {
        if (p.includes("(")) continue; // an embedded resource
        const [alias, col] = p.includes(":") ? p.split(":").map((s) => s.trim()) : [null, p];
        const name = baseColumn(col.replace(/::.*$/, ""));
        if (name === "*") return { columns: "*", checked };
        checked.push(name);
        columns.push(alias ?? name);
    }
    return { columns, checked };
}

export function schemaAwareSupabase<T extends object>(db: T, schema: MigrationSchema, opts: { fail?: PlantedFailure[] } = {}) {
    const ops: SchemaOp[] = [];
    const seen = new Map<string, number>();
    const plantedFor = (table: string, kind: SchemaOp["kind"]) => {
        const p = (opts.fail ?? []).find((f) => f.table === table && f.kind === kind);
        if (!p) return null;
        const n = seen.get(`${table}:${kind}`) ?? 0;
        seen.set(`${table}:${kind}`, n + 1);
        return n >= (p.skip ?? 0) ? p.code : null;
    };

    const from = (table: string) => {
        const target = (db as { from: (t: string) => any }).from(table);
        const cols = schema.tables.get(table);
        const state: SchemaOp = { kind: "select", table, columns: "*", filters: [], rows: null, refused: cols ? null : "42P01" };
        let returning = false;
        const check = (names: string[]) => {
            if (state.refused || !cols) return;
            for (const n of names) if (!plain.test(n) || !cols.has(n)) { state.refused = "42703"; return; }
        };
        const settle = (res: { data: unknown; error: unknown }) => {
            if (!res.error && Array.isArray(res.data) && state.columns !== "*" && (state.kind === "select" || returning)) {
                const keep = state.columns;
                res = { ...res, data: res.data.map((r: Record<string, unknown>) => Object.fromEntries(keep.map((k) => [k, r[k]]))) };
            }
            state.rows = !res.error && Array.isArray(res.data) ? res.data.length : res.error ? null : res.data ? 1 : 0;
            ops.push({ ...state, filters: [...state.filters] });
            return res;
        };
        const refusal = () => {
            ops.push({ ...state, filters: [...state.filters], rows: null });
            return { data: null, error: { code: state.refused, message: state.refused === "42P01" ? "relation does not exist" : "column does not exist" } };
        };

        const proxy: any = new Proxy(target, {
            get(t, prop) {
                if (prop === "then" || prop === "single" || prop === "maybeSingle") {
                    return (...args: any[]) => {
                        if (state.refused) {
                            const p = Promise.resolve(refusal());
                            return prop === "then" ? p.then(args[0], args[1]) : p;
                        }
                        const planted = plantedFor(table, state.kind);
                        if (planted) {
                            ops.push({ ...state, filters: [...state.filters], rows: null, refused: planted });
                            const p = Promise.resolve({ data: null, error: { code: planted, message: "planted" } });
                            return prop === "then" ? p.then(args[0], args[1]) : p;
                        }
                        if (prop === "then") return t.then((res: any) => settle(res)).then(args[0], args[1]);
                        return t[prop]().then((res: any) => settle(res));
                    };
                }
                const v = t[prop];
                if (typeof v !== "function") return v;
                return (...a: any[]) => {
                    if (prop === "select") {
                        const p = projection(a[0]);
                        check(p.checked);
                        if (state.kind === "select") state.columns = p.columns;
                        else { returning = true; state.columns = p.columns; }
                    } else if (prop === "insert" || prop === "update" || prop === "upsert") {
                        state.kind = prop === "upsert" ? "insert" : prop;
                        const rows = Array.isArray(a[0]) ? a[0] : [a[0]];
                        check([...new Set(rows.flatMap((r: object) => Object.keys(r ?? {})))]);
                    } else if (prop === "delete") {
                        state.kind = "delete";
                    } else if (["eq", "neq", "is", "in", "lt", "lte", "gt", "gte", "like", "ilike", "contains", "order", "not"].includes(String(prop))) {
                        const c = baseColumn(String(a[0]));
                        check([c]);
                        state.filters.push(`${String(prop)}:${c}`);
                    }
                    const r = v.apply(t, a);
                    return r === t ? proxy : r;
                };
            },
        });
        return proxy;
    };

    const client = new Proxy(db, { get: (t, prop) => (prop === "from" ? from : (t as any)[prop]) }) as T;
    return { db: client, ops };
}
