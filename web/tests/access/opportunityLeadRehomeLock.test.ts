/**
 * RL-24 — OPPORTUNITY IS RUNTIME, NOT A CONFIGURABLE PRODUCT.
 *
 * The product-status census settled this: Opportunity is LEGACY_PRODUCT_OVER_LIVE_RUNTIME. Operators
 * say Lead, Inquiry, Case, Child enrollment, Current Work. The `opportunities` table stays — it is
 * the case-level record for a household inquiry moving through Enrollment — but the legacy
 * *configurable* Opportunity authority does not come back.
 *
 * This lock holds three things:
 *
 *   1. `crm.opportunities.read` / `.write` are never enforced. They are registered in
 *      `unenforcedPermissionKeys.json` (W-50 / IA-R8 / T-6) precisely because nothing names them,
 *      and a future slice must not quietly make them real instead of retiring them.
 *   2. no Opportunity-shaped capability is invented — `opportunities.manage`, `pipeline.manage`.
 *   3. every bounded Opportunity mutation is either OWNED by a truthful current capability or
 *      NAMED as awaiting the Director decision. A new one appearing in neither list fails here.
 *
 * WHAT THIS SLICE COULD AND COULD NOT DO. Two of the seven had truthful owners already:
 * `form-deliver` is the Forms power its own sibling `form-send` requires, and the stage-transition
 * preflight turned out to be a POST-shaped READ with no persistence at all. The other five —
 * delete Lead, change Lead location, edit the Lead record, and the two child-inquiry membership
 * writes — have NO truthful owner in the current catalog. The only `enrollment.*` keys are
 * `enrollment.pricing.override` and `enrollment.requirement_exception.manage`, two narrow
 * exceptions that do not own deleting a Lead. `crm.customers.write` governs contacts, and
 * `opportunity_customer_members` carries program category, room cohort, desired start date and
 * close reason — enrollment candidacy, not contact identity. Borrowing it would file enrollment
 * semantics under a contacts key.
 *
 * So those five are recorded below as an explicit Director gate rather than converged, and this
 * lock is what stops them being quietly given the nearest available key.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");
const declared = JSON.parse(read("scripts/routeCapabilities.declared.json")) as {
    routes: Record<string, Record<string, { status: string; capability?: string; reason?: string }>>;
};

/** Comments explain; they do not enforce. */
const executable = (src: string) =>
    src.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");

const LEGACY_KEYS = ["crm.opportunities.read", "crm.opportunities.write"] as const;
const FORBIDDEN_NEW_KEYS = ["opportunities.manage", "pipeline.manage", "opportunities.write", "lead.manage"] as const;

/** Bounded Opportunity mutations with a truthful owner TODAY. */
const OWNED: ReadonlyArray<readonly [string, string, string]> = [
    ["app/api/admin/opportunities/[id]/form-send/route.ts", "POST", "forms.submissions"],
    ["app/api/admin/opportunities/[id]/form-deliver/route.ts", "POST", "forms.submissions"],
    ["app/api/admin/opportunities/[id]/enrollment-packet-launch/route.ts", "POST", "communications.send"],
];

/**
 * Bounded Opportunity mutations with NO truthful owner in the current catalog. Each needs an
 * Enrollment/Lead authority that does not exist, which is a Director decision and not a slice's to
 * make. Listed so they are explicitly OWED rather than silently pending.
 */
const DIRECTOR_GATE: Record<string, string> = {
    "app/api/admin/opportunities/[id]/delete/route.ts":
        "Delete Lead — needs Enrollment/Lead authority; no current key owns destroying a household inquiry",
    "app/api/admin/opportunities/[id]/lead-location/route.ts":
        "Change Lead location — scope-bearing; needs Enrollment/Lead authority",
    "app/api/admin/opportunities/[id]/route.ts":
        "Lead record edit — there is no generic entity WRITE route (entity/[type]/[id] exports GET only), so this is the record-edit path and needs Enrollment/Lead authority",
    "app/api/admin/opportunity-customer-members/route.ts":
        "Child inquiry membership — enrollment candidacy columns; crm.customers.write governs contacts and must not substitute",
    "app/api/admin/opportunity-customer-members/[id]/route.ts":
        "Child inquiry membership edit — same owner question",
};

