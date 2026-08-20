/**
 * W-61 — `role_key` integrity, and W-28 / `T-23` — the grant replacement that wiped a role.
 *
 * Both defects lived in one handler, `PUT /api/admin/rbac/grants`, and they compounded:
 *
 *   - `H3` — the handler validated `permission_key` against `permission_definitions` and never
 *     validated `role_key` at all. `(org_id, role_key)` IS foreign-keyed, so the write failed —
 *     but it failed as a constraint error, after the delete had already run.
 *   - `T-23` — the replacement was "delete every grant for this role, then insert the new set",
 *     untransacted. A failed insert left the role holding ZERO grants and returned 500. Same
 *     defect class as `T-13`, on a second authority table.
 *
 * The ordering is what made them one bug: an unvalidated `role_key` reached a statement that had
 * already destroyed the role's authority. Validating first means the destructive half is never
 * reached by a request the handler was always going to reject.
 *
 * **Scope of the W-28 claim — this changed, and the history is the point.** The replacement passed
 * through three shapes. It began as "delete every grant, then insert the new set", untransacted, so
 * a failed insert left the role holding ZERO grants. It became a fail-closed DELTA — read current,
 * delete only removals, upsert additions, removals first — which bounded the blast radius to
 * under-granting but was explicitly NOT atomic: a delta computed in application code from a prior
 * READ loses updates when two operators edit the same role, and no ordering fixes a race between a
 * read and a write.
 *
 * It is now ONE database operation. `replace_role_permission_grants` locks the role before it reads,
 * so concurrent replacements serialize; validation happens inside that transaction; delete and
 * insert cannot half-happen. The tests below therefore assert the ROUTE delegates the whole
 * transition and performs no destructive statement of its own, and the SQL-level block asserts the
 * properties that now live in the function. Atomicity IS claimed, and it is certified against the
 * applied alloy-cert schema — the serialization was proven by a second caller blocking on the
 * first, not by reading the lock statement.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";

const orgId = "org-1";

const { mockRequireUsersRolesManageAuth, mockRequirePortalOrUsersRolesManageAuth } = vi.hoisted(() => ({
    mockRequireUsersRolesManageAuth: vi.fn(),
    mockRequirePortalOrUsersRolesManageAuth: vi.fn(),
}));

vi.mock("@/lib/admin/canManageUsersAndRoles", () => ({
    requireUsersRolesManageAuth: mockRequireUsersRolesManageAuth,
    requirePortalOrUsersRolesManageAuth: mockRequirePortalOrUsersRolesManageAuth,
}));

const { mockClient } = vi.hoisted(() => ({ mockClient: { value: null as unknown } }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: vi.fn(() => mockClient.value) }));

import { PUT } from "@/app/api/admin/rbac/grants/route";

type Op = {
    table: string;
    kind: "select" | "delete" | "insert" | "upsert" | "rpc";
    filters: Record<string, unknown>;
    inList?: string[];
    rows?: Array<Record<string, unknown>>;
};

type Outcome = { data?: unknown; error?: { message: string } | null };

/**
 * A Supabase double that RECORDS every operation in order. Recording is the point: the
 * defect this file locks is not "the wrong value came back", it is "a destructive statement
 * ran, and it ran unscoped, and it ran before the check". Only an ordered op log can see that.
 */
function recordingClient(resolve: (op: Op) => Outcome) {
    const ops: Op[] = [];

    function builder(table: string, kind: Op["kind"], rows?: Array<Record<string, unknown>>) {
        const op: Op = { table, kind, filters: {}, rows };
        ops.push(op);
        const settle = () => {
            const out = resolve(op);
            return { data: out.data ?? null, error: out.error ?? null };
        };
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = (col: string, val: unknown) => {
            op.filters[col] = val;
            return b;
        };
        b.in = (col: string, list: string[]) => {
            op.inList = list;
            return b;
        };
        b.maybeSingle = () => Promise.resolve(settle());
        b.single = () => Promise.resolve(settle());
        b.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
            Promise.resolve(settle()).then(onOk, onErr);
        return b;
    }

    const client = {
        from: (table: string) => ({
            select: () => builder(table, "select"),
            delete: () => builder(table, "delete"),
            insert: (rows: Array<Record<string, unknown>>) => builder(table, "insert", rows),
            upsert: (rows: Array<Record<string, unknown>>) => builder(table, "upsert", rows),
        }),
        // W-28: the grant replacement is one RPC now, so the recorder has to be able to see it.
        // Recorded as an op like any other, which is what lets the tests below assert that the
        // route issues NO direct delete or upsert against `role_permission_grants` any more.
        rpc: (fn: string, args: Record<string, unknown>) => {
            const op: Op = { table: `rpc:${fn}`, kind: "rpc", filters: {}, rows: [args] };
            ops.push(op);
            const out = resolve(op);
            return Promise.resolve({ data: out.data ?? null, error: out.error ?? null });
        },
    };

    return { client, ops };
}

