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
 * **Scope of the W-28 claim, stated so it is not read as more than it is.** PostgREST cannot span
 * a transaction, so the replacement is a fail-closed DELTA, not an atomic write. It bounds the
 * blast radius — no total wipe, and a mid-flight failure can only under-grant. True atomicity
 * needs the replacement to become one RPC, which needs a migration channel (OD-1). The tests
 * below assert the delta and its ordering; none of them asserts atomicity.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readdirSync, readFileSync } from "node:fs";
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
    kind: "select" | "delete" | "insert" | "upsert";
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
        expect(additiveOps(ops)).toHaveLength(1);
    });
});

describe("W-28 / T-23 — the replacement cannot wipe a role", () => {
    it("deletes only the grants actually being removed", async () => {
        const { client, ops } = recordingClient(
            defaultResolve({ currentGrants: ["a.read", "a.write", "b.read"] }),
        );
        mockClient.value = client;

        // Keep a.read, drop a.write and b.read, add b.write.
        await PUT(putRequest("ops", ["a.read", "b.write"]));
        const del = destructiveOps(ops);

        expect(del).toHaveLength(1);
        expect(del[0].inList?.sort()).toEqual(["a.write", "b.read"]);
    });

    it("never issues an unscoped delete of every grant for the role", async () => {
        // This is the exact statement that produced the zero-grant role.
        const { client, ops } = recordingClient(defaultResolve({ currentGrants: ["a.read", "a.write"] }));
        mockClient.value = client;

        await PUT(putRequest("ops", ["b.read"]));

        for (const del of destructiveOps(ops)) {
            expect(del.inList, "a delete with no permission_key list removes the whole role").toBeDefined();
            expect(del.inList!.length).toBeGreaterThan(0);
        }
    });

    it("removals run before additions, so a mid-flight failure can only under-grant", async () => {
        const { client, ops } = recordingClient(defaultResolve({ currentGrants: ["a.read", "a.write"] }));
        mockClient.value = client;

        await PUT(putRequest("ops", ["b.read"]));
        const kinds = grantOps(ops)
            .filter((o) => o.kind !== "select")
            .map((o) => o.kind);

        expect(kinds).toEqual(["delete", "upsert"]);
    });

    it("a failed addition leaves the retained grants in place", async () => {
        const { client, ops } = recordingClient(
            defaultResolve({ currentGrants: ["a.read", "a.write"], writeError: { message: "insert failed" } }),
        );
        mockClient.value = client;

        const res = await PUT(putRequest("ops", ["a.read", "b.write"]));

        expect(res.status).toBe(500);
        // a.read was never in a delete list, so it survives the failure. Before W-28 the
        // unscoped delete had already removed it and the role held nothing.
        //
        // Every delete must be checked for BEING scoped, not just for its list's contents:
        // an unscoped delete has no list at all, so a `flatMap(o => o.inList ?? [])` assertion
        // passes against the very statement this test exists to forbid.
        for (const del of destructiveOps(ops)) {
            expect(del.inList, "an unscoped delete removed every grant the role held").toBeDefined();
            expect(del.inList).not.toContain("a.read");
        }
    });

    it("writes nothing at all when the current grant set cannot be read", async () => {
        // An unreadable current set must not be treated as an empty one — `toRemove` would be
        // empty and the revocation half of the operator's edit would silently not happen.
        const { client, ops } = recordingClient(
            defaultResolve({ currentError: { message: "unavailable" } }),
        );
        mockClient.value = client;

        const res = await PUT(putRequest("ops", ["a.read"]));

        expect(res.status).toBe(500);
        expect(destructiveOps(ops)).toEqual([]);
        expect(additiveOps(ops)).toEqual([]);
    });

    it("issues no delete when the edit only adds", async () => {
        const { client, ops } = recordingClient(defaultResolve({ currentGrants: ["a.read"] }));
        mockClient.value = client;

        await PUT(putRequest("ops", ["a.read", "a.write"]));

        expect(destructiveOps(ops)).toEqual([]);
    });

    it("clearing every grant is still expressible", async () => {
        // The delta must not accidentally make "revoke everything" unreachable.
        const { client, ops } = recordingClient(defaultResolve({ currentGrants: ["a.read", "a.write"] }));
        mockClient.value = client;

        const res = await PUT(putRequest("ops", []));

        expect(res.status).toBe(200);
        expect(destructiveOps(ops)[0].inList?.sort()).toEqual(["a.read", "a.write"]);
        expect(additiveOps(ops)).toEqual([]);
    });

    it("upserts rather than inserts, so a disallowed row is re-enabled not collided", async () => {
        const { client, ops } = recordingClient(defaultResolve({ currentGrants: ["a.read"] }));
        mockClient.value = client;

        await PUT(putRequest("ops", ["a.read", "a.write"]));
        const add = additiveOps(ops);

        expect(add[0].kind).toBe("upsert");
        expect(add[0].rows).toEqual(
            expect.arrayContaining([expect.objectContaining({ permission_key: "a.read", allowed: true })]),
        );
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

    it("sorts above the staging head it has to apply after", () => {
        // A version at or below the remote head is refused by `supabase db push`, and an exact
        // collision is silently skipped — this program has already paid for both.
        const file = MIGRATION_FILES.find((f) => f.includes("w61_role_key_fk_restrict"))!;
        const version = file.split("_")[0];
        const versions = MIGRATION_FILES.map((f) => f.split("_")[0]);
        expect(versions.filter((v) => v === version)).toHaveLength(1);
        expect(version).toBe([...versions].sort().at(-1));
    });
});
