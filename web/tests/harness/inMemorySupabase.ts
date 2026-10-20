/**
 * An in-memory stand-in for the service-role Supabase client — tables, filters and storage.
 *
 * WHY THIS AND NOT A STUB PER QUERY
 * A stub that answers "the next query returns X" proves only that a route ASKED something. The
 * document authorization chain asks several things in a data-dependent order — the document row,
 * then (for a scope-restricted actor) the opportunity, its work unit, its department, a vendor's
 * referenced files — and the decision is only as good as the filters each query applies. Here every
 * query is evaluated against seeded rows with the filters it actually sent, so the REAL route, the
 * REAL `assertDocumentAccess` and the REAL `accessScope` helpers run unmodified and a wrong or
 * missing `.eq("org_id", …)` returns the wrong rows exactly as Postgres would.
 *
 * Supported surface: `from(t).select().eq().neq().in().is().order().limit().range()`,
 * `.maybeSingle()`, `.single()`, awaiting the builder; `insert`/`update`/`delete` with the same
 * filters and an optional `.select().single()`; `storage.from(b).createSignedUrl/download/remove/
 * upload`. Unknown tables read as empty. Every storage call and every write is recorded.
 */

export type Row = Record<string, unknown>;

type Filter = (row: Row) => boolean;

type Result = { data: unknown; error: { message: string; code?: string } | null };

let idCounter = 0;
function newId(): string {
    idCounter += 1;
    return `eeeeeeee-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

export class InMemorySupabase {
    tables: Record<string, Row[]> = {};
    objects = new Map<string, Uint8Array>();
    signCalls: Array<{ bucket: string; path: string; expires: number }> = [];
    downloadCalls: Array<{ bucket: string; path: string }> = [];
    removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    uploadCalls: Array<{ bucket: string; path: string; bytes: number }> = [];
    /** Tables whose INSERT fails, to prove a route refuses when its audit cannot be written. */
    failInsertInto = new Set<string>();

    seed(table: string, rows: Row[]): this {
        this.tables[table] = [...(this.tables[table] ?? []), ...rows.map((r) => ({ ...r }))];
        return this;
    }

    putObject(bucket: string, path: string, content = "bytes"): this {
        this.objects.set(`${bucket}/${path}`, new TextEncoder().encode(content));
        return this;
    }

    rows(table: string): Row[] {
        return this.tables[table] ?? [];
    }

    from(table: string): QueryBuilder {
        return new QueryBuilder(this, table);
    }

    get storage() {
        return {
            from: (bucket: string) => ({
                createSignedUrl: async (path: string, expires: number) => {
                    this.signCalls.push({ bucket, path, expires });
                    return { data: { signedUrl: `https://storage.invalid/${bucket}/${path}?sig=test&exp=${expires}` }, error: null };
                },
                download: async (path: string) => {
                    this.downloadCalls.push({ bucket, path });
                    const bytes = this.objects.get(`${bucket}/${path}`);
                    if (!bytes) return { data: null, error: { message: "Object not found" } };
                    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
                    return { data: new Blob([copy]), error: null };
                },
                remove: async (paths: string[]) => {
                    this.removeCalls.push({ bucket, paths: [...paths] });
                    for (const p of paths) this.objects.delete(`${bucket}/${p}`);
                    return { data: paths.map((name) => ({ name })), error: null };
                },
                upload: async (path: string, body: Uint8Array | ArrayBuffer | Blob) => {
                    const bytes =
                        body instanceof Uint8Array
                            ? body
                            : body instanceof ArrayBuffer
                              ? new Uint8Array(body)
                              : new Uint8Array(await (body as Blob).arrayBuffer());
                    this.uploadCalls.push({ bucket, path, bytes: bytes.length });
                    this.objects.set(`${bucket}/${path}`, bytes);
                    return { data: { path }, error: null };
                },
            }),
        };
    }
}

