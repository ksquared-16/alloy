/**
 * W-14 / RL-10 (tier A, discovered subject) — every exported API handler appears in the
 * declared route capability table, and the table's capabilities are real catalog keys.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §8.
 *
 * The check itself is `web/scripts/checkRouteCapabilities.mjs`, which also runs in `prebuild`.
 * This file locks the properties that make it worth running:
 *
 *   1. It is GREEN against the committed table.
 *   2. It is NOT VACUOUS — it genuinely fails for an undeclared route, an undeclared method on
 *      a declared route, and a declaration whose route has been deleted. §10.2 exists because a
 *      census that always passes was mistaken for verification for two phases.
 *   3. The subject is DISCOVERED from disk, so a route added tomorrow is a violation tomorrow.
 *      RL-1, RL-4 and RL-11 were each defeated by an enumerated subject; this is the same
 *      lesson applied before the fact rather than after.
 *   4. The pending backlog RATCHETS downward — W-15's exit is `pending === 0`.
 *   5. Every declared capability is a key the permission catalog actually seeds.
 *
 * Property 5 is W-11's tier A check, which `03…` §7 records as inexpressible until this
 * workstream supplied the declared set: *"This check is only meaningful after W-14 supplies the
 * declared set — so W-11 lands the data change and W-14 lands the check that keeps it true."*
 * It is expressible now, so it is here.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { resolve, join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import {
    runRouteCapabilityCheck,
    bindDeclaration,
    handlerBody,
    pendingWithKnownGates,
    gateInventory,
    discoverCatalogKeys,
    // @ts-expect-error - .mjs check script, no type declarations
} from "../../scripts/checkRouteCapabilities.mjs";
import { discoverCatalog } from "./permissionCatalogDiscovery";

type Declaration =
    | { status: "declared"; capability: string; helper?: string; note?: string }
    | { status: "none"; reason: string }
    | { status: "pending"; note?: string };

type Report = {
    ok: boolean;
    counts: { routes: number; methods: number; declared: number; none: number; pending: number; bound: number };
    ratchet: { max_pending: number | null; inherited: number; owned_pending: number };
    violations: { route: string; kind: string; detail: string }[];
    bindings: { route: string; method: string; helper: string; capability: string; enforcedIn: string }[];
    onDisk: [string, string[]][];
};

type Binding = { violations: { route: string; kind: string; detail: string }[]; evidence: unknown };

const WEB = resolve(__dirname, "../..");
const TABLE_PATH = resolve(__dirname, "../../scripts/routeCapabilities.declared.json");
const table = JSON.parse(readFileSync(TABLE_PATH, "utf8")) as {
    reviewed: string;
    note: string;
    ratchet: { max_pending: number };
    inherited?: { frozen: string; handlers: { route: string; method: string }[] };
    routes: Record<string, Record<string, Declaration>>;
};

const report = runRouteCapabilityCheck() as Report;

/**
 * Re-run the check against a mutated copy of the table, to prove it can fail.
 *
 * The copy goes to a temp file and the committed table is never written. An earlier draft
 * mutate-and-restored the real file, which meant a run killed mid-test left the repository dirty
 * and the ratchet ceiling wrong — a negative fixture must not be able to damage the thing it tests.
 */
function checkWith(mutate: (t: typeof table) => void): Report {
    const copy = JSON.parse(readFileSync(TABLE_PATH, "utf8")) as typeof table;
    mutate(copy);
    const scratch = join(mkdtempSync(join(tmpdir(), "rl10-")), "routeCapabilities.declared.json");
    writeFileSync(scratch, JSON.stringify(copy, null, 2));
    try {
        return runRouteCapabilityCheck(scratch) as Report;
    } finally {
        rmSync(dirname(scratch), { recursive: true, force: true });
    }
}

