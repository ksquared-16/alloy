/**
 * A small in-memory Supabase for Processing tests: select / eq / in / or (is.null, lt) / insert / update,
 * with the one-pending-request-per-child unique index of `processing_participant_child_requests`.
 */
export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

let seq = 0;

function pendingKey(r: Row): string {
    const f = (v: unknown) => String(v ?? "").trim().toLowerCase();
    return [r.org_id, r.customer_id, f(r.first_name), f(r.last_name), r.date_of_birth].join("|");
}

function orFilter(expr: string): (r: Row) => boolean {
    const parts = expr.split(",").map((p) => p.split("."));
    return (r) =>
        parts.some(([col, op, ...rest]) => {
            const v = rest.join(".");
            if (op === "is" && v === "null") return r[col!] == null;
            if (op === "lt") return r[col!] != null && String(r[col!]) < v;
            if (op === "eq") return String(r[col!]) === v;
            return false;
        });
}

export function fakeDb(tables: Tables) {
    return {
        tables,
        from(table: string) {
            tables[table] ??= [];
            const filters: Array<(r: Row) => boolean> = [];
            let mode: "select" | "update" | "insert" = "select";
            let patch: Row = {};
            let inserted: Row[] = [];
            let insertError: { code: string; message: string } | null = null;
            const matching = () => tables[table]!.filter((r) => filters.every((f) => f(r)));
            const run = () => {
                if (mode === "insert") return insertError ? { data: null, error: insertError } : { data: inserted, error: null };
                if (mode === "update") {
                    const hit = matching();
                    for (const r of hit) Object.assign(r, patch);
                    return { data: hit, error: null };
                }
                return { data: matching(), error: null };
            };
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return api; },
                or: (expr: string) => { filters.push(orFilter(expr)); return api; },
                limit: () => api,
                order: () => api,
                insert: (value: Row | Row[]) => {
                    mode = "insert";
                    const rows = (Array.isArray(value) ? value : [value]).map((v) => ({
                        id: `${table}-${++seq}`,
                        status: table === "processing_participant_child_requests" ? "pending" : undefined,
                        created_at: new Date(Date.UTC(2026, 9, 18, 0, 0, seq)).toISOString(),
                        metadata: {},
                        commit_claimed_at: null,
                        ...v,
                    }));
                    if (table === "processing_participant_child_requests") {
                        for (const r of rows) {
                            if (tables[table]!.some((e) => e.status === "pending" && pendingKey(e) === pendingKey(r))) {
                                insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
                            }
                        }
                    }
                    if (!insertError) tables[table]!.push(...rows);
                    inserted = rows;
                    return api;
                },
                update: (p: Row) => { mode = "update"; patch = p; return api; },
                maybeSingle: async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error }; },
                single: async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error }; },
                then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
                    try { resolve(run()); } catch (e) { reject?.(e); }
                },
            };
            return api;
        },
    };
}