describe("RL-24 — Opportunity runtime survives; its legacy authority does not", () => {
    it("non-vacuity: the inventory and the Opportunity surface are found", () => {
        expect(Object.keys(declared.routes).length).toBeGreaterThan(500);
        const opp = Object.keys(declared.routes).filter((r) => /opportunit/i.test(r));
        expect(opp.length).toBeGreaterThan(20);
    });

    describe("the legacy keys stay inert", () => {
        for (const key of LEGACY_KEYS) {
            it(`${key} is enforced by nothing executable`, () => {
                const hits: string[] = [];
                const walk = (dir: string) => {
                    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                        const p = path.join(dir, e.name);
                        if (e.isDirectory()) walk(p);
                        else if (/\.(ts|tsx)$/.test(e.name)) {
                            const body = executable(fs.readFileSync(p, "utf8"));
                            if (body.includes(key)) hits.push(path.relative(WEB, p));
                        }
                    }
                };
                walk(path.join(WEB, "lib"));
                walk(path.join(WEB, "app"));
                expect(hits, `${key} must remain unenforced, not become real`).toEqual([]);
            });

            it(`${key} is registered as unenforced`, () => {
                const reg = JSON.parse(read("lib/admin/unenforcedPermissionKeys.json")) as { keys: string[] };
                expect(reg.keys).toContain(key);
            });

            it(`no route declares ${key}`, () => {
                const offenders = Object.entries(declared.routes).flatMap(([route, methods]) =>
                    Object.entries(methods)
                        .filter(([, i]) => i?.capability === key)
                        .map(([m]) => `${route}:${m}`),
                );
                expect(offenders).toEqual([]);
            });
        }

        it("no Opportunity-shaped capability is invented", () => {
            const offenders: string[] = [];
            for (const [route, methods] of Object.entries(declared.routes)) {
                for (const [m, i] of Object.entries(methods)) {
                    if (i?.capability && (FORBIDDEN_NEW_KEYS as readonly string[]).includes(i.capability)) {
                        offenders.push(`${route}:${m} -> ${i.capability}`);
                    }
                }
            }
            expect(offenders).toEqual([]);
        });
    });

    describe("what does have an owner, has a TRUTHFUL one", () => {
        for (const [route, method, capability] of OWNED) {
            it(`${route.replace("app/api/admin/", "")} ${method} -> ${capability}`, () => {
                expect(declared.routes[route]?.[method]?.capability).toBe(capability);
            });
        }

        it("form-deliver calls the Forms helper and returns its refusal", () => {
            const src = executable(read("app/api/admin/opportunities/[id]/form-deliver/route.ts"));
            expect(src).toMatch(/requireFormsCapability\s*\(\s*ctx\s*,\s*FORMS_SUBMISSIONS\s*\)/);
            expect(src).toMatch(/if\s*\(\s*formsDenied\s*\)\s*return\s+formsDenied\s*;/);
        });

        it("CRM customer authority does not substitute for enrollment candidacy", () => {
            for (const route of Object.keys(DIRECTOR_GATE)) {
                const cap = declared.routes[route]?.POST?.capability ?? declared.routes[route]?.PATCH?.capability;
                expect(cap, `${route} must not borrow a CRM contacts key`).not.toBe("crm.customers.write");
            }
        });

        /**
         * The preflight is a POST-shaped READ. Declaring it `none` is the truthful classification;
         * gating it would attach authority to an operation that changes nothing.
         */
        it("the stage-transition preflight is classified as requiring no capability, with a reason", () => {
            const e = declared.routes["app/api/admin/opportunities/[id]/stage-transition-reconciliation/preflight/route.ts"]?.POST;
            expect(e?.status).toBe("none");
            expect(e?.reason ?? "").toMatch(/READ|no insert|changes nothing/i);
        });
    });

    describe("the unowned set stays explicitly owed", () => {
        it("every Director-gated route is still pending — none was quietly given a key", () => {
            for (const [route, why] of Object.entries(DIRECTOR_GATE)) {
                const methods = declared.routes[route] ?? {};
                const mutating = Object.entries(methods).filter(([m]) => !["GET", "HEAD", "OPTIONS"].includes(m));
                expect(mutating.length, `${route} must still expose the mutation`).toBeGreaterThan(0);
                for (const [m, i] of mutating) {
                    expect(i.status, `${route}:${m} — ${why}`).toBe("pending");
                }
            }
        });

        /**
         * COMPLETENESS. A NEW Opportunity mutation must land in OWNED, in DIRECTOR_GATE, or be
         * declared/none with a reason. Anything else fails here, which is the only way this lock
         * keeps meaning once the people who wrote it have moved on.
         */
        it("no unclassified Opportunity mutation exists", () => {
            const unclassified: string[] = [];
            const ownedRoutes = new Set(OWNED.map(([r]) => r));
            for (const [route, methods] of Object.entries(declared.routes)) {
                if (!/opportunit/i.test(route)) continue;
                for (const [m, i] of Object.entries(methods)) {
                    if (["GET", "HEAD", "OPTIONS"].includes(m)) continue;
                    if (i.status === "declared" || i.status === "none") continue;
                    if (ownedRoutes.has(route) || route in DIRECTOR_GATE) continue;
                    unclassified.push(`${route}:${m}`);
                }
            }
            expect(unclassified, "a new Opportunity mutation must be owned or explicitly gated").toEqual([]);
        });
    });

    it("the runtime table is still allowed — this was never a schema retirement", () => {
        const migrations = path.resolve(WEB, "..", "supabase", "migrations");
        const drops = fs
            .readdirSync(migrations)
            .filter((f) => f.endsWith(".sql"))
            .filter((f) => /drop\s+table\s+(if\s+exists\s+)?(public\.)?opportunities\b/i.test(fs.readFileSync(path.join(migrations, f), "utf8")));
        expect(drops, "Opportunity persistence is load-bearing runtime").toEqual([]);
    });
});