describe("W-14 · RL-10 — the declared route capability table", () => {
    it("passes against the committed table", () => {
        expect(report.violations).toEqual([]);
        expect(report.ok).toBe(true);
    });

    it("declares at METHOD grain, not file grain", () => {
        // 05…§9: "A gated file does not mean every method in it is gated." A file-grained table
        // would inherit the single largest weakness of the census it replaces. The handler count
        // must genuinely exceed the file count, or the grain has silently collapsed.
        expect(report.counts.methods).toBeGreaterThan(report.counts.routes);
    });

    it("discovers its subject from disk rather than enumerating it", () => {
        const onDisk = new Map(report.onDisk);
        expect(onDisk.size).toBeGreaterThan(300);
        expect(Object.keys(table.routes).sort()).toEqual([...onDisk.keys()].sort());
    });

    it("fails when a route file is not declared", () => {
        const victim = Object.keys(table.routes)[0]!;
        const result = checkWith((t) => {
            delete t.routes[victim];
        });
        expect(result.ok).toBe(false);
        expect(result.violations.some((v) => v.kind === "undeclared-route" && v.route === victim)).toBe(true);
    });

    it("fails when an exported method is not declared", () => {
        // The failure a file-grained table cannot produce.
        const [victim, methods] = report.onDisk.find(([, m]) => m.length > 1)!;
        const result = checkWith((t) => {
            delete t.routes[victim]![methods[0]!];
        });
        expect(result.ok).toBe(false);
        expect(result.violations.some((v) => v.kind === "undeclared-method" && v.route === victim)).toBe(true);
    });

    it("fails when a declaration outlives its route", () => {
        const result = checkWith((t) => {
            t.routes["app/api/__deleted__/route.ts"] = { GET: { status: "pending" } };
        });
        expect(result.ok).toBe(false);
        expect(result.violations.some((v) => v.kind === "stale-route")).toBe(true);
    });

    it("fails when 'no capability required' is asserted without a reason", () => {
        const victim = Object.keys(table.routes)[0]!;
        const method = Object.keys(table.routes[victim]!)[0]!;
        const result = checkWith((t) => {
            t.routes[victim]![method] = { status: "none", reason: "n/a" } as Declaration;
        });
        expect(result.ok).toBe(false);
        expect(result.violations.some((v) => v.kind === "unreasoned-none")).toBe(true);
    });

    it("ratchets the pending backlog downward", () => {
        // The bound is over the backlog this program OWNS. Raw `pending` also counts handlers other
        // programs introduced while this branch was frozen; those are enumerated in `inherited` and
        // asserted live, still-exported and still-pending by the suite below. Subtracting an
        // ENUMERATED list is not slack — a handler is either named by a human or counted here.
        expect(report.ratchet.owned_pending).toBeLessThanOrEqual(table.ratchet.max_pending);
        const result = checkWith((t) => {
            t.ratchet.max_pending = Math.max(0, t.ratchet.max_pending - 1);
        });
        expect(result.violations.some((v) => v.kind === "ratchet-pending")).toBe(true);
    });

    it("every declared capability is a key the permission catalog seeds", () => {
        // W-11's tier A check, expressible for the first time. A route declaring a capability the
        // catalog does not hold can never be satisfied by any grant — it is a permanent 403 that
        // reads like a gate.
        const catalog = new Set(discoverCatalog().keys());
        const undeclared: { route: string; method: string; capability: string }[] = [];
        for (const [route, methods] of Object.entries(table.routes)) {
            for (const [method, decl] of Object.entries(methods)) {
                if (decl.status === "declared" && !catalog.has(decl.capability)) {
                    undeclared.push({ route, method, capability: decl.capability });
                }
            }
        }
        expect(undeclared, "declared capabilities absent from the seeded catalog").toEqual([]);
    });

    it("the pilot slice is genuinely declared, not all-pending", () => {
        // W-14 delivers the mechanism AND a pilot. A table of 751 `pending` entries would satisfy
        // every structural property above while asserting nothing about enforcement.
        expect(report.counts.declared).toBeGreaterThanOrEqual(20);
        expect(report.counts.none).toBeGreaterThanOrEqual(1);
    });

    it("every declared handler is BOUND to its source, not merely asserted", () => {
        // The property W-14 shipped without. Before this, `{"status":"declared","capability":"…"}`
        // was a sentence in a JSON file; deleting the guard it named left this check green.
        expect(report.counts.bound).toBe(report.counts.declared);
        expect(report.bindings).toHaveLength(report.counts.declared);
        for (const b of report.bindings) {
            expect(b.enforcedIn, `${b.route} ${b.method}`).toMatch(/\.tsx?$/);
        }
    });

    it("the binding is at METHOD grain — a sibling method's guard cannot vouch for it", () => {
        // The whole table is built on the claim that one route.ts may gate GET and not DELETE.
        // If handlerBody returned the file, every join above would pass by accident.
        const [victim, methods] = report.onDisk.find(([, m]) => m.length > 1)!;
        const bodies = methods.map((m) => handlerBody(join(WEB, victim), m) as string | null);
        for (const body of bodies) expect(body).not.toBeNull();
        expect(new Set(bodies).size, `${victim} returned one body for ${methods.join("/")}`).toBe(methods.length);
        for (const body of bodies) {
            expect((body as string).length).toBeLessThan(readFileSync(join(WEB, victim), "utf8").length);
        }
    });
});

