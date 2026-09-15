/**
 * W-5 / RL-4 (tier B) — every membership-creating product path goes through the
 * atomic RPC, and the helper maps the RPC's outcomes the way callers expect.
 *
 * The source-level half is deliberate: the defect W-5 closes is not "the RPC is
 * wrong", it is "someone inserts into user_roles directly". A behavioural test
 * of the helper cannot catch a sixth writer being added next month; this can.
 *
 * The discovery below **parses rather than matches**. A regex owned this job for
 * four issuances and three of five realistic call forms escaped it — an
 * intermediate `.eq("user_id", String(id))` closes the character class the
 * pattern used to hop filters with, so the chain went unseen. That was derived by
 * hand on 2026-09-04 and measured on 2026-09-06; the repair is here. Resolving
 * `.from("user_roles")` chains through the TypeScript AST is the same instrument
 * `scripts/checkServiceClientPrincipal.mjs` already uses for W-4, and it does not
 * care how the intermediate arguments nest.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
    createMembershipWithAccessProfile,
    replaceMembershipWithAccessProfile,
} from "@/lib/admin/membershipWithProfile";

const webRoot = join(__dirname, "..", "..");

/**
 * The membership writers found by W-5's audit — enumerated BY TABLE across
 * lib/ and app/, not by name across route files, which is the census that
 * missed createOrgAndAssignAdmin twice.
 *
 * This list documents WHAT WAS FIXED. It is deliberately NOT the subject of the
 * no-direct-write lock below: a fixed list can only ever re-check files that are
 * already correct, so it cannot notice a fourth writer arriving. That is the
 * same subject-pinning escape §5 found twice in RL-1.
 */
const MEMBERSHIP_WRITER_SOURCES = [
    "app/api/admin/users/route.ts",
    "app/api/admin/users/[userId]/role/route.ts",
    "lib/dev/createOrgAndAssignAdmin.ts",
];

/** The membership table. Writes to it outside the atomic RPC re-open G4. */
const MEMBERSHIP_TABLE = "user_roles";

/**
 * PostgREST builder methods that write. `delete` is absent on purpose: removing a
 * membership cannot create a membership without a profile, and
 * `users/[userId]/remove` deletes only.
 */
const MUTATIONS = new Set(["insert", "upsert", "update"]);

/** The whole product surface. Not a directory list — the trees themselves. */
const PRODUCT_TREES = ["app", "lib"];

type WriteSite = {
    /** Path relative to web/ */
    file: string;
    line: number;
    /** The mutation reached from `.from("user_roles")`, or why the chain could not be resolved. */
    reason: string;
};

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

/** `<anything>.from("user_roles")`, as a call node. */
function isFromMembershipTable(node: ts.Node): node is ts.CallExpression {
    if (!ts.isCallExpression(node)) return false;
    if (!ts.isPropertyAccessExpression(node.expression)) return false;
    if (node.expression.name.text !== "from") return false;
    const [arg] = node.arguments;
    return Boolean(arg && ts.isStringLiteralLike(arg) && arg.text === MEMBERSHIP_TABLE);
}

/**
 * `.from(<not a string literal>)` — the table name is behind an indirection, so
 * no static reader can tell whether it is `user_roles`. Only consulted in files
 * that already name the table, which keeps the process-table builders (all of
 * which use a `PROCESS_INSTANCES_TABLE` constant) out of the result.
 */
function isFromOpaqueTable(node: ts.Node): node is ts.CallExpression {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee)) return false;
    if (callee.name.text !== "from") return false;
    // `Array.from(...)` is not a query builder.
    if (ts.isIdentifier(callee.expression) && callee.expression.text === "Array") return false;
    const [arg] = node.arguments;
    return Boolean(arg && !ts.isStringLiteralLike(arg));
}

/**
 * Walk OUTWARD from the `.from(...)` call through the builder chain. Parens,
 * nested calls and template arguments in intermediate filters are irrelevant
 * here — the parent links are the chain, whatever the arguments look like.
 *
 * Returns the mutation reached, `null` if the chain is a read or a delete, or an
 * "unresolved" reason if the builder escapes into a value this reader cannot
 * follow (assignment to a variable, a return, an argument to something else).
 */
function chainOutcome(fromCall: ts.CallExpression): { mutation?: string; unresolved?: string } {
    let current: ts.Node = fromCall;

    for (;;) {
        const access = current.parent;
        if (!access || !ts.isPropertyAccessExpression(access) || access.expression !== current) {
            // Nothing further is chained on. If that is true of `.from()` itself, the
            // builder was handed to a variable, a return or an argument, and no
            // static reader can say what is done with it later — fail closed rather
            // than call it a read. Otherwise the chain ended at a read or a delete.
            return current === fromCall ? { unresolved: "builder is assigned or passed on, not chained" } : {};
        }

        const method = access.name.text;
        if (MUTATIONS.has(method)) return { mutation: method };

        const call = access.parent;
        if (!call || !ts.isCallExpression(call) || call.expression !== access) {
            // `.then`, `.data`, a property read — the chain stops being a builder.
            return {};
        }
        current = call;
    }
}