class QueryBuilder implements PromiseLike<Result> {
    private op: "select" | "insert" | "update" | "delete" = "select";
    private filters: Filter[] = [];
    private payload: Row[] = [];
    private patch: Row = {};
    private limitN: number | null = null;
    private returning = false;

    constructor(
        private readonly db: InMemorySupabase,
        private readonly table: string,
    ) {}

    /** Column lists are accepted and ignored: every seeded column is returned. */
    select(...columns: unknown[]): this {
        void columns;
        if (this.op !== "select") this.returning = true;
        return this;
    }
    insert(rows: Row | Row[]): this {
        this.op = "insert";
        this.payload = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r }));
        return this;
    }
    upsert(rows: Row | Row[]): this {
        return this.insert(rows);
    }
    update(patch: Row): this {
        this.op = "update";
        this.patch = { ...patch };
        return this;
    }
    delete(): this {
        this.op = "delete";
        return this;
    }
    eq(col: string, val: unknown): this {
        this.filters.push((r) => r[col] === val);
        return this;
    }
    neq(col: string, val: unknown): this {
        this.filters.push((r) => r[col] !== val);
        return this;
    }
    in(col: string, vals: unknown[]): this {
        this.filters.push((r) => vals.includes(r[col]));
        return this;
    }
    is(col: string, val: unknown): this {
        this.filters.push((r) => (val === null ? r[col] == null : r[col] === val));
        return this;
    }
    /**
     * PostgREST `or` filter — the `col.eq.value` and `col.is.null` terms this codebase uses. An
     * unrecognised term throws rather than matching everything, so a test cannot pass on a filter
     * the fake silently ignored.
     */
    or(expression: string): this {
        const terms = expression.split(",").map((term) => {
            const [col, op, ...rest] = term.trim().split(".");
            const value = rest.join(".");
            if (op === "eq") return (r: Row) => String(r[col]) === value;
            if (op === "is" && value === "null") return (r: Row) => r[col] == null;
            throw new Error(`InMemorySupabase.or: unsupported term "${term}"`);
        });
        this.filters.push((r) => terms.some((t) => t(r)));
        return this;
    }
    order(): this {
        return this;
    }
    limit(n: number): this {
        this.limitN = n;
        return this;
    }
    range(from: number, to: number): this {
        this.limitN = to - from + 1;
        return this;
    }

    private matching(): Row[] {
        return (this.db.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    }

    private execute(): Result {
        if (this.op === "insert") {
            if (this.db.failInsertInto.has(this.table)) {
                return { data: null, error: { message: `insert into ${this.table} failed (test)` } };
            }
            const inserted = this.payload.map((r) => ({ id: newId(), ...r }));
            this.db.tables[this.table] = [...(this.db.tables[this.table] ?? []), ...inserted];
            return { data: this.returning ? inserted : null, error: null };
        }
        if (this.op === "update") {
            const hit = this.matching();
            for (const r of hit) Object.assign(r, this.patch);
            return { data: this.returning ? hit : null, error: null };
        }
        if (this.op === "delete") {
            const hit = new Set(this.matching());
            this.db.tables[this.table] = (this.db.tables[this.table] ?? []).filter((r) => !hit.has(r));
            return { data: this.returning ? [...hit] : null, error: null };
        }
        const rows = this.matching();
        return { data: this.limitN == null ? rows : rows.slice(0, this.limitN), error: null };
    }

    async maybeSingle(): Promise<Result> {
        const res = this.execute();
        if (res.error) return res;
        const rows = (res.data as Row[] | null) ?? [];
        if (rows.length > 1) return { data: null, error: { message: "multiple rows", code: "PGRST116" } };
        return { data: rows[0] ?? null, error: null };
    }

    async single(): Promise<Result> {
        const res = this.execute();
        if (res.error) return res;
        const rows = (res.data as Row[] | null) ?? [];
        if (rows.length !== 1) return { data: null, error: { message: "expected one row", code: "PGRST116" } };
        return { data: rows[0], error: null };
    }

    then<TResult1 = Result, TResult2 = never>(
        onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
        return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }
}