/**
 * The three joins, proved to bite — each against a fixture built to fail exactly one of them.
 *
 * Table mutation alone cannot reach every join: `untested-verdict` is a property of route SOURCE, and
 * the repository (correctly) contains no route that discards a verdict. A control whose failure path
 * has never executed is a control nobody has tested, so the failing sources are constructed here.
 */
describe("W-15 prerequisite — the declaration binding falsifies a false claim", () => {
    // The fixtures live in a temp directory, never under app/api. `@/…` resolves against the web
    // root regardless of the importing file's location, so a fixture there still binds against the
    // REAL helper module — while a run killed mid-test cannot leave a stray route in the app tree.
    const scratch = mkdtempSync(join(tmpdir(), "w15-bind-"));
    const write = (name: string, source: string) => {
        const p = join(scratch, `${name}.route.ts`);
        writeFileSync(p, source);
        return p;
    };

    const DECL = { status: "declared", capability: "settings.users_roles", helper: "requireUsersRolesManageAuth" };
    const IMPORT = `import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";\n`;

    afterAll(() => {
        rmSync(scratch, { recursive: true, force: true });
    });

    it("join 1 — convicts a handler that declares a gate it never calls", () => {
        const p = write(
            "uncalled",
            `${IMPORT}export async function GET() { return Response.json({ ok: true }); }\n`
        );
        const { violations } = bindDeclaration(p, "fixture", "GET", DECL) as Binding;
        expect(violations.map((v) => v.kind)).toContain("unbound-declaration");
    });

    it("join 1 — convicts a guard that sits in a SIBLING method", () => {
        // The file is gated. This method is not. A file-grained join would call this compliant.
        const p = write(
            "sibling",
            `${IMPORT}export async function GET() {\n  const auth = await requireUsersRolesManageAuth();\n  if (!auth.ok) return auth.response;\n  return Response.json({ ok: true });\n}\n` +
                `export async function DELETE() { return Response.json({ deleted: true }); }\n`
        );
        expect((bindDeclaration(p, "fixture", "GET", DECL) as Binding).violations).toEqual([]);
        expect((bindDeclaration(p, "fixture", "DELETE", DECL) as Binding).violations.map((v) => v.kind)).toContain(
            "unbound-declaration"
        );
    });

    it("join 2 — convicts a handler that calls the gate and discards the verdict", () => {
        // The most dangerous shape in the set: it reads as gated, greps as gated, and admits everyone.
        const p = write(
            "discarded",
            `${IMPORT}export async function POST() {\n  const auth = await requireUsersRolesManageAuth();\n  return Response.json({ ok: true });\n}\n`
        );
        const { violations } = bindDeclaration(p, "fixture", "POST", DECL) as Binding;
        expect(violations.map((v) => v.kind)).toContain("untested-verdict");
    });

    it("join 2 — accepts a verdict tested to DEGRADE rather than to refuse", () => {
        // enrollment-packet-launch skips the send instead of returning 403. Acting on a verdict is
        // the property; returning is one way to act on it, and a rule phrased as "must return"
        // would have convicted working code.
        const p = write(
            "degrade",
            `${IMPORT}export async function POST() {\n  const auth = await requireUsersRolesManageAuth();\n  let result = null;\n  if (!auth.ok) { result = { skipped: true }; } else { result = { sent: true }; }\n  return Response.json(result);\n}\n`
        );
        expect((bindDeclaration(p, "fixture", "POST", DECL) as Binding).violations).toEqual([]);
    });

    it("join 3 — convicts a capability the named helper's module does not enforce", () => {
        const p = write(
            "wrongkey",
            `${IMPORT}export async function GET() {\n  const auth = await requireUsersRolesManageAuth();\n  if (!auth.ok) return auth.response;\n  return Response.json({ ok: true });\n}\n`
        );
        const { violations } = bindDeclaration(p, "fixture", "GET", {
            ...DECL,
            capability: "documents.read",
        }) as Binding;
        expect(violations.map((v) => v.kind)).toContain("capability-not-enforced");
    });

    it("convicts a declaration that names no helper at all", () => {
        const p = write("noaddress", `export async function GET() { return Response.json({}); }\n`);
        const { violations } = bindDeclaration(p, "fixture", "GET", {
            status: "declared",
            capability: "settings.users_roles",
        }) as Binding;
        expect(violations.map((v) => v.kind)).toContain("unaddressed-declaration");
    });

    it("reports 'could not read' as a violation rather than as a pass", () => {
        // §10.2's lesson: an unreadable subject must never be indistinguishable from a clean one.
        const p = write("unreadable", `${IMPORT}export const GET = someFactory;\n`);
        const { violations } = bindDeclaration(p, "fixture", "GET", DECL) as Binding;
        expect(violations.map((v) => v.kind)).toContain("unresolvable-handler");
    });

    it("resolves the aliased `export { handler as POST }` form", () => {
        // Under-reporting here would leave a real handler unbindable, so the alias is followed.
        const p = write(
            "aliased",
            `${IMPORT}async function handler() {\n  const auth = await requireUsersRolesManageAuth();\n  if (!auth.ok) return auth.response;\n  return Response.json({ ok: true });\n}\nexport { handler as POST };\n`
        );
        expect((bindDeclaration(p, "fixture", "POST", DECL) as Binding).violations).toEqual([]);
    });

    it("survives a template literal nested inside another's interpolation", () => {
        // documents/entity-options builds `Visit ${start}${x ? ` · job ${id}` : ""}`. A scanner that
        // takes the first backtick it meets as the closing one loses brace balance for the rest of
        // the file, and that route's GET was reported unreadable for exactly this reason.
        const p = write(
            "nestedtemplate",
            `${IMPORT}export async function GET() {\n` +
                `  const auth = await requireUsersRolesManageAuth();\n` +
                `  if (!auth.ok) return auth.response;\n` +
                "  const label = `Visit ${auth.access.orgId}${auth.ok ? ` · job ${auth.access.orgId}` : \"\"}`;\n" +
                `  return Response.json({ label });\n}\n`
        );
        expect((bindDeclaration(p, "fixture", "GET", DECL) as Binding).violations).toEqual([]);
    });

    it("follows `export { GET } from …` to the module that holds the body", () => {
        // Three v2 drawer routes are pure re-exports of their v1 counterparts. Reporting a gated
        // handler as unreadable makes it a reviewer's problem instead of an author's.
        write(
            "reexport-target",
            `${IMPORT}export async function GET() {\n  const auth = await requireUsersRolesManageAuth();\n  if (!auth.ok) return auth.response;\n  return Response.json({ ok: true });\n}\n`
        );
        // A relative specifier, as `resolveImport` accepts (the real drawer routes use `@/…`).
        const p = write("reexport", `export { GET } from "./reexport-target.route";\n`);
        expect(handlerBody(p, "GET")).not.toBeNull();
        expect((bindDeclaration(p, "fixture", "GET", DECL) as Binding).violations.map((v) => v.kind)).not.toContain(
            "unresolvable-handler"
        );
    });

    it("does not mistake a helper NAMED in a string or comment for a call", () => {
        const p = write(
            "mentioned",
            `${IMPORT}export async function GET() {\n  // requireUsersRolesManageAuth() belongs here\n  const note = "requireUsersRolesManageAuth()";\n  return Response.json({ note });\n}\n`
        );
        const { violations } = bindDeclaration(p, "fixture", "GET", DECL) as Binding;
        expect(violations.map((v) => v.kind)).toContain("unbound-declaration");
    });
});

