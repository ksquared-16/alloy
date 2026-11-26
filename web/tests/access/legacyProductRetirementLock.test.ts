/**
 * RL-26 — A RETIRED PRODUCT STAYS RETIRED, AND ITS RUNTIME STAYS RUNNING.
 *
 * CRM Pipeline is not a current Alloy product. Operators say Lead, Inquiry, Enrollment, Stage,
 * Business Process. But the pipeline PRODUCT surface was still in the tree: four API route files
 * carrying eight handlers, and a 387-line editor at `legacy-admin/settings/SettingsClient.tsx`.
 *
 * The editor had NO RENDERER — `legacy-admin/settings/page.tsx` is itself a redirect — so the six
 * pipeline mutations sat in the Access backlog waiting for a capability, on behalf of a screen no
 * operator could open. They were retired rather than converged. A capability was never the answer;
 * the product was.
 *
 * ── THIS LOCK HOLDS TWO THINGS, AND THE SECOND IS THE ONE THAT WILL BE FORGOTTEN ──
 *
 * 1. The retired PRODUCT surface does not come back — not as routes, not as an editor, not as a
 *    declared capability, and not as a new key in the catalog.
 *
 * 2. The retained PERSISTENCE does not get deleted by someone reading "legacy pipeline retired" and
 *    concluding the tables are dead. They are not. `pipelines` and `pipeline_stages` are read by
 *    current runtime on the Lead drawer, the opportunity queue, booking stage resolution and the
 *    inbox. Retiring the product surface while the tables stay is the whole point of the slice, and
 *    a lock that only asserted the first half would license exactly the wrong follow-up.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT FORBID ──
 *
 * The word `opportunities` in persistence, API paths and column names. Opportunity is
 * LEGACY_PRODUCT_OVER_LIVE_RUNTIME: the table is the case-level record for a household inquiry and
 * is load-bearing. Only the operator-facing PRODUCT is retired. Forbidding the spelling would force
 * a schema rename this programme has explicitly deferred.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const API = path.join(WEB, "app", "api", "admin");
const INVENTORY = JSON.parse(
    fs.readFileSync(path.join(WEB, "scripts", "routeCapabilities.declared.json"), "utf8"),
) as { routes: Record<string, Record<string, { status: string; capability?: string }>> };

const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

/** The API surface that was retired. Each path is a directory that must not reappear. */
const RETIRED_ROUTE_DIRS = ["pipelines", "pipeline-stages"];
/** The editor that nothing rendered. */
const RETIRED_EDITOR = path.join(WEB, "app", "legacy-admin", "settings", "SettingsClient.tsx");
/** Capability keys that must never be created for a product Alloy does not have. */
const FORBIDDEN_KEYS = [
    "pipelines.manage",
    "pipeline.manage",
    "pipeline_stages.manage",
    "crm.pipeline.manage",
    "crm.pipelines.write",
];
/**
 * Runtime modules that READ the retained tables. If one of these stops reading them the tables may
 * genuinely be dead — but that is a measurement to redo, not an assumption to inherit, so this list
 * failing is a prompt to re-census rather than to delete.
 */
const RUNTIME_READERS = [
    "lib/admin/opportunityEntityRecord.ts",
    "lib/admin/drawer/resolveOpportunityStatusLabelsBatch.ts",
    "lib/book-v2/resolvePipelineStage.ts",
    "lib/rrs/queue/resolveOpportunityQueue.ts",
    "lib/rrs/queue/growthOpportunityQueueScope.ts",
    "lib/communications/inboxThreadsService.ts",
];