/** The default world: role `ops` exists and is active, and the catalog holds four keys. */
function defaultResolve(params: {
    roleRow?: unknown;
    roleError?: { message: string };
    currentGrants?: string[];
    currentError?: { message: string };
    writeError?: { message: string };
}) {
    return (op: Op): Outcome => {
        if (op.table === "role_definitions") {
            if (params.roleError) return { error: params.roleError };
            return { data: params.roleRow === undefined ? { role_key: "ops" } : params.roleRow };
        }
        if (op.table === "permission_definitions") {
            return { data: ["a.read", "a.write", "b.read", "b.write"].map((key) => ({ key })) };
        }
        // role_permission_grants
        if (op.kind === "select") {
            if (params.currentError) return { error: params.currentError };
            return { data: (params.currentGrants ?? []).map((permission_key) => ({ permission_key })) };
        }
        if (params.writeError) return { error: params.writeError };
        return { data: null };
    };
}

function putRequest(role_key: string, permission_keys: string[]) {
    return new NextRequest(
        `http://localhost/api/admin/rbac/grants?role_key=${encodeURIComponent(role_key)}`,
        { method: "PUT", body: JSON.stringify({ permission_keys }) },
    );
}

const grantOps = (ops: Op[]) => ops.filter((o) => o.table === "role_permission_grants");
const destructiveOps = (ops: Op[]) => grantOps(ops).filter((o) => o.kind === "delete");
const additiveOps = (ops: Op[]) => grantOps(ops).filter((o) => o.kind === "insert" || o.kind === "upsert");

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUsersRolesManageAuth.mockResolvedValue({
        ok: true,
        access: { ok: true, userId: "caller-1", orgId, roleKeys: ["admin"], permissionKeys: [] },
    });
});

describe("W-61 / H3 — the handler validates role_key before it writes", () => {
    it("rejects an undefined role_key with a stated error", async () => {
        const { client, ops } = recordingClient(defaultResolve({ roleRow: null }));
        mockClient.value = client;

        const res = await PUT(putRequest("no_such_role", ["a.read"]));
        const json = (await res.json()) as { error: string };

        expect(res.status).toBe(400);
        // A stated rejection naming the key — not a leaked FK constraint error.
        expect(json.error).toContain("no_such_role");
        expect(json.error).not.toMatch(/constraint|violates|fkey/i);
    });

    it("the database never sees a write for an undefined role_key", async () => {
        // The load-bearing assertion. Before W-61 the delete had already run by this point.
        const { client, ops } = recordingClient(defaultResolve({ roleRow: null, currentGrants: ["a.read"] }));
        mockClient.value = client;

        await PUT(putRequest("no_such_role", ["a.write"]));

        expect(grantOps(ops)).toEqual([]);
    });

    it("rejects a role that exists but is inactive", async () => {
        // The route filters on is_active, so an inactive role resolves to no row.
        const { client, ops } = recordingClient(defaultResolve({ roleRow: null }));
        mockClient.value = client;

        const res = await PUT(putRequest("retired_role", ["a.read"]));

        expect(res.status).toBe(400);
        expect(destructiveOps(ops)).toEqual([]);
    });

    it("scopes the role check to the caller's org and to active rows", async () => {
        const { client, ops } = recordingClient(defaultResolve({ currentGrants: [] }));
        mockClient.value = client;

        await PUT(putRequest("ops", ["a.read"]));
        const check = ops.find((o) => o.table === "role_definitions");

        expect(check?.filters).toMatchObject({ org_id: orgId, role_key: "ops", is_active: true });
    });

    it("fails closed when the role check itself cannot be read", async () => {
        // An unreadable role must not be treated as a valid one.
        const { client, ops } = recordingClient(defaultResolve({ roleError: { message: "boom" } }));
        mockClient.value = client;

        const res = await PUT(putRequest("ops", ["a.read"]));

        expect(res.status).toBe(500);
        expect(grantOps(ops)).toEqual([]);
    });

    it("is not vacuous — a valid, active role still reaches the write path", async () => {
        // Without this, a handler that rejected every request would pass every test above.
        const { client, ops } = recordingClient(defaultResolve({ currentGrants: [] }));
        mockClient.value = client;

        const res = await PUT(putRequest("ops", ["a.read"]));

        expect(res.status).toBe(200);
        // W-28 moved the write into one RPC, so "reached the write path" is now "reached the
        // function". Asserting `additiveOps` here would silently pass forever once the route
        // stopped writing directly — a control that cannot fail is not a control.
        expect(ops.filter((o) => o.kind === "rpc")).toHaveLength(1);
    });
});