/**
 * W-15's backlog is 725 handlers. Ordering it by evidence rather than by directory listing is what
 * makes it a burndown instead of a slog — and the first thing the ordering found was the table
 * under-reporting a route that is already gated.
 */
describe("W-15 — the burndown worklist is discovered from source", () => {
    const table = JSON.parse(readFileSync(TABLE_PATH, "utf8")) as {
        routes: Record<string, Record<string, Declaration>>;
    };
    const found = pendingWithKnownGates(table) as {
        route: string;
        method: string;
        helper: string;
        capabilityElsewhere: string;
    }[];

    it("is now DRAINED against the real table", () => {
        // Session 4 discovered one entry — profile-photo GET, enforced by the very
        // assertDocumentAccess that documents/[id]/signed-url declares as documents.read — and
        // session 5 declared it. So the honest assertion about the live table is that this class of
        // under-reporting is empty, not that it is non-empty.
        //
        // An emptiness assertion is worth nothing on its own: a discovery that has quietly stopped
        // working also returns []. The test below is what keeps this one meaningful.
        expect(found).toEqual([]);
    });

    it("still FINDS profile-photo GET when the table under-reports it again", () => {
        // The same discovery, run against a table with the declaration removed. This is what
        // separates "the backlog is drained" from "the finder is broken" — the two states the
        // previous assertion cannot tell apart on its own, and the reason draining a worklist must
        // never be allowed to retire the tool that built it.
        const regressed = JSON.parse(JSON.stringify(table)) as typeof table;
        regressed.routes["app/api/admin/persons/[id]/profile-photo/route.ts"].GET = { status: "pending" };
        const rediscovered = pendingWithKnownGates(regressed) as { route: string; method: string; helper: string }[];
        const photo = rediscovered.filter((f) => f.route.includes("persons/[id]/profile-photo"));
        expect(photo.map((f) => f.method).sort()).toEqual(["GET"]);
        for (const f of photo) expect(f.helper).toBe("assertDocumentAccess");
    });

    it("does NOT claim profile-photo's mutations — they gate on a role, not a capability", () => {
        // POST and DELETE guard with `ctx.role !== "admin"`. That is a gate, but not a capability
        // gate, and the worklist must not imply a capability nobody has chosen. Which key replaces
        // a raw role check is W-15's product call — precisely the decision this list must not make
        // on its own. Asserted so a future widening of the worklist's heuristic has to face it.
        //
        // Read from the REGRESSED table, not the live one. Against the live table `found` is now
        // empty and this assertion would hold for the wrong reason — a negative that passes because
        // there is nothing to check is the tautology session 4 caught itself writing in the fixture
        // matrix, and it is no better here.
        const regressed = JSON.parse(JSON.stringify(table)) as typeof table;
        regressed.routes["app/api/admin/persons/[id]/profile-photo/route.ts"].GET = { status: "pending" };
        const photo = (pendingWithKnownGates(regressed) as { route: string; method: string }[]).filter((f) =>
            f.route.includes("persons/[id]/profile-photo")
        );
        expect(photo.length).toBeGreaterThan(0);
        expect(photo.map((f) => f.method)).not.toContain("POST");
        expect(photo.map((f) => f.method)).not.toContain("DELETE");
    });

    it("never reports a handler that is already declared", () => {
        for (const f of found) {
            expect(table.routes[f.route]?.[f.method]?.status).toBe("pending");
        }
    });
});

