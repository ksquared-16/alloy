/**
 * Access V3 S5 — the real override store adapter and its migration, offline.
 *
 * The adapter runs against an injected fake client (no database), and the migration is read as text.
 * Neither proves the SQL executes or that RLS denies at runtime — that is the live suite's job once the
 * migration is applied. What this file locks: the adapter addresses only the principal it is handed,
 * records that principal as the actor, writes only through the audited functions, and reports a
 * missing table/function as "not provisioned" (not as a failed read); and the migration keeps the
 * approved shape (service-role only, audited set/clear, no-op writes no audit, its own domain, retained
 * on loss of access, never a grant).
 */

import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
    CLEAR_WORKSPACE_VISIBILITY_OVERRIDE_RPC,
    SET_WORKSPACE_VISIBILITY_OVERRIDE_RPC,
    WORKSPACE_VISIBILITY_OVERRIDE_TABLE,
    WorkspaceVisibilityOverrideStoreNotProvisioned,
    createSupabaseWorkspaceVisibilityOverrideStore,
    getWorkspaceVisibilityOverrideStore,
} from "@/lib/access/workspaceVisibilityOverrideStore";

const ME = { userId: "user-1", orgId: "org-1" };

type DbError = { code: string; message: string } | null;

function fakeClient(opts: { row?: unknown; readError?: DbError; rpcError?: DbError } = {}) {
    const calls: Array<{ op: string; table?: string; fn?: string; args?: unknown; filters?: Array<[string, unknown]>; columns?: string }> = [];
    const client = {
        from(table: string) {
            const call = { op: "from", table, filters: [] as Array<[string, unknown]>, columns: "" };
            calls.push(call);
            const q = {
                select(columns: string) {
                    call.columns = columns;
                    return q;
                },
                eq(column: string, value: unknown) {
                    call.filters.push([column, value]);
                    return q;
                },
                async maybeSingle() {
                    return { data: opts.readError ? null : (opts.row ?? null), error: opts.readError ?? null };
                },
            };
            return q;
        },
        async rpc(fn: string, args: unknown) {
            calls.push({ op: "rpc", fn, args });
            return { data: opts.rpcError ? null : [{ changed: true }], error: opts.rpcError ?? null };
        },
    };
    // The adapter only calls from/select/eq/maybeSingle and rpc; the fake implements exactly those.
    return { calls, client: () => client as never };
}