describe("W-28 / S-12 — the replacement is one database operation", () => {
    /** Resolve the RPC as a success returning the committed set. */
    function rpcWorld(opts: { rpcError?: { message: string }; granted?: string[] } = {}) {
        return (op: Op): Outcome => {
            if (op.table === "role_definitions") return { data: { role_key: "ops" } };
            if (op.kind === "rpc") {
                if (opts.rpcError) return { error: opts.rpcError };
                return {
                    data: (opts.granted ?? ["a.read", "b.write"]).map((granted_permission_key) => ({
                        granted_permission_key,
                    })),
                };
            }
            return { data: null };
        };
    }

    it("delegates the whole transition to one RPC call, with the caller's org", async () => {
        const { client, ops } = recordingClient(rpcWorld());
        mockClient.value = client;

        const res = await PUT(putRequest("ops", ["a.read", "b.write"]));
        expect(res.status).toBe(200);

        const rpcs = ops.filter((o) => o.kind === "rpc");
        expect(rpcs).toHaveLength(1);
        expect(rpcs[0].table).toBe("rpc:replace_role_permission_grants");
        expect(rpcs[0].rows?.[0]).toEqual({
            p_org_id: orgId,
            p_role_key: "ops",
            p_permission_keys: ["a.read", "b.write"],
        });
    });

    it("issues NO destructive or additive statement of its own — that is the atomicity claim", async () => {
        // The observable form of "one operation owns the transition". If the route still deleted or
        // upserted directly, the write would span statements again and the function's lock would
        // protect nothing, because the route would not be inside it.
        const { client, ops } = recordingClient(rpcWorld());
        mockClient.value = client;

        await PUT(putRequest("ops", ["a.read"]));

        expect(destructiveOps(ops), "the route must not delete grants itself").toEqual([]);
        expect(additiveOps(ops), "the route must not write grants itself").toEqual([]);
    });

    it("clearing every grant is still expressible, and still goes through the one operation", async () => {
        const { client, ops } = recordingClient(rpcWorld({ granted: [] }));
        mockClient.value = client;

        const res = await PUT(putRequest("ops", []));
        expect(res.status).toBe(200);

        const rpcs = ops.filter((o) => o.kind === "rpc");
        expect(rpcs[0].rows?.[0]).toMatchObject({ p_permission_keys: [] });
        expect(destructiveOps(ops)).toEqual([]);
    });

    it("echoes the set the database committed, not the set the client asked for", async () => {
        const { client } = recordingClient(rpcWorld({ granted: ["a.read"] }));
        mockClient.value = client;

        const res = await PUT(putRequest("ops", ["a.read", "b.write"]));
        const json = (await res.json()) as { ok: boolean; permission_keys: string[] };

        expect(json.ok).toBe(true);
        // The function returns what it actually committed. Rendering the request back would show an
        // operator a grid the database never agreed to.
        expect(json.permission_keys).toEqual(["a.read"]);
    });

    it("maps the function's key rejection back to the same stated 400", async () => {
        const { client } = recordingClient(
            rpcWorld({ rpcError: { message: 'invalid_permission_keys:b.read,c.write' } }),
        );
        mockClient.value = client;

        const res = await PUT(putRequest("ops", ["b.read", "c.write"]));
        const json = (await res.json()) as { error: string };

        expect(res.status).toBe(400);
        expect(json.error).toContain("b.read");
        expect(json.error).toContain("c.write");
        // Moving the check inside the transaction must not start leaking SQL at the operator.
        expect(json.error).not.toMatch(/constraint|ERRCODE|plpgsql|function/i);
    });

    it("maps the function's unknown-role rejection back to a stated 400", async () => {
        const { client } = recordingClient(rpcWorld({ rpcError: { message: "unknown_role_key:ghost" } }));
        mockClient.value = client;

        const res = await PUT(putRequest("ops", ["a.read"]));
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toContain("ops");
    });

    it("any other failure is a failure — never a partial success", async () => {
        // S-11's direction, on the write path: a replacement that did not happen must not return 200.
        const { client } = recordingClient(rpcWorld({ rpcError: { message: "deadlock detected" } }));
        mockClient.value = client;

        const res = await PUT(putRequest("ops", ["a.read"]));
        const json = (await res.json()) as { error: string; ok?: boolean };

        expect(res.status).toBe(500);
        expect(json.ok).toBeUndefined();
        expect(json.error).toMatch(/not changed/i);
        // The raw driver message must not reach the operator.
        expect(json.error).not.toContain("deadlock");
    });
});

/**
 * The invariants that MOVED into the database. Asserted over the migration's SQL, because that is
 * where they now live — a route-level test cannot see a row lock.
 */