/**
 * The sizing inventory that turns "725 pending" into a lane with a shape — and the two properties
 * that keep it from becoming the census it replaced.
 */
describe("W-15 — gate sizing is conservative where it matters", () => {
    const table = JSON.parse(readFileSync(TABLE_PATH, "utf8")) as {
        routes: Record<string, Record<string, Declaration>>;
    };

    it("discovers the SAME catalog as the TypeScript helper it duplicates", () => {
        // The .mjs copy exists only because prebuild cannot import the .ts helper. Two independent
        // catalog parsers that silently disagree is how the "35 keys" figure survived three
        // workstreams, so the copy is locked to the original rather than trusted.
        const fromScript = [...(discoverCatalogKeys() as Set<string>)].sort();
        const fromHelper = [...discoverCatalog().keys()].sort();
        expect(fromScript).toEqual(fromHelper);
        expect(fromScript.length).toBeGreaterThan(50);
    });

    it("judges capability evidence by the CATALOG, not by the key grammar", () => {
        // Bucketing on the grammar alone credited 80 handlers with capability gates, on the strength
        // of literals like `customer_id.is.null` and `person.email`. Passing a catalog that holds
        // nothing must therefore empty the bucket — if it does not, the grammar is still judging.
        const real = gateInventory(table) as { capability: unknown[] };
        const withNoCatalog = gateInventory(table, new Set()) as { capability: unknown[] };
        expect(withNoCatalog.capability).toHaveLength(0);
        expect(real.capability.length).toBeLessThan(20);
    });

    it("never reports a handler the table has already declared", () => {
        const inv = gateInventory(table) as Record<string, { route: string; method: string }[]>;
        for (const rows of Object.values(inv)) {
            for (const r of rows) expect(table.routes[r.route]?.[r.method]?.status).toBe("pending");
        }
    });

    it("accounts for every pending handler exactly once", () => {
        // A bucket total that does not reconcile to the ratchet means handlers are being dropped —
        // and a dropped handler reads as a clean one.
        const inv = gateInventory(table) as Record<string, unknown[]>;
        const pending = Object.values(table.routes).flatMap((m) =>
            Object.values(m).filter((d) => d.status === "pending")
        ).length;
        expect(Object.values(inv).reduce((n, b) => n + b.length, 0)).toBe(pending);
    });
});

