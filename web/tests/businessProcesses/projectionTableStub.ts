/**
 * An in-memory PostgREST subset for projection tests: applies eq / lte / gte / gt / in / not-in /
 * or(end_date null-or-gte) / order / range exactly as the database would, and records every read and
 * every write attempt (none is allowed from a projection).
 */
type Row = Record<string, unknown>;

export function projectionTableStub(tables: Record<string, Row[]>) {
    const writes: string[] = [];
    const reads: string[] = [];
    const client = {
        writes,
        reads,
        from(table: string) {
            reads.push(table);
            const preds: Array<(r: Row) => boolean> = [];
            let orderCol: string | null = null;
            const exec = (from?: number, to?: number) => {
                let rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
                if (orderCol) rows = [...rows].sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])));
                if (from != null && to != null) rows = rows.slice(from, to + 1);
                return Promise.resolve({ data: rows, error: null });
            };
            const b: Record<string, unknown> = {
                select: () => b,
                eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), b),
                lte: (c: string, v: string) => (preds.push((r) => r[c] != null && String(r[c]) <= v), b),
                gte: (c: string, v: string) => (preds.push((r) => r[c] != null && String(r[c]) >= v), b),
                gt: (c: string, v: string) => (preds.push((r) => r[c] != null && String(r[c]) > v), b),
                in: (c: string, vs: unknown[]) => (preds.push((r) => vs.includes(r[c])), b),
                not: (c: string, _op: string, list: string) => {
                    const vals = list.replace(/[()]/g, "").split(",");
                    preds.push((r) => !vals.includes(String(r[c])));
                    return b;
                },
                or: (expr: string) => {
                    const m = /end_date\.is\.null,end_date\.gte\.(\d{4}-\d{2}-\d{2})/.exec(expr);
                    if (!m) throw new Error(`unsupported or(): ${expr}`);
                    preds.push((r) => r.end_date == null || String(r.end_date) >= m[1]!);
                    return b;
                },
                order: (c: string) => ((orderCol = c), b),
                range: (from: number, to: number) => exec(from, to),
                then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => exec().then(res, rej),
                insert: () => (writes.push(`insert:${table}`), b),
                update: () => (writes.push(`update:${table}`), b),
                upsert: () => (writes.push(`upsert:${table}`), b),
                delete: () => (writes.push(`delete:${table}`), b),
            };
            return b;
        },
    };
    return client as unknown as import("@supabase/supabase-js").SupabaseClient & { writes: string[]; reads: string[] };
}
