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
import { resolve, join, dirname } from "node:path";
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
    ratchet: { max_pending: number | null };
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
        expect(report.counts.pending).toBeLessThanOrEqual(table.ratchet.max_pending);
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

    it("finds pending handlers that already call a declared gate", () => {
        expect(found.length).toBeGreaterThan(0);
    });

    it("names profile-photo GET, which is enforced by the very helper signed-url declares", () => {
        // Not a hypothetical: this sat `pending` while calling the assertDocumentAccess that
        // documents/[id]/signed-url declares as documents.read.
        const photo = found.filter((f) => f.route.includes("persons/[id]/profile-photo"));
        expect(photo.map((f) => f.method).sort()).toEqual(["GET"]);
        for (const f of photo) expect(f.helper).toBe("assertDocumentAccess");
    });

    it("does NOT claim profile-photo's mutations — they gate on a role, not a capability", () => {
        // POST and DELETE guard with `ctx.role !== "admin"`. That is a gate, but not a capability
        // gate, and the worklist must not imply a capability nobody has chosen. Which key replaces
        // a raw role check is W-15's product call — precisely the decision this list must not make
        // on its own. Asserted so a future widening of the worklist's heuristic has to face it.
        const photo = found.filter((f) => f.route.includes("persons/[id]/profile-photo"));
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