describe("W-28 / S-12 — the function's own guarantees", () => {
    const fnMigration = () => {
        const file = MIGRATION_FILES.find((f) => f.includes("w28_replace_role_permission_grants_rpc"));
        expect(file, "the W-28 RPC migration is missing").toBeTruthy();
        return executableSql(readFileSync(join(MIGRATIONS_DIR, file!), "utf8"));
    };

    it("takes the role lock BEFORE it reads anything", () => {
        const sql = fnMigration();
        const lockAt = sql.search(/FOR\s+UPDATE/i);
        const validateAt = sql.search(/permission_definitions/i);
        const deleteAt = sql.search(/DELETE\s+FROM\s+public\.role_permission_grants/i);
        expect(lockAt, "no row lock — concurrent replacements would interleave").toBeGreaterThan(-1);
        expect(lockAt).toBeLessThan(validateAt);
        expect(lockAt).toBeLessThan(deleteAt);
    });

    it("validates the keys inside the same transaction that writes", () => {
        const sql = fnMigration();
        expect(sql).toMatch(/is_active/);
        expect(sql).toMatch(/invalid_permission_keys/);
        // Validation must precede the write, or it is decoration.
        expect(sql.search(/invalid_permission_keys/)).toBeLessThan(
            sql.search(/DELETE\s+FROM\s+public\.role_permission_grants/i),
        );
    });

    it("deletes only what is no longer desired — never the whole role", () => {
        const sql = fnMigration();
        // The delete must be qualified by the desired set. An unqualified delete of the role's
        // grants is the original T-23 wipe, and inside a transaction it would still be a wipe if
        // the insert then failed to restore.
        expect(sql).toMatch(/NOT\s*\(\s*g\.permission_key\s*=\s*ANY/i);
    });

    it("upserts rather than inserts, so a disallowed row is re-enabled not collided", () => {
        expect(fnMigration()).toMatch(/ON\s+CONFLICT[\s\S]{0,80}DO\s+UPDATE\s+SET\s+allowed\s*=\s*true/i);
    });

    it("is service_role only — authorization did not move into the database", () => {
        const sql = fnMigration();
        expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION[\s\S]{0,120}FROM\s+authenticated/i);
        expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]{0,120}TO\s+service_role/i);
    });
});

/**
 * W-61 tier A — the fabrication is gone from the source, not merely unused by one route.
 * A behavioural test of `GET /rbac/roles` cannot notice the constant being re-imported by a
 * second reader next month; this can.
 */
const webRoot = join(__dirname, "..", "..");
const PRODUCT_TREES = ["app", "lib"];

function sourceFilesUnder(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const child = join(abs, entry.name);
            if (entry.isDirectory()) walk(child);
            else if (/\.tsx?$/.test(entry.name)) out.push(child);
        }
    };
    walk(join(webRoot, dir));
    return out;
}

/**
 * Scans below read CODE, not prose. Both files W-61 touched explain in a doc comment what
 * was removed and why — naming the retired symbols to do it — and a blunt scan convicts
 * exactly those two files for documenting their own fix. Stripping comments first is what
 * makes the lock mean "nothing USES this" rather than "nobody may mention it".
 */