/**
 * The four ways the sizing reader was reporting a GATED handler as carrying no gate at all.
 *
 * Session 4 delivered the sizing and its load-bearing output is `none` — "no authorization was
 * discovered here". That output is only worth an operator's attention if it is mostly TRUE. Reading
 * the 67 it produced, 37 of them were gated: the reader was losing the evidence, not the routes were
 * losing the gate. A risk list that is half noise gets triaged like noise, which is the specific way
 * a conservative check stops being conservative.
 *
 * Each defect below is the same shape — *an enumerated answer where a discovered one was needed*, or
 * *a body read against the wrong file* — and each is proved here against a fixture built to fail
 * exactly that one. None of them widens what the check PASSES: `bindDeclaration` still reads the
 * exported body alone, so a declared route that hides its guard behind a delegation still fails its
 * join. Sharpening a measurement and loosening a lock are opposite moves.
 */
describe("W-15 sizing — the reader finds a gate that is really there", () => {
    const scratch = mkdtempSync(join(tmpdir(), "w15-size-"));
    const write = (name: string, source: string) => {
        const p = join(scratch, `${name}.route.ts`);
        writeFileSync(p, source);
        return relative(resolve(__dirname, "../.."), p).split("\\").join("/");
    };
    const bucketOf = (route: string, method: string) => {
        const inv = gateInventory({ routes: { [route]: { [method]: { status: "pending" } } } }) as Record<
            string,
            { route: string }[]
        >;
        return Object.entries(inv).find(([, rows]) => rows.length)?.[0] ?? "empty";
    };

    afterAll(() => {
        rmSync(scratch, { recursive: true, force: true });
    });

    const GATE = `import { loadAdminRouteGate } from "@/lib/admin/adminRouteGate";\n`;
    const GUARD = `const gate = await loadAdminRouteGate();\n  if (!gate.ok) return Response.json({}, { status: 403 });\n`;

    it("a gate reached through a DELEGATION is not an absence", () => {
        // `jobs` exports a perf shell over `getJobsImpl`, and the impl carries the context load.
        // Reading only the exported body reported one of the most heavily guarded routes in the
        // tree as ungated.
        const route = write(
            "delegated",
            `${GATE}async function impl() {\n  ${GUARD}  return Response.json({ ok: true });\n}\n` +
                `export async function GET() { return impl(); }\n`
        );
        expect(bucketOf(route, "GET")).toBe("authenticated");
    });

    it("the delegation hop is ONE hop, not a closure walk", () => {
        // The census was retired for crediting a route because something in its import closure
        // mentioned a primitive. One hop keeps the answer checkable by reading one file; a second
        // local hop must NOT be followed, or the stopping rule is not a rule.
        const route = write(
            "twohop",
            `${GATE}async function inner() {\n  ${GUARD}  return null;\n}\n` +
                `async function outer() { return inner(); }\n` +
                `export async function GET() { return outer(); }\n`
        );
        expect(bucketOf(route, "GET")).toBe("none");
    });

    it("the authority vocabulary is DERIVED, not enumerated", () => {
        // `loadAdminRouteGate` matches none of the four hand-written root names, and every route
        // entering through it — the newer, preferred entry point — read as ungated. The helper is
        // recognised because its own declaration calls a root, so a gate helper written tomorrow
        // needs no edit here.
        const route = write(
            "derived",
            `${GATE}export async function GET() {\n  ${GUARD}  return Response.json({ ok: true });\n}\n`
        );
        expect(bucketOf(route, "GET")).toBe("authenticated");
    });

    it("a RETURN TYPE brace is not a function body", () => {
        // `async function f(): Promise<{ ok: true } | { ok: false }> { … }` opens two braces at
        // paren depth zero before the body starts. Taking the first yields a type fragment with no
        // calls in it, so a helper that authenticates in its first line reads as inert. Seven
        // config-layout-assist handlers were reported ungated because of a brace in a signature.
        const helper = join(scratch, "unionHelper.ts");
        writeFileSync(
            helper,
            `import { getAdminContextCached } from "@/lib/admin/getAdminContext";\n` +
                `export async function loadThing(): Promise<{ ok: true; orgId: string } | { ok: false }> {\n` +
                `  const ctx = await getAdminContextCached();\n  if (!ctx.ok) return { ok: false };\n` +
                `  return { ok: true, orgId: ctx.orgId };\n}\n`
        );
        const route = write(
            "uniontype",
            `import { loadThing } from "./unionHelper";\n` +
                `export async function GET() {\n  const t = await loadThing();\n  if (!t.ok) return Response.json({}, { status: 403 });\n  return Response.json({ ok: true });\n}\n`
        );
        expect(bucketOf(route, "GET")).toBe("authenticated");
    });

    it("a re-exported handler is read against ITS OWN file's imports", () => {
        // The three v2 drawer routes are one line: `export { GET } from "…"`. The body arrived
        // carrying `loadAdminRouteGate(…)` and was matched against the v2 file's import table,
        // which is empty — a body and an import table taken from two different files.
        const targetAbs = join(scratch, "reexportTarget.ts");
        writeFileSync(
            targetAbs,
            `${GATE}export async function GET() {\n  ${GUARD}  return Response.json({ ok: true });\n}\n`
        );
        const route = write("reexport", `export { GET } from "./reexportTarget";\n`);
        expect(bucketOf(route, "GET")).toBe("authenticated");
    });

    it("a BARREL re-export is followed to the declaration", () => {
        // Six processing-identity handlers import `resolveOperatorRoute` from a directory barrel
        // that declares nothing. Asking the barrel whether it authenticates gets "no".
        writeFileSync(
            join(scratch, "barrelImpl.ts"),
            `import { getAdminContextCached } from "@/lib/admin/getAdminContext";\n` +
                `export async function resolveIt() {\n  const ctx = await getAdminContextCached();\n  if (!ctx.ok) return null;\n  return ctx;\n}\n`
        );
        writeFileSync(join(scratch, "barrelIndex.ts"), `export { resolveIt } from "./barrelImpl";\n`);
        const route = write(
            "barrel",
            `import { resolveIt } from "./barrelIndex";\n` +
                `export async function GET() {\n  const r = await resolveIt();\n  if (!r) return Response.json({}, { status: 401 });\n  return Response.json({ ok: true });\n}\n`
        );
        expect(bucketOf(route, "GET")).toBe("authenticated");
    });

    it("an authority verdict nobody BRANCHES on is not a gate", () => {
        // The tightening that runs the other way, and the reason it is here: without it, every
        // widening above is a one-directional loosening of the risk list. A handler that resolves
        // the caller and then ignores the answer establishes nothing, and must fall to `none`
        // where a reviewer will see it.
        const route = write(
            "unbranched",
            `${GATE}export async function GET() {\n  const gate = await loadAdminRouteGate();\n  return Response.json({ org: gate.orgId });\n}\n`
        );
        expect(bucketOf(route, "GET")).toBe("none");
    });

    it("still refuses to call an ungated handler gated", () => {
        // The whole point of the direction-of-error argument. A false `none` costs a reviewer five
        // minutes; a false all-clear costs an exposure nobody looks for again.
        const route = write(
            "ungated",
            `export async function DELETE() { return Response.json({ deleted: true }); }\n`
        );
        expect(bucketOf(route, "DELETE")).toBe("none");
    });
});