describe("S5 store adapter — principal-addressed, audited writes only", () => {
    it("reads only this principal's row from the override table", async () => {
        const f = fakeClient({ row: { hidden_surface_keys: ["inbox", "operations"] } });
        const store = createSupabaseWorkspaceVisibilityOverrideStore(f.client);
        expect(await store.read(ME)).toEqual({ hiddenSurfaceKeys: ["inbox", "operations"] });
        expect(f.calls).toEqual([
            {
                op: "from",
                table: WORKSPACE_VISIBILITY_OVERRIDE_TABLE,
                columns: "hidden_surface_keys",
                filters: [
                    ["org_id", "org-1"],
                    ["user_id", "user-1"],
                ],
            },
        ]);
    });

    it("no row, or an unusable stored value, is no override", async () => {
        expect(await createSupabaseWorkspaceVisibilityOverrideStore(fakeClient().client).read(ME)).toBeNull();
        expect(
            await createSupabaseWorkspaceVisibilityOverrideStore(fakeClient({ row: { hidden_surface_keys: "inbox" } }).client).read(ME),
        ).toBeNull();
    });

    it("write calls the audited set function for this principal, as its own actor", async () => {
        const f = fakeClient();
        await createSupabaseWorkspaceVisibilityOverrideStore(f.client).write(ME, ["inbox"]);
        expect(f.calls).toEqual([
            {
                op: "rpc",
                fn: SET_WORKSPACE_VISIBILITY_OVERRIDE_RPC,
                args: { p_org_id: "org-1", p_user_id: "user-1", p_hidden_surface_keys: ["inbox"], p_actor_user_id: "user-1", p_origin: "operator" },
            },
        ]);
    });

    it("clear calls the audited clear function for this principal, as its own actor", async () => {
        const f = fakeClient();
        await createSupabaseWorkspaceVisibilityOverrideStore(f.client).clear(ME);
        expect(f.calls).toEqual([
            {
                op: "rpc",
                fn: CLEAR_WORKSPACE_VISIBILITY_OVERRIDE_RPC,
                args: { p_org_id: "org-1", p_user_id: "user-1", p_actor_user_id: "user-1", p_origin: "operator" },
            },
        ]);
    });

    it("a missing table or function is 'not provisioned', for every operation", async () => {
        for (const code of ["42P01", "42883", "PGRST205", "PGRST202"]) {
            const err = { code, message: "does not exist" };
            const read = createSupabaseWorkspaceVisibilityOverrideStore(fakeClient({ readError: err }).client);
            const write = createSupabaseWorkspaceVisibilityOverrideStore(fakeClient({ rpcError: err }).client);
            await expect(read.read(ME)).rejects.toBeInstanceOf(WorkspaceVisibilityOverrideStoreNotProvisioned);
            await expect(write.write(ME, ["inbox"])).rejects.toBeInstanceOf(WorkspaceVisibilityOverrideStoreNotProvisioned);
            await expect(write.clear(ME)).rejects.toBeInstanceOf(WorkspaceVisibilityOverrideStoreNotProvisioned);
        }
    });

    it("any other database error is a real failure, not 'not provisioned'", async () => {
        for (const err of [
            { code: "42501", message: "permission denied" },
            { code: "23514", message: "check violation" },
            { code: "", message: "network" },
        ]) {
            const s = createSupabaseWorkspaceVisibilityOverrideStore(fakeClient({ readError: err, rpcError: err }).client);
            for (const run of [() => s.read(ME), () => s.write(ME, ["inbox"]), () => s.clear(ME)]) {
                const e = await run().then(() => null, (x: unknown) => x);
                expect(e).toBeInstanceOf(Error);
                expect(e).not.toBeInstanceOf(WorkspaceVisibilityOverrideStoreNotProvisioned);
            }
        }
    });

    it("the route's store is the Supabase-backed one", () => {
        expect(getWorkspaceVisibilityOverrideStore().kind).toBe("available");
    });

    it("source: no fallback store, no direct table write, no permission vocabulary", () => {
        const src = readFileSync(path.resolve(__dirname, "../../lib/access/workspaceVisibilityOverrideStore.ts"), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*$/gm, "");
        for (const forbidden of ["localStorage", "fetch(", ".insert(", ".upsert(", ".update(", ".delete(", "permission", "user_roles", "headers", "cookies"])
            expect(src).not.toContain(forbidden);
        expect(src.match(/\.from\(/g)).toHaveLength(1);
    });
});

describe("S5 migration 20261222110000 — approved shape (text, not execution)", () => {
    const sql = readFileSync(
        path.resolve(__dirname, "../../../supabase/migrations/20261222110000_access_workspace_visibility_overrides.sql"),
        "utf8",
    );
    const code = sql.replace(/--.*$/gm, "");
    const fnBody = (name: string) => {
        const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
        expect(start).toBeGreaterThan(-1);
        const open = code.indexOf("$fn$", start);
        return code.slice(open, code.indexOf("$fn$", open + 4));
    };

    it("one row per (org, user), with no permission column", () => {
        expect(code).toMatch(/CREATE TABLE IF NOT EXISTS public\.workspace_visibility_overrides/);
        expect(code).toMatch(/PRIMARY KEY \(org_id, user_id\)/);
        expect(code).not.toMatch(/permission/i);
    });

    it("service-role only: RLS on, no policy, anon/authenticated revoked, service_role SELECT only", () => {
        expect(code).toMatch(/ALTER TABLE public\.workspace_visibility_overrides ENABLE ROW LEVEL SECURITY/);
        expect(code).not.toMatch(/CREATE POLICY/i);
        expect(code).toMatch(/REVOKE ALL ON TABLE public\.workspace_visibility_overrides FROM PUBLIC, anon, authenticated, service_role;/);
        const grants = code.match(/GRANT [^;]+ ON TABLE public\.workspace_visibility_overrides TO [^;]+;/g);
        expect(grants).toEqual(["GRANT SELECT ON TABLE public.workspace_visibility_overrides TO service_role;"]);
        for (const fn of ["set_workspace_visibility_override", "clear_workspace_visibility_override"]) {
            expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
            // GRANT ALL on a function is exactly EXECUTE (its only privilege); the migration's self-test proves it.
            const fnGrants = code.match(new RegExp(`GRANT (?:ALL|EXECUTE) ON FUNCTION public\\.${fn}\\([^)]*\\) TO [^;]+;`, "g"));
            expect(fnGrants).toHaveLength(1);
            expect(fnGrants![0]).toMatch(/TO service_role;$/);
        }
    });

    it("set and clear each write the row and its audit event in one function, in the workspace_visibility domain", () => {
        for (const [name, key] of [
            ["set_workspace_visibility_override", "workspace_visibility.override_set"],
            ["clear_workspace_visibility_override", "workspace_visibility.override_cleared"],
        ] as const) {
            const body = fnBody(name);
            expect(body).toContain("INSERT INTO public.mutation_events");
            expect(body).toContain(`'${key}', 'workspace_visibility'`);
            expect(body).not.toMatch(/'access'/);
            expect(body).toMatch(/audit_actor_required/);
            // A no-op returns before the audit insert.
            const noop = body.indexOf("RETURN QUERY SELECT false;");
            expect(noop).toBeGreaterThan(-1);
            expect(noop).toBeLessThan(body.indexOf("INSERT INTO public.mutation_events"));
        }
        expect(code.match(/SECURITY DEFINER/g)).toHaveLength(2);
        expect(code.match(/SET search_path = public, pg_temp/g)).toHaveLength(2);
    });

    it("analyzer-clean without hiding anything: no GRANT EXECUTE (dynamic-SQL rule), no ON CONFLICT DO UPDATE; each write names its table", () => {
        expect(code).not.toMatch(/\bGRANT\s+EXECUTE\b/i);
        expect(code).not.toMatch(/\bON\s+CONFLICT\b/i);
        const set = fnBody("set_workspace_visibility_override");
        // Insert-or-update chosen from v_before, read under the per-principal advisory lock that clear also takes.
        const lock = set.indexOf("pg_advisory_xact_lock"), read = set.indexOf("INTO v_before"), branch = set.indexOf("IF v_before IS NULL THEN");
        expect(lock).toBeGreaterThan(-1);
        expect(read).toBeGreaterThan(lock);
        expect(branch).toBeGreaterThan(read);
        expect(set).toMatch(/IF v_before IS NULL THEN\s+INSERT INTO public\.workspace_visibility_overrides[\s\S]*?ELSE\s+UPDATE public\.workspace_visibility_overrides\s+SET[\s\S]*?WHERE org_id = p_org_id AND user_id = p_user_id;\s+END IF;/);
        expect(fnBody("clear_workspace_visibility_override")).toContain("pg_advisory_xact_lock");
        expect(code).toMatch(/hidden_surface_keys text\[\]\s+NOT NULL/);
    });

    it("retained when a member loses access; never feeds access", () => {
        for (const t of ["user_roles", "user_access_profiles", "role_definitions", "user_site_access", "user_department_access"])
            expect(code).not.toContain(t);
        expect(code).not.toMatch(/\bGRANT\b[^;]*\bTO authenticated\b/);
    });
});

describe("S5 certification invariants — kept in step with migration 20261222110000 (text, never executed here)", () => {
    const root = path.resolve(__dirname, "../../..");
    const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8");
    const migration = read("supabase/migrations/20261222110000_access_workspace_visibility_overrides.sql");
    const preapply = read("certification/invariants/access-workspace-visibility-overrides-preapply.sql");
    const postapply = read("certification/invariants/access-workspace-visibility-overrides.sql");
    const cases = (sql: string) => sql.slice(sql.indexOf("-- ── The cases"));

    it("pre-apply embeds the migration byte-for-byte, exactly twice (re-run proof)", () => {
        expect(preapply.split(migration).length - 1).toBe(2);
    });

    it("post-apply does not re-run the migration; both run the identical cases", () => {
        expect(postapply).not.toContain("CREATE TABLE IF NOT EXISTS public.workspace_visibility_overrides");
        expect(cases(preapply).length).toBeGreaterThan(1000);
        expect(cases(postapply)).toBe(cases(preapply));
        for (let n = 1; n <= 10; n++) expect(cases(preapply)).toContain(`-- CASE ${n} —`);
    });

    it("assertions are null-safe: no `<>` and no `IF NOT (…)`, so a NULL cannot silently pass a check", () => {
        const code = cases(preapply).replace(/--.*$/gm, "");
        expect(code).not.toContain("<>");
        expect(code).not.toMatch(/\bIF\s+NOT\s*\(/);
        expect(code).toContain("IS DISTINCT FROM");
    });

    it("retention on loss of access is proven by behaviour through the real removal path, with controls", () => {
        const c10 = cases(preapply).slice(cases(preapply).indexOf("-- CASE 10 —"));
        expect(c10).toContain("public.remove_member_access_audited(o1, u2,");
        expect(c10).toContain("CASE 10 FAILED (control): membership or profile survived removal");
        expect(c10).toContain("CASE 10 FAILED (control): removal wrote no access.user.removed event");
        expect(c10).toContain("CASE 10 FAILED: the preference did not survive loss of access");
    });

    it("pre-apply proves absence first; post-apply reads ledger and objects separately", () => {
        expect(preapply.indexOf("CASE 0 FAILED: the store already exists")).toBeLessThan(preapply.indexOf(migration));
        expect(postapply).toMatch(/schema_migrations WHERE version = '20261222110000'/);
        expect(postapply).toMatch(/to_regclass\('public\.workspace_visibility_overrides'\) IS NULL/);
    });

    it("fixtures use fixed disposable identifiers (refusing to run over residue), never random ones", () => {
        for (const sql of [preapply, postapply]) {
            const c = cases(sql);
            expect(c).not.toContain("gen_random_uuid");
            for (const id of ["a5a50000-5e00-4000-8000-0000000000a1", "a5a50000-5e00-4000-8000-0000000000a2", "a5a50000-5e00-4000-8000-0000000000b1", "a5a50000-5e00-4000-8000-0000000000b2"])
                expect(c).toContain(`'${id}'`);
            expect(c).toContain("SETUP FAILED: disposable wvo identifiers already exist");
        }
    });

    it("the residue invariant is read-only and checks the same identifiers across direct, trigger-seeded and audit tables", () => {
        const residue = read("certification/invariants/access-workspace-visibility-overrides-residue.sql");
        const rcode = residue.replace(/--.*$/gm, "");
        expect(rcode).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COMMIT|ROLLBACK)\b/i);
        for (const id of ["a5a50000-5e00-4000-8000-0000000000a1", "a5a50000-5e00-4000-8000-0000000000a2", "a5a50000-5e00-4000-8000-0000000000b1", "a5a50000-5e00-4000-8000-0000000000b2"])
            expect(rcode).toContain(`'${id}'`);
        for (const t of ["public.orgs", "auth.users", "public.user_roles", "public.user_access_profiles", "public.role_definitions", "public.role_permission_grants", "public.document_types", "public.document_type_versions", "public.mutation_events", "public.workspace_visibility_overrides"])
            expect(rcode).toMatch(new RegExp(`FROM ${t.replace(".", "\\.")}\\s+WHERE`));
        expect(rcode).toContain("total IS DISTINCT FROM 0");
    });

    it("fixtures own no transaction and never COMMIT (the runner wraps and rolls back)", () => {
        for (const sql of [preapply, postapply]) {
            const code = sql.replace(/--.*$/gm, "");
            expect(code).not.toMatch(/^\s*(COMMIT|ROLLBACK|BEGIN\s*;|START TRANSACTION)/im);
        }
    });
});
