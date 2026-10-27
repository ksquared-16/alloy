/**
 * A small in-memory Supabase stand-in for the calendar's reads: eq / in / is /
 * lt / gt / order, maybeSingle, and `or` for the two shapes the calendar uses
 * (`valid_to.is.null,valid_to.gt.X` and `lineage_root_id.in.(…),id.in.(…)`).
 * Unknown filters throw, so a query the fake cannot honour fails loudly
 * instead of returning everything.
 */

type Row = Record<string, unknown>;

export function fakeSupabase(tables: Record<string, Row[]>, log: string[] = []) {
    function builder(table: string) {
        const filters: Array<(r: Row) => boolean> = [];
        const b: Record<string, unknown> = {};
        const self = () => b;
        Object.assign(b, {
            select: self,
            order: self,
            limit: self,
            eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), b),
            neq: (col: string, v: unknown) => (filters.push((r) => r[col] !== v), b),
            in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b),
            is: (col: string, v: unknown) => (filters.push((r) => (r[col] ?? null) === v), b),
            lt: (col: string, v: string) => (filters.push((r) => String(r[col]) < v), b),
            lte: (col: string, v: string) => (filters.push((r) => String(r[col]) <= v), b),
            gt: (col: string, v: string) => (filters.push((r) => String(r[col]) > v), b),
            gte: (col: string, v: string) => (filters.push((r) => String(r[col]) >= v), b),
            or: (expr: string) => {
                const validTo = /^valid_to\.is\.null,valid_to\.gt\.(.+)$/.exec(expr);
                if (validTo) {
                    const t = validTo[1]!;
                    filters.push((r) => r.valid_to == null || Date.parse(String(r.valid_to)) > Date.parse(t));
                    return b;
                }
                const lineage = /^lineage_root_id\.in\.\(([^)]*)\),id\.in\.\(([^)]*)\)$/.exec(expr);
                if (lineage) {
                    const roots = lineage[1]!.split(",");
                    filters.push((r) => roots.includes(String(r.lineage_root_id)) || roots.includes(String(r.id)));
                    return b;
                }
                throw new Error(`fakeSupabase: unsupported or(${expr})`);
            },
            maybeSingle: async () => {
                log.push(`${table}:maybeSingle`);
                const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
                return { data: rows[0] ?? null, error: null };
            },
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
                log.push(`${table}:select`);
                try {
                    const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
                    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
                } catch (e) {
                    return reject ? reject(e) : Promise.reject(e);
                }
            },
        });
        return b;
    }
    return { from: (table: string) => builder(table) } as never;
}