function code(abs: string): string {
    return readFileSync(abs, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("W-61 tier A — one role vocabulary in the source", () => {
    const files = PRODUCT_TREES.flatMap(sourceFilesUnder);

    it("the scan reaches the product surface", () => {
        expect(files.length).toBeGreaterThan(500);
        expect(files.some((f) => f.endsWith(join("rbac", "roles", "route.ts")))).toBe(true);
    });

    it("stripping comments does not neuter the scan", () => {
        // The control for `code()`. If it over-stripped, every scan below would pass vacuously.
        const sample = "/* mergeRoleDefinitionsWithDefaults */\nconst x = DEFAULT_ORG_ROLE_DEFINITIONS;\n// merge\n";
        const stripped = sample
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

        expect(stripped).not.toContain("mergeRoleDefinitionsWithDefaults");
        expect(stripped).toContain("DEFAULT_ORG_ROLE_DEFINITIONS");
        // A URL must survive — `//` inside `https://` is not a comment.
        expect("const u = 'https://x.test/a';".replace(/(^|[^:])\/\/[^\n]*/g, "$1")).toContain("x.test");
    });

    it("no product source references the retired default-role constant or merge", () => {
        const offenders = files
            .filter((abs) => /DEFAULT_ORG_ROLE_DEFINITIONS|mergeRoleDefinitionsWithDefaults/.test(code(abs)))
            .map((abs) => relative(webRoot, abs));

        expect(
            offenders,
            "role definitions are seeded by the database, never fabricated at read time",
        ).toEqual([]);
    });

    it("the fifth role vocabulary is not re-declared under another name", () => {
        // The tell is the four keys together in one non-test literal.
        const offenders = files
            .filter((abs) => {
                const src = code(abs);
                return (
                    src.includes("regional_lead") &&
                    src.includes("school_director") &&
                    /is_system\s*:\s*true/.test(src)
                );
            })
            .map((abs) => relative(webRoot, abs));

        expect(offenders).toEqual([]);
    });
});

/**
 * `M21` preflight, repository half (§56.2). The migration collapses the duplicate
 * `(org_id, role_key)` FKs to one and changes `ON DELETE CASCADE` to `RESTRICT`. The clause
 * that can fail SILENTLY is the repository one: after the change, any path that deletes a
 * `role_definitions` row holding grants turns from a silent success into an error.
 *
 * This is a repository search, not a database read — which is why it runs here while the
 * migration itself is still blocked on a channel (OD-1). It records that the preflight is
 * GREEN, and it fails on the commit that adds the first such path.
 */
describe("M21 preflight — nothing relies on the role_key cascade", () => {
    it("no product source deletes a role_definitions row", () => {
        const DELETES_ROLE_DEFINITIONS =
            /from\(\s*["'`]role_definitions["'`]\s*\)\s*(?:\.\s*\w+\([^)]*\)\s*)*?\.\s*delete\b/;

        const offenders = PRODUCT_TREES.flatMap(sourceFilesUnder)
            .filter((abs) => DELETES_ROLE_DEFINITIONS.test(code(abs)))
            .map((abs) => relative(webRoot, abs));

        expect(
            offenders,
            "M21 turns this into a constraint error — deactivate the role instead of deleting it",
        ).toEqual([]);
    });

    it("the delete-detecting regex is not vacuous", () => {
        // A scan that matches nothing passes this suite for the wrong reason. Prove the
        // pattern against the shape it is meant to catch, and against the neighbouring
        // table where the same shape is legitimate.
        const DELETES_ROLE_DEFINITIONS =
            /from\(\s*["'`]role_definitions["'`]\s*\)\s*(?:\.\s*\w+\([^)]*\)\s*)*?\.\s*delete\b/;

        expect(DELETES_ROLE_DEFINITIONS.test(`supabase.from("role_definitions").eq("org_id", o).delete()`)).toBe(true);
        expect(DELETES_ROLE_DEFINITIONS.test(`supabase.from("role_permission_grants").delete()`)).toBe(false);
    });
});

/**
 * `M21` itself — W-61 item 3. Locks the SCHEMA OUTCOME, not the presence of a file.
 *
 * The defect is two foreign keys over `(org_id, role_key)` to the same target, both
 * `ON DELETE CASCADE` (`20260329165048_remote_schema.sql:6513,6518`), so deleting a role silently
 * deletes every grant it held. Phase 0 fixed exactly this shape on the neighbouring
 * `permission_key` column and left it here.
 *
 * Asserting "the migration file exists" would be satisfied by an empty file, and asserting its text
 * would be satisfied by a later migration undoing it. So this REPLAYS every constraint statement
 * over `role_permission_grants` in version order and asserts the resulting state — which is the
 * only form that survives a future migration re-introducing the cascade.
 */
const MIGRATIONS_DIR = join(webRoot, "..", "supabase", "migrations");

/** Strip line and block comments so a doc comment cannot satisfy or defeat the scan. */
function executableSql(raw: string): string {
    return raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Final `(org_id, role_key) -> role_definitions` constraints after replaying every migration. */
function roleKeyForeignKeysAfterReplay(files: string[]): Map<string, string> {
    const state = new Map<string, string>();
    for (const file of files) {
        const sql = executableSql(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
        for (const stmt of sql.split(";")) {
            if (!/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?public"?\.)?"?role_permission_grants"?/i.test(stmt)) continue;

            const dropped = stmt.match(/DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/i);
            if (dropped) state.delete(dropped[1]);

            const added = stmt.match(/ADD\s+CONSTRAINT\s+"?([A-Za-z0-9_]+)"?[\s\S]*?FOREIGN\s+KEY\s*\(([^)]*)\)[\s\S]*?REFERENCES\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?/i);
            if (!added) continue;
            const cols = added[2].replace(/["\s]/g, "");
            if (added[3] !== "role_definitions" || cols !== "org_id,role_key") continue;
            const onDelete = /ON\s+DELETE\s+RESTRICT/i.test(stmt)
                ? "RESTRICT"
                : /ON\s+DELETE\s+CASCADE/i.test(stmt)
                  ? "CASCADE"
                  : "NO ACTION";
            state.set(added[1], onDelete);
        }
    }
    return state;
}

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

describe("M21 — one role_key foreign key, and it refuses rather than cascades", () => {
    it("leaves exactly ONE (org_id, role_key) foreign key, ON DELETE RESTRICT", () => {
        const final = roleKeyForeignKeysAfterReplay(MIGRATION_FILES);
        expect([...final.entries()]).toEqual([["role_permission_grants_role_definitions_fkey", "RESTRICT"]]);
    });

    it("no ON DELETE CASCADE survives on that column pair", () => {
        // Stated separately from the count: a future migration could add a SECOND restrict-less
        // constraint and the entries check would name it, but this is the property that matters.
        const final = roleKeyForeignKeysAfterReplay(MIGRATION_FILES);
        expect([...final.values()].filter((v) => v !== "RESTRICT")).toEqual([]);
    });

    it("the replay actually sees the baseline's two cascading keys — non-vacuity", () => {
        // If the parser silently matched nothing, both assertions above would pass for the wrong
        // reason. Replay ONLY the baseline and the pre-M21 tree, and prove the defect is visible.
        const beforeM21 = MIGRATION_FILES.filter((f) => !f.includes("w61_role_key_fk_restrict"));
        const before = roleKeyForeignKeysAfterReplay(beforeM21);
        expect([...before.keys()].sort()).toEqual([
            "role_permission_grants_role_definitions_fkey",
            "role_permission_grants_role_fk",
        ]);
        expect([...before.values()]).toEqual(["CASCADE", "CASCADE"]);
    });

    it("convicts a later migration that re-introduces the cascade", () => {
        // The lock has to survive the change it exists to prevent, not merely describe today.
        const replayed = roleKeyForeignKeysAfterReplay(MIGRATION_FILES);
        expect(replayed.get("role_permission_grants_role_definitions_fkey")).toBe("RESTRICT");

        const regressed = new Map(replayed);
        // Simulate the statement a careless migration would carry.
        const stmt = `ALTER TABLE public.role_permission_grants
            DROP CONSTRAINT IF EXISTS role_permission_grants_role_definitions_fkey;
            ALTER TABLE public.role_permission_grants
            ADD CONSTRAINT role_permission_grants_role_definitions_fkey
            FOREIGN KEY (org_id, role_key) REFERENCES public.role_definitions (org_id, role_key)
            ON DELETE CASCADE;`;
        for (const s of executableSql(stmt).split(";")) {
            if (!/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?role_permission_grants/i.test(s)) continue;
            const d = s.match(/DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_]+)/i);
            if (d) regressed.delete(d[1]);
            const a = s.match(/ADD\s+CONSTRAINT\s+([A-Za-z0-9_]+)/i);
            if (a && /ON\s+DELETE\s+CASCADE/i.test(s)) regressed.set(a[1], "CASCADE");
        }
        expect([...regressed.values()].filter((v) => v !== "RESTRICT")).not.toEqual([]);
    });

    it("the migration is replay-safe — every constraint change is guarded", () => {
        // Phase 0 was not idempotent and its re-run failed on an unguarded constraint ADD; the
        // reconciliation handoff records that as the reason the staging ledger had to be repaired.
        const file = MIGRATION_FILES.find((f) => f.includes("w61_role_key_fk_restrict"));
        expect(file, "M21 migration is missing").toBeTruthy();
        const sql = executableSql(readFileSync(join(MIGRATIONS_DIR, file!), "utf8"));
        const addNames = [...sql.matchAll(/ADD\s+CONSTRAINT\s+([A-Za-z0-9_]+)/gi)].map((m) => m[1]);
        for (const name of addNames) {
            expect(
                new RegExp(`DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${name}\\b`, "i").test(sql),
                `${name} is added without a guarded drop, so a replay fails`,
            ).toBe(true);
        }
    });

    it("no two migrations share a version — the collision that silently skips one", () => {
        // THE assertion that earned its keep. `supabase db push` keys the ledger on VERSION, so two
        // files at one version means applying either marks the version done and the other is
        // SILENTLY SKIPPED — never applied, never reported.
        //
        // It happened. The Communications lane merged `20260818200000_ingress_observation_sender_-
        // authentication` after this branch's last pre-merge check, and PR #475 then merged
        // `20260818200000_w28_replace_role_permission_grants_rpc`. Staging briefly held both. Had the
        // batch been applied, W-28's RPC would have been skipped — and `W-58` composes it, so the
        // role page's one-transaction save would have failed at runtime against a function that was
        // never created. W-28 and W-58 were renumbered above staging's head to clear it, together,
        // because W-58 aborts if W-28's function is absent.
        const versions = MIGRATION_FILES.map((f) => f.split("_")[0]);
        const duplicates = [...new Set(versions.filter((v, i) => versions.indexOf(v) !== i))];
        expect(
            duplicates,
            "two migrations at one version — db push applies one and skips the other with no error",
        ).toEqual([]);
    });

    it("anything this lane has NOT yet merged sorts above the staging head", () => {
        // The ordering half, re-pointed. It used to read "every authored-unapplied A&I migration
        // sorts above everything already on staging", which was right while the whole tranche was
        // unpushed. PR #475 merged it, so most of these versions are now ON staging and legitimately
        // sort below migrations that landed after them — the old form convicted the branch for
        // having been promoted.
        //
        // What still matters is the same rule applied to what is still in flight: a version at or
        // below the remote head is refused by `db push`, and an exact collision is silently skipped.
        const onStaging = new Set(
            execSync("git ls-tree -r origin/staging --name-only -- supabase/migrations", {
                cwd: join(MIGRATIONS_DIR, "..", ".."),
                encoding: "utf8",
            })
                .split("\n")
                .filter(Boolean)
                .map((p) => p.split("/").pop()),
        );
        const stagingMax = [...onStaging].map((f) => f.split("_")[0]).sort().at(-1);
        expect(stagingMax, "could not read the staging migration head").toBeTruthy();

        const unmerged = MIGRATION_FILES.filter((f) => !onStaging.has(f));
        for (const f of unmerged) {
            expect(
                f.split("_")[0] > stagingMax,
                `${f} is not on staging and sorts at or below ${stagingMax}, which db push refuses`,
            ).toBe(true);
        }
    });
});

/**
 * `M9` / `W-16` — membership names a DEFINED role.
 *
 * `C2`, and the absence half of `M2-2`'s "redundancy beside an absence": `role_permission_grants`
 * carried two identical foreign keys onto `role_definitions` while `user_roles.role` carried none.
 * `M21` closed the redundancy; this closes the absence. Governance already claimed this constraint
 * existed, which is why the gap survived — the claim was the reason nobody looked.
 *
 * Same replay discipline as `M21`: the final constraint state is computed by replaying every
 * migration in version order, so a later migration that drops or weakens it is convicted.
 */
function userRolesRoleForeignKeysAfterReplay(files: string[]): Map<string, string> {
    const state = new Map<string, string>();
    for (const file of files) {
        const sql = executableSql(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
        for (const stmt of sql.split(";")) {
            if (!/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?public"?\.)?"?user_roles"?/i.test(stmt)) continue;

            const dropped = stmt.match(/DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/i);
            if (dropped) state.delete(dropped[1]);

            const added = stmt.match(
                /ADD\s+CONSTRAINT\s+"?([A-Za-z0-9_]+)"?[\s\S]*?FOREIGN\s+KEY\s*\(([^)]*)\)[\s\S]*?REFERENCES\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?/i,
            );
            if (!added) continue;
            const cols = added[2].replace(/["\s]/g, "");
            if (added[3] !== "role_definitions" || cols !== "org_id,role") continue;
            state.set(added[1], /ON\s+DELETE\s+RESTRICT/i.test(stmt) ? "RESTRICT" : "OTHER");
        }
    }
    return state;
}

describe("M9 / W-16 — user_roles.role references a defined role", () => {
    it("ends with exactly one (org_id, role) foreign key, ON DELETE RESTRICT", () => {
        const final = userRolesRoleForeignKeysAfterReplay(MIGRATION_FILES);
        expect([...final.entries()]).toEqual([["user_roles_role_definitions_fkey", "RESTRICT"]]);
    });

    it("the replay sees the baseline's ABSENCE — non-vacuity", () => {
        // If the parser matched nothing, the assertion above would pass for the wrong reason.
        // Replaying everything except M9 must yield NO such constraint, which is the defect C2 names.
        const beforeM9 = MIGRATION_FILES.filter((f) => !f.includes("w16_user_roles_role_foreign_key"));
        expect([...userRolesRoleForeignKeysAfterReplay(beforeM9).keys()]).toEqual([]);
    });

    it("preflights on Q3's form — matching on is_active would abort on rows a FK accepts", () => {
        const file = MIGRATION_FILES.find((f) => f.includes("w16_user_roles_role_foreign_key"))!;
        const sql = executableSql(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
        expect(sql).toMatch(/RAISE\s+EXCEPTION/i);
        expect(sql).toMatch(/role_definitions/);
        // The plan's first caution, asserted rather than trusted to the comment above it — and
        // scoped to the PREFLIGHT BLOCK, not the file. A whole-file scan convicted this migration
        // for the `COMMENT ON CONSTRAINT` text that tells an operator to retire a role with
        // `is_active = false`, which is advice, not a predicate. Same class as the deployment guard
        // that matched its own explanatory comment: the reader must read the code it means.
        const preflight = sql.match(/DO\s+\$preflight\$([\s\S]*?)\$preflight\$/i)?.[1] ?? "";
        expect(preflight.length, "no preflight block found").toBeGreaterThan(0);
        expect(preflight, "the preflight predicate must not read is_active — a foreign key does not")
            .not.toMatch(/is_active/i);
    });

    it("is replay-safe — the constraint ADD is guarded", () => {
        const file = MIGRATION_FILES.find((f) => f.includes("w16_user_roles_role_foreign_key"))!;
        const sql = executableSql(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
        for (const name of [...sql.matchAll(/ADD\s+CONSTRAINT\s+([A-Za-z0-9_]+)/gi)].map((m) => m[1])) {
            expect(
                new RegExp(`DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${name}\\b`, "i").test(sql),
                `${name} is added without a guarded drop`,
            ).toBe(true);
        }
    });
});

/**
 * W-58 / `RM-11` — one submit for the role page.
 *
 * `01…§40`: role meta and grants were two independent save paths with no dirty-state tracking, so
 * *"an operator who edits the label and the grid and presses one button silently discards the other
 * edit"*. `01…§52` is why it could not be built earlier — composing a PATCH with the untransacted
 * delete-then-insert would have given one operator action three failure points and no compensation.
 * `W-28` supplied the atomicity; this asserts the composition.
 */
describe("W-58 / RM-11 — one submit, one transaction", () => {
    const surface = () =>
        readFileSync(join(webRoot, "components/adminV2/settings/access/AccessRolesConfigurationPage.tsx"), "utf8");

    it("the role page has ONE submit, and every save control calls it", () => {
        const src = surface();
        // The two independent savers are gone by name, not merely unused.
        expect(src).not.toMatch(/const\s+saveRoleMeta\s*=/);
        expect(src).not.toMatch(/const\s+saveGrants\s*=/);
        expect(src).toMatch(/const\s+saveRole\s*=/);

        // This used to require exactly TWO `void saveRole()` call sites, because W-58 landed on a
        // tabbed page where the role card and the permissions grid each had a button and the fix
        // was to point both at one submit. W-57 removed the tab bar and the page now has one save
        // control, so the count went to one — and the old assertion read that as a regression when
        // it is the same property arrived at more directly.
        //
        // The invariant W-58 owns is not "two buttons": it is that **no save control submits
        // anything other than the one composed submit**. Counting call sites was a proxy for that;
        // this asserts it. Fewer buttons is allowed, a second saver is not.
        const submitCalls = src.match(/void\s+save\w*\(\)/g) ?? [];
        expect(submitCalls.length).toBeGreaterThanOrEqual(1);
        for (const call of submitCalls) expect(call).toMatch(/void\s+saveRole\(\)/);
    });

    it("the submit carries meta AND grants in one request", () => {
        const src = surface();
        const body = src.slice(src.indexOf("const saveRole"), src.indexOf("const setGridLevel"));
        // One fetch, one method, one body carrying all three fields.
        expect((body.match(/fetch\(/g) ?? []).length).toBe(1);
        expect(body).toMatch(/method:\s*"PATCH"/);
        expect(body).toMatch(/role_label/);
        expect(body).toMatch(/is_active/);
        expect(body).toMatch(/permission_keys/);
        // The old grants endpoint is no longer a second write from this surface.
        expect(body).not.toMatch(/rbac\/grants/);
    });

    it("the transaction is the database's, not the route's — meta then grants, one function", () => {
        const file = MIGRATION_FILES.find((f) => f.includes("w58_save_role_definition_and_grants"));
        expect(file, "the W-58 migration is missing").toBeTruthy();
        const sql = executableSql(readFileSync(join(MIGRATIONS_DIR, file!), "utf8"));
        // Meta is written FIRST, so a failure in the grants half rolls it back.
        const metaAt = sql.search(/UPDATE\s+public\.role_definitions/i);
        const grantsAt = sql.search(/replace_role_permission_grants\s*\(\s*p_org_id/i);
        expect(metaAt).toBeGreaterThan(-1);
        expect(grantsAt).toBeGreaterThan(metaAt);
        // It COMPOSES W-28 rather than reimplementing it — two copies of a replacement algorithm is
        // how M2-11's two answers came to disagree.
        expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.role_permission_grants/i);
        expect(sql).toMatch(/GRANT\s+EXECUTE[\s\S]{0,140}TO\s+service_role/i);
    });

    it("the combined path cannot deactivate a system role — the guard fronts it", () => {
        // A hole this workstream could easily have opened: one convenient request that skips a check
        // the narrower request enforces.
        const route = readFileSync(join(webRoot, "app/api/admin/rbac/roles/[role_key]/route.ts"), "utf8");
        const guardAt = route.search(/System roles cannot be deactivated/);
        const combinedAt = route.search(/save_role_definition_and_grants/);
        expect(guardAt).toBeGreaterThan(-1);
        expect(combinedAt).toBeGreaterThan(-1);
        expect(guardAt, "the system-role guard must precede the combined branch").toBeLessThan(combinedAt);
    });
});