/**
 * Every direct write to the membership table under the given trees, discovered
 * rather than re-checked against a list.
 */
function directMembershipWriteSites(trees: string[] = PRODUCT_TREES): WriteSite[] {
    const sites: WriteSite[] = [];
    for (const abs of trees.flatMap(sourceFilesUnder)) {
        const text = readFileSync(abs, "utf8");
        if (!text.includes(MEMBERSHIP_TABLE)) continue;
        sites.push(...writeSitesInSource(relative(webRoot, abs), text));
    }
    return sites;
}

/** The analyzer over one file's text. Exposed so fixtures can exercise it directly. */
function writeSitesInSource(file: string, text: string): WriteSite[] {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const sites: WriteSite[] = [];

    const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

    const visit = (node: ts.Node) => {
        if (isFromMembershipTable(node)) {
            const outcome = chainOutcome(node);
            if (outcome.mutation) {
                sites.push({ file, line: lineOf(node), reason: `.${outcome.mutation}() on ${MEMBERSHIP_TABLE}` });
            } else if (outcome.unresolved) {
                sites.push({ file, line: lineOf(node), reason: `unresolved: ${outcome.unresolved}` });
            }
        } else if (isFromOpaqueTable(node)) {
            sites.push({
                file,
                line: lineOf(node),
                reason: "unresolved: .from() takes a non-literal table name in a file that names user_roles",
            });
        }
        ts.forEachChild(node, visit);
    };

    visit(sf);
    return sites;
}

/**
 * The five realistic call forms the fourth issuance measured against the retired
 * regex. Rows 3–5 escaped it. All five must be seen by the parser.
 */
const ESCAPING_FORMS: { label: string; source: string }[] = [
    {
        label: "plain insert",
        source: `const r = await supabase.from("user_roles").insert({ user_id: u, org_id: o, role });`,
    },
    {
        label: "one literal filter then update",
        source: `const r = await supabase.from("user_roles").eq("org_id", orgId).update({ role });`,
    },
    {
        label: "filter argument wraps a call — regex row 3",
        source: `const r = await supabase.from("user_roles").eq("user_id", String(id)).update({ role });`,
    },
    {
        label: "filter argument holds an arrow function — regex row 4",
        source: `const r = await supabase.from("user_roles").in("role", roles.map((x) => x.key)).update({ role });`,
    },
    {
        label: "nested call then upsert — regex row 5",
        source: `const r = await supabase.from("user_roles").eq("org_id", resolveOrg(ctx)).upsert({ role });`,
    },
];

/** Forms that must NOT be flagged, or the lock becomes noise the next runner disables. */
const PERMITTED_FORMS: { label: string; source: string }[] = [
    {
        label: "read",
        source: `const { data } = await supabase.from("user_roles").select("role").eq("user_id", String(id));`,
    },
    {
        label: "delete",
        source: `await supabase.from("user_roles").delete().eq("user_id", userId).eq("org_id", orgId);`,
    },
    {
        label: "insert into a different table in a file that also reads user_roles",
        source: `
            const { data } = await supabase.from("user_roles").select("role");
            await supabase.from("user_access_profiles").insert({ user_id: u, org_id: o });
        `,
    },
    {
        label: "Array.from is not a query builder",
        source: `const ids = Array.from(new Set(rows.map((r) => r.user_id))); // user_roles`,
    },
];

/** A minimal Supabase stand-in that records the rpc call and returns a canned result. */
function fakeClient(result: { data?: unknown; error?: { code?: string; message: string } }) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const client = {
        rpc(fn: string, args: Record<string, unknown>) {
            calls.push({ fn, args });
            return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
        },
    };
    return { client: client as never, calls };
}

const membershipRow = { user_id: "u1", org_id: "o1", role: "ops" };