/**
 * The inherited list — growth this program did not cause, admitted only by enumeration.
 *
 * `max_pending` is a ONE-WAY ratchet over the Access backlog. A frozen branch rejoining a base that
 * moved by 459 commits grows the denominator without anyone backsliding, which the ceiling alone
 * cannot express. Raising it forfeits the ratchet; holding it makes the gate permanently red for
 * work no Access session performed. So the effective bound is `pending - inherited <= max_pending`,
 * and every inherited entry must keep earning its place — the tests below are the proof that it does.
 */
describe("W-14 · RL-10 — inherited handlers, the enumerated denominator", () => {
    const inherited = table.inherited?.handlers ?? [];

    it("the ceiling only ever DESCENDS; the program-owned backlog is what is bounded", () => {
        // 695 is where the inherited treatment landed — the value OD-1 was not allowed to raise.
        // W-15's burndown under OD-7 lowers it, which is the ratchet's designed direction, so the
        // assertion is an upper bound rather than an equality. An equality here would have to be
        // edited on every conversion, and a test edited that often stops being read.
        const TREATMENT_CEILING = 695;
        expect(table.ratchet.max_pending).toBeLessThanOrEqual(TREATMENT_CEILING);
        expect(report.ratchet.max_pending).toBe(table.ratchet.max_pending);
        expect(report.ratchet.owned_pending).toBe(report.counts.pending - report.ratchet.inherited);
        expect(report.ratchet.owned_pending).toBeLessThanOrEqual(695);
        // And the treatment is doing real work — if inherited were empty this would be red.
        expect(report.counts.pending).toBeGreaterThan(695);
    });

    it("every inherited entry names a live, still-exported, still-pending handler", () => {
        const onDisk = new Map(report.onDisk);
        expect(inherited.length).toBeGreaterThan(0);
        for (const { route, method } of inherited) {
            expect(onDisk.get(route), `${route} is inherited but absent from disk`).toContain(method);
            expect(table.routes[route]?.[method]?.status, `${route}#${method}`).toBe("pending");
        }
        expect(report.ratchet.inherited).toBe(inherited.length);
    });

    it("an unlisted pending handler still breaks the ratchet", () => {
        // Drop one entry and it becomes an ordinary pending handler counted against the ceiling.
        // This is exactly the shape of a NEW route arriving unlisted: 696 owned against 695.
        const r = checkWith((t) => {
            t.inherited!.handlers = t.inherited!.handlers.slice(1);
        });
        expect(r.ratchet.owned_pending).toBe(report.ratchet.owned_pending + 1);
        expect(r.violations.map((v) => v.kind)).toContain("ratchet-pending");
        expect(r.ok).toBe(false);
    });

    it("a stale inherited entry fails — a route that no longer exists", () => {
        const r = checkWith((t) => {
            t.inherited!.handlers = [...t.inherited!.handlers, { route: "app/api/admin/gone/route.ts", method: "GET" }];
        });
        const stale = r.violations.filter((v) => v.kind === "stale-inherited");
        expect(stale).toHaveLength(1);
        expect(stale[0].detail).toContain("no such route file");
    });

    it("a stale inherited entry fails — a method the file no longer exports", () => {
        const r = checkWith((t) => {
            t.inherited!.handlers = [...t.inherited!.handlers, { route: inherited[0].route, method: "TRACE" }];
        });
        expect(r.violations.filter((v) => v.kind === "stale-inherited")[0]?.detail).toContain("no longer exported");
    });

    it("an inherited handler that becomes declared or none FAILS until it is removed", () => {
        const { route, method } = inherited[0];
        // Classified but still listed — the allowance would otherwise outlive the backlog item.
        const stillListed = checkWith((t) => {
            t.routes[route][method] = {
                status: "none",
                reason: "A reason long enough to satisfy the substantive-reason rule for a none declaration.",
            } as Declaration;
        });
        const classified = stillListed.violations.filter((v) => v.kind === "classified-inherited");
        expect(classified).toHaveLength(1);
        expect(classified[0].detail).toContain("remove it from inherited");

        // Removed alongside the classification — the ceiling absorbs the gain, no raise needed.
        const removed = checkWith((t) => {
            t.routes[route][method] = {
                status: "none",
                reason: "A reason long enough to satisfy the substantive-reason rule for a none declaration.",
            } as Declaration;
            t.inherited!.handlers = t.inherited!.handlers.filter(
                (h) => !(h.route === route && h.method === method),
            );
        });
        expect(removed.ratchet.max_pending).toBe(table.ratchet.max_pending);
        expect(removed.ratchet.owned_pending).toBe(report.ratchet.owned_pending);
        expect(removed.violations).toEqual([]);
    });

    it("refuses a duplicate entry, so one handler cannot buy two units of slack", () => {
        const r = checkWith((t) => {
            t.inherited!.handlers = [...t.inherited!.handlers, { ...t.inherited!.handlers[0] }];
        });
        expect(r.violations.map((v) => v.kind)).toContain("duplicate-inherited");
    });

    it("asserts nothing about authorization — every inherited handler is still backlog", () => {
        // The list must never become a quiet exemption. `pending` means unreviewed, and OD-7 governs
        // the conversion for these exactly as for the other 695.
        for (const { route, method } of inherited) {
            const decl = table.routes[route]?.[method] as Declaration & { capability?: unknown };
            expect(decl.status).toBe("pending");
            expect(decl.capability ?? null).toBeNull();
        }
    });
});

describe("W-14 · RL-10 — table hygiene", () => {
    it("the retired census is gone", () => {
        // 03…§8: "Retire auditAuthorityPaths.mjs in this workstream — leaving a known-30×-wrong
        // census in the repo invites someone to cite it." C1 is that citation happening.
        expect(existsSync(resolve(__dirname, "../../scripts/auditAuthorityPaths.mjs"))).toBe(false);
        const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
            scripts: Record<string, string>;
        };
        expect(Object.keys(pkg.scripts)).not.toContain("audit:authority-paths");
        expect(pkg.scripts.prebuild).toContain("check:route-capabilities");
    });
});