describe("RL-26 — the CRM Pipeline product surface stays retired", () => {
    it.each(RETIRED_ROUTE_DIRS)("/api/admin/%s does not exist", (dir) => {
        expect(
            fs.existsSync(path.join(API, dir)),
            `${dir} was retired because its only caller had no renderer; re-adding it needs a product decision, not a route`,
        ).toBe(false);
    });

    it("the orphaned pipeline editor does not come back", () => {
        expect(fs.existsSync(RETIRED_EDITOR)).toBe(false);
    });

    it("the route inventory no longer carries the retired handlers", () => {
        const offenders = Object.keys(INVENTORY.routes).filter((r) => /\/pipelines?(-stages)?\//.test(r));
        expect(offenders, `retired routes must not linger in the inventory: ${offenders.join(", ")}`).toEqual([]);
    });

    it("no route declares a Pipeline-shaped capability", () => {
        const offenders: string[] = [];
        for (const [route, methods] of Object.entries(INVENTORY.routes)) {
            for (const [m, i] of Object.entries(methods)) {
                if (i?.capability && FORBIDDEN_KEYS.includes(i.capability)) offenders.push(`${route}:${m}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("no Pipeline capability key is invented anywhere in source or migrations", () => {
        const offenders: string[] = [];
        const walk = (dir: string, exts: string[]) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) walk(abs, exts);
                else if (exts.some((x) => e.name.endsWith(x))) {
                    const src = e.name.endsWith(".sql") ? fs.readFileSync(abs, "utf8") : codeOnly(fs.readFileSync(abs, "utf8"));
                    for (const k of FORBIDDEN_KEYS) {
                        if (src.includes(`'${k}'`) || src.includes(`"${k}"`)) offenders.push(`${path.relative(WEB, abs)} -> ${k}`);
                    }
                }
            }
        };
        walk(path.join(WEB, "app"), [".ts", ".tsx"]);
        walk(path.join(WEB, "lib"), [".ts", ".tsx"]);
        walk(path.join(WEB, "..", "supabase", "migrations"), [".sql"]);
        expect(
            offenders,
            `Alloy has no Pipeline product; a capability for one would be a control over nothing: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});

describe("RL-26 — the retained pipeline PERSISTENCE is not collateral", () => {
    it("current runtime still reads the tables, so they are not dead", () => {
        const missing: string[] = [];
        const notReading: string[] = [];
        for (const rel of RUNTIME_READERS) {
            const abs = path.join(WEB, rel);
            if (!fs.existsSync(abs)) {
                missing.push(rel);
                continue;
            }
            const src = codeOnly(fs.readFileSync(abs, "utf8"));
            if (!/from\("(pipelines|pipeline_stages)"\)/.test(src)) notReading.push(rel);
        }
        expect(missing, `these runtime readers vanished: ${missing.join(", ")}`).toEqual([]);
        expect(
            notReading,
            "these no longer read the pipeline tables — RE-CENSUS before concluding the tables are dead, "
                + `do not delete them on the strength of this slice: ${notReading.join(", ")}`,
        ).toEqual([]);
    });

    it("no migration drops the retained tables", () => {
        const dir = path.join(WEB, "..", "supabase", "migrations");
        const offenders: string[] = [];
        for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith(".sql")) continue;
            const src = fs.readFileSync(path.join(dir, f), "utf8");
            if (/drop\s+table\s+(if\s+exists\s+)?(public\.)?(pipelines|pipeline_stages)\b/i.test(src)) {
                offenders.push(f);
            }
        }
        expect(
            offenders,
            `the product retired; the persistence did not: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});

describe("RL-26 — Opportunity persistence keeps its spelling", () => {
    it("the opportunities table and its API path are still present", () => {
        // Retiring the Opportunity PRODUCT must not be read as licence to rename the record that
        // every Lead in the system is stored in.
        expect(fs.existsSync(path.join(API, "opportunities"))).toBe(true);
        expect(INVENTORY.routes["app/api/admin/opportunities/[id]/route.ts"]?.PATCH?.capability)
            .toBe("enrollment.record.manage");
    });

    it("the four inert legacy Opportunity keys are still catalogued as unenforced, not activated", () => {
        const reg = JSON.parse(
            fs.readFileSync(path.join(WEB, "lib", "admin", "unenforcedPermissionKeys.json"), "utf8"),
        ) as { keys: string[] };
        for (const k of [
            "crm.opportunities.read",
            "crm.opportunities.write",
            "ops.opportunities.read",
            "ops.opportunities.write",
        ]) {
            expect(reg.keys, `${k} must stay inert — retirement from the catalog is OD-3, not this slice`).toContain(k);
        }
    });
});
