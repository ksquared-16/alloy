/**
 * Slice 12 — Operational Rules is reachable again.
 *
 * FORENSICS, because this reverses a pinned assertion and must not do so blindly.
 * Commit 2c6f0f261 ("feat(settings): make locations workspace object-centric")
 * rewrote the Locations workspace from a SECTION-first IA to an OBJECT-centric
 * one and, in the same commit, flipped the Batch 0 assertion from "Locations page
 * adds an Operational Rules section + panel" to "no longer exposes Operational
 * Rules as a SECTION-FIRST destination".
 *
 * That wording is the evidence: what was retired was the section-first
 * destination, not the capability. The sibling assertion in that same file — that
 * the panel exposes capacity, ratio, operating windows and schedule rules — was
 * left untouched and still passes. The IA migration simply never re-homed this
 * concern, and no superseding surface was ever built: a repository-wide search
 * finds `capacity_kind` in exactly two places, the API route and that panel.
 *
 * So the capability existed with no operator path to it at all. These lock the
 * path back, through the canonical registry rather than a special case.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    LOCATION_WORKSPACE_TABS,
    locationWorkspaceHref,
} from "@/lib/locations/locationWorkspaceModel";
import {
    LOCATION_CONCERN_REGISTRY,
    getLocationConcernDefinition,
    isLocationConcernKey,
    resolveActiveLocationConcern,
} from "@/lib/locations/locationConcernContract";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

const CONCERN = "operational-rules";

// ---------------------------------------------------------------------------
// 1-2 — reachable, and actually mounted.
// ---------------------------------------------------------------------------
describe("1-2. Operational Rules is a first-class Locations concern", () => {
    it("1. appears in the canonical tab registry with an operator label", () => {
        const tab = LOCATION_WORKSPACE_TABS.find((t) => t.key === CONCERN);
        expect(tab).toBeDefined();
        expect(tab!.label).toBe("Operational Rules");
    });

    it("1. is a registered concern, not a page-local special case", () => {
        expect(isLocationConcernKey(CONCERN)).toBe(true);
        const def = LOCATION_CONCERN_REGISTRY.find((c) => c.key === CONCERN);
        expect(def).toBeDefined();
        expect(getLocationConcernDefinition(CONCERN).key).toBe(CONCERN);
    });

    it("1. a ?tab= route resolves to it rather than normalising to overview", () => {
        expect(resolveActiveLocationConcern(CONCERN)).toEqual({ concern: CONCERN, normalized: false });
    });

    it("2. the page MOUNTS the canonical panel — listing a tab is not reaching it", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        // Strip imports first. Asserting the bare symbol passes on a file that
        // still imports the panel and no longer renders it — which is exactly the
        // state this slice exists to end, and exactly what a planted unmount
        // proved this assertion would otherwise miss.
        const body = page.replace(/^import[\s\S]*?;$/gm, "");
        expect(body).toMatch(/<LocationOperationalRulesPanel\b/);
        expect(body).toMatch(/activeTab === "operational-rules"/);
        // The tab must come from the registry, not a hand-maintained list.
        expect(page).toContain("LOCATION_WORKSPACE_TABS");
    });

    it("2. the concern declares how it loads, like every other concern", () => {
        const def = getLocationConcernDefinition(CONCERN);
        expect(def.dataStrategy).toBe("concern-cache");
        expect(def.supportsItemId).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 3-8, 19-20 — canonical APIs, no second editor, no direct writes.
// ---------------------------------------------------------------------------
describe("3-8, 19-20. the panel uses the canonical authoring authority", () => {
    const panel = () => read("components/adminV2/settings/locations/LocationOperationalRulesPanel.tsx");
    const authoring = () => read("components/adminV2/settings/locations/useLocationRuleAuthoring.ts");
    const reader = () => read("components/adminV2/settings/locations/useLocationOperationalRules.ts");

    it("3. reads canonical rules through the canonical read route", () => {
        expect(reader()).toContain("/api/admin/operational-config-rules");
        expect(reader()).toContain("capacityRules");
    });

    it("4-6. writes to the canonical capacity route, which accepts all three kinds", () => {
        // The hook composes `${BASE}/capacity-rules`, so assert the composition
        // rather than a literal that never appears in the source.
        const a = authoring();
        expect(a).toContain('const BASE = "/api/admin/operational-config"');
        expect(a).toMatch(/capacity:\s*`\$\{BASE\}\/capacity-rules`/);
        const route = read("app/api/admin/operational-config/capacity-rules/route.ts");
        expect(route).toContain("capacity_kind");
        expect(route).toContain("createCapacityRule");
        // The kind vocabulary is the schema's, enforced server-side.
        const service = read("lib/childcareOperational/config/configRuleAuthoringService.ts");
        expect(service).toContain("requireCapacityKind");
    });

    it("7. the effective date reaches the canonical writer", () => {
        expect(panel()).toContain("effective_start");
        expect(read("app/api/admin/operational-config/capacity-rules/route.ts")).toContain("effectiveStart");
    });

    it("the full rule lifecycle is available, not just create", () => {
        const a = authoring();
        for (const action of ["create", "version", "retire", "void"]) {
            expect(a).toContain(`action: "${action}"`);
        }
    });

    it("19. introduces no direct database mutation", () => {
        for (const src of [panel(), authoring(), reader()]) {
            expect(src).not.toMatch(/createAdminClient|supabase\.from\(/);
            expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
        }
    });

    it("20. no second capacity editor was introduced", () => {
        // Exactly one component in the repository authors capacity_kind.
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const roomDetail = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        for (const src of [page, roomDetail]) {
            expect(src).not.toContain("capacity_kind");
            expect(src).not.toContain("operational-config/capacity-rules");
        }
    });
});

// ---------------------------------------------------------------------------
// 16-18 — the other rule families are live, not dead controls.
// ---------------------------------------------------------------------------
describe("16-18. every section the panel exposes has a live route", () => {
    for (const [section, route] of [
        ["Capacity Rules", "capacity-rules"],
        ["Ratio Rules", "ratio-rules"],
        ["Operating Windows", "operating-windows"],
        ["Schedule Rules", "schedule-rules"],
    ] as const) {
        it(`${section} is backed by a live authoring route`, () => {
            expect(read("components/adminV2/settings/locations/LocationOperationalRulesPanel.tsx")).toContain(section);
            const src = read(`app/api/admin/operational-config/${route}/route.ts`);
            expect(src).toContain("export async function POST");
            for (const action of ["create", "version", "retire", "void"]) {
                expect(src).toContain(`action === "${action}"`);
            }
        });
    }
});

// ---------------------------------------------------------------------------
// 9-11 — site scope follows the workspace you are standing in.
// ---------------------------------------------------------------------------
describe("9-11. site scope", () => {
    it("9. the panel is given the SELECTED site, not the org-wide list", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const mount = page.slice(page.indexOf('activeTab === "operational-rules"'));
        const block = mount.slice(0, mount.indexOf("</LocationOperationalRulesPanel>") + 1 || 1200);
        expect(block).toContain("selectedSite.id");
        // An org-wide map here would reintroduce the cross-site confusion the
        // object-centric IA exists to remove.
        expect(block).not.toContain("siteLabelById={siteLabelById}");
    });

    it("11. the mount cannot leak another site's label into the preview", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const mount = page.slice(page.indexOf('activeTab === "operational-rules"'), page.indexOf('activeTab === "tours"'));
        expect(mount).toMatch(/new Map\(\[\[selectedSite\.id/);
    });

    it("10. authoring scope remains an explicit named choice, server-validated", () => {
        const service = read("lib/childcareOperational/config/configRuleAuthoringService.ts");
        expect(service).toContain("buildScopeColumns");
        const migration = read("../supabase/migrations/20260628120000_childcare_config_rules_phase1.sql");
        // The scope shape constraint makes an ambiguous scope impossible at rest.
        expect(migration).toContain("childcare_capacity_rules_scope_shape");
    });
});

// ---------------------------------------------------------------------------
// 12 — authorization is the API's job, not the navigation's.
// ---------------------------------------------------------------------------
describe("12. hiding the concern was never the security boundary", () => {
    for (const route of ["capacity-rules", "ratio-rules", "operating-windows", "schedule-rules"]) {
        it(`${route} gates on the server regardless of navigation`, () => {
            const src = read(`app/api/admin/operational-config/${route}/route.ts`);
            expect(src).toContain("requireAdminOrOps");
            expect(src).toContain("getAdminContextCached");
            // Org scoping comes from the context, never from the request body.
            expect(src).toContain("ctx.orgId");
            expect(src).not.toMatch(/orgId:\s*String\(body\./);
        });
    }

    it("restoring navigation granted no new permission", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const mount = page.slice(page.indexOf('activeTab === "operational-rules"'), page.indexOf('activeTab === "tours"'));
        // The panel receives the workspace's existing mutate capability.
        expect(mount).toContain("canMutate={canMutate}");
        expect(mount).not.toMatch(/canMutate=\{true\}/);
    });
});

// ---------------------------------------------------------------------------
// 13-15 — the deep-link contract Slice 11 will need.
// ---------------------------------------------------------------------------
describe("13-15. deep link", () => {
    it("13. the canonical href helper addresses the concern", () => {
        expect(locationWorkspaceHref("site-1", CONCERN)).toContain("tab=operational-rules");
    });

    it("14. and carries the site, so context survives the jump", () => {
        const href = locationWorkspaceHref("site-1", CONCERN);
        expect(href).toContain("locationId=site-1");
    });

    it("15. a round trip returns the same concern", () => {
        const href = locationWorkspaceHref("site-1", CONCERN);
        const tab = new URLSearchParams(href.split("?")[1]).get("tab");
        expect(resolveActiveLocationConcern(tab).concern).toBe(CONCERN);
    });

    it("no bespoke event or one-off channel was invented for it", () => {
        const model = read("lib/locations/locationWorkspaceModel.ts");
        expect(model).toContain("locationWorkspaceHref");
        expect(model).not.toMatch(/dispatchEvent\(new CustomEvent\("open-operational/);
    });
});

// ---------------------------------------------------------------------------
// 21-24 — nothing else moved.
// ---------------------------------------------------------------------------
describe("21-24. the prerequisite changed nothing else", () => {
    it("21. the Slice 10 adoption foundation is untouched", () => {
        const src = read("lib/locations/capacityAdoptionState.ts");
        expect(src).toContain("export function resolveRoomCapacityStanding");
        expect(src).toContain("export function summarizeSiteCapacityCoverage");
        expect(src).not.toContain("operational-rules");
    });

    it("22. the Slice 11 resolved-capacity endpoint is untouched", () => {
        const src = read("app/api/admin/operational-config/resolved-capacity/route.ts");
        expect(src).toContain("resolveOperationalCapacity(");
        expect(src).not.toMatch(/Math\.min|Math\.max/);
    });

    it("23. topology is untouched", () => {
        expect(read("lib/location/topologyMutationAuthority.ts")).toContain("assertTopologyMutationSafe");
        expect(read("lib/locations/topologyPresentation.ts")).toContain("presentRoomTopology");
    });

    it("24. the prerequisite itself introduced no capacity product change", () => {
        // SUPERSEDED by the Slice 11 resumption, deliberately. This pinned the
        // prerequisite as capacity-neutral, which it was; the Site surface has
        // since moved from a seat sum to coverage, so pinning "Capacity summary"
        // would now pin the defect. What this still owns is that the RESTORED
        // CONCERN did not smuggle capacity product behaviour into itself.
        const panel = read("components/adminV2/settings/locations/LocationOperationalRulesPanel.tsx");
        expect(panel).not.toContain("capacityAdoptionState");
        expect(panel).not.toContain("buildLegacyCapacityAdoptionBody");
        expect(panel).not.toContain("Confirm capacity");
    });
});