describe("W-5 — membership writers use the atomic path", () => {
    /**
     * The load-bearing lock. Discovers writers rather than re-checking a list, so
     * a NEW direct writer added anywhere under app/ or lib/ fails this test on the
     * commit that adds it. Exit criterion: "Q4's count cannot grow."
     */
    it("no file under app/ or lib/ writes user_roles directly", () => {
        expect(
            directMembershipWriteSites(),
            "route these through @/lib/admin/membershipWithProfile — a direct write re-opens G4"
        ).toEqual([]);
    });

    it("the discovery scan is not vacuous", () => {
        // If the walker silently stops finding files, the lock above passes for the
        // wrong reason.
        const files = PRODUCT_TREES.flatMap(sourceFilesUnder);
        expect(files.length).toBeGreaterThan(500);
        expect(files.some((f) => f.endsWith(join("admin", "users", "route.ts")))).toBe(true);

        // And the pre-filter must still reach the files that name the table.
        const naming = files.filter((abs) => readFileSync(abs, "utf8").includes(MEMBERSHIP_TABLE));
        expect(naming.length).toBeGreaterThan(10);
    });

    it("the analyzer sees a real direct writer that lives outside the product trees", () => {
        // A known direct writer, uncovered by design since W-5's first issuance.
        const relPath = "tests/processing/cert/processingIdentityCertFixtures.ts";
        const sites = writeSitesInSource(relPath, readFileSync(join(webRoot, relPath), "utf8"));
        expect(sites.length).toBeGreaterThan(0);
        expect(sites.every((s) => s.file === relPath)).toBe(true);
    });

    it.each(ESCAPING_FORMS)("flags $label", ({ source }) => {
        const sites = writeSitesInSource("fixture.ts", source);
        expect(sites, "this form writes user_roles and must not escape the lock").toHaveLength(1);
        expect(sites[0].reason).toMatch(/^\.(insert|upsert|update)\(\)/);
    });

    it.each(PERMITTED_FORMS)("does not flag $label", ({ source }) => {
        expect(writeSitesInSource("fixture.ts", source)).toEqual([]);
    });

    it("reports file and line so a failure names the writer", () => {
        const sites = writeSitesInSource("fixture.ts", `\n\nawait supabase.from("user_roles").insert({});\n`);
        expect(sites).toEqual([{ file: "fixture.ts", line: 3, reason: ".insert() on user_roles" }]);
    });

    it.each(MEMBERSHIP_WRITER_SOURCES)("%s does not write user_roles directly", (relPath) => {
        const sites = writeSitesInSource(relPath, readFileSync(join(webRoot, relPath), "utf8"));
        expect(sites, `${relPath} writes user_roles directly`).toEqual([]);
    });

    it.each(MEMBERSHIP_WRITER_SOURCES)("%s imports the atomic helper", (relPath) => {
        const src = readFileSync(join(webRoot, relPath), "utf8");
        expect(src).toContain("@/lib/admin/membershipWithProfile");
    });

    it("the invite handler no longer maps a raw insert error to 409", () => {
        const src = readFileSync(join(webRoot, "app/api/admin/users/route.ts"), "utf8");
        // The 409 must come from the helper's classified outcome, not a bare SQLSTATE.
        expect(src).not.toContain('insertError.code === "23505"');
        expect(src).toContain('membership.kind === "duplicate"');
    });

    it("the role handler no longer deletes memberships outside the transaction", () => {
        const src = readFileSync(join(webRoot, "app/api/admin/users/[userId]/role/route.ts"), "utf8");
        expect(/from\(\s*["']user_roles["']\s*\)\s*\.\s*delete\b/.test(src)).toBe(false);
        expect(src).toContain("replaceMembershipWithAccessProfile");
    });
});

describe("W-5 — helper maps RPC outcomes", () => {
    it("calls the create RPC with the membership triple", async () => {
        const { client, calls } = fakeClient({ data: membershipRow });
        const res = await createMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });

        expect(res.ok).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].fn).toBe("create_membership_with_access_profile");
        expect(calls[0].args).toEqual({ p_user_id: "u1", p_org_id: "o1", p_role: "ops" });
    });

    it("classifies a unique violation as duplicate", async () => {
        const { client } = fakeClient({ error: { code: "23505", message: "duplicate key" } });
        const res = await createMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });
        expect(res).toMatchObject({ ok: false, kind: "duplicate" });
    });

    it("classifies the replace RPC's no-membership signal as not_found", async () => {
        const { client } = fakeClient({ error: { code: "P0002", message: "no membership" } });
        const res = await replaceMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });
        expect(res).toMatchObject({ ok: false, kind: "not_found" });
    });

    it("fails the whole call when the RPC errors — no partial success", async () => {
        const { client } = fakeClient({ error: { code: "23503", message: "profile insert failed" } });
        const res = await createMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.kind).toBe("error");
        expect(res.error).toContain("profile insert failed");
    });

    it("treats an empty RPC result as failure rather than a phantom success", async () => {
        const { client } = fakeClient({ data: null });
        const res = await createMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });
        expect(res.ok).toBe(false);
    });

    it("unwraps a single-row array result", async () => {
        const { client } = fakeClient({ data: [membershipRow] });
        const res = await createMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.row.role).toBe("ops");
    });
});
