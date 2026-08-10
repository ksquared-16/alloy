import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { runGlobalRecordSearch } from "@/lib/admin/globalSearch/globalRecordSearchService";
import { buildGlobalSearchFamilyClusters } from "@/lib/admin/globalSearch/globalRecordSearchClustering";
import { applyGlobalSearchClusterDisplayLimits } from "@/lib/admin/globalSearch/globalRecordSearchClusterLimits";
import {
    expandGlobalSearchChildMemberRows,
} from "@/lib/admin/globalSearch/globalRecordSearchHouseholdChildren";
import {
    GLOBAL_SEARCH_LEGACY_DRAWER_ENTITY_TYPES,
    resolveGlobalSearchDrawerOpenTarget,
} from "@/lib/admin/globalSearch/globalRecordSearchDrawerTarget";
import { resolveGlobalSearchOpenFromHit } from "@/lib/admin/globalSearch/globalRecordSearchOpenResolution";
import {
    formatGlobalSearchClusterContextLine,
    formatGlobalSearchHitPrimaryName,
    formatGlobalSearchHitSecondaryLine,
    formatGlobalSearchHitMetaLine,
    globalSearchLeadPrimaryName,
    globalSearchPresentationLinesForHit,
} from "@/lib/admin/globalSearch/globalRecordSearchResultPresentation";
import { globalSearchAgeLabelFromDob } from "@/lib/admin/globalSearch/globalRecordSearchAgeLabel";
import { humanizeGlobalSearchStatusLabel } from "@/lib/admin/globalSearch/globalRecordSearchStatusLabel";
import { globalSearchRecordAllowedBySiteScope } from "@/lib/admin/globalSearch/globalRecordSearchScope";
import {
    globalSearchCrmDisplayLabel,
    globalSearchPersonTypeLabel,
    personRowIsChildRelationship,
} from "@/lib/admin/globalSearch/globalRecordSearchPersonPresentation";
import {
    adminV2PathHasDrawerHost,
    clearGlobalRecordSearchOpenIntent,
    GLOBAL_RECORD_SEARCH_OPEN_INTENT_KEY,
    GLOBAL_SEARCH_DROPDOWN_Z_INDEX,
    GLOBAL_SEARCH_DRAWER_OPEN_SOURCE,
    launchGlobalRecordSearchOpen,
    readGlobalRecordSearchOpenIntent,
} from "@/lib/adminV2/globalRecordSearchOpen";
import { ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS } from "@/lib/adminV2/drawerOutsideClick";
import { ADMINV2_SHELL_CHROME_Z } from "@/components/admin/Drawer";

const ORG = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_CHEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHILD_MEMBER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SOPHIA_PERSON = "99999999-9999-4999-8999-999999999999";
const PARENT_PERSON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OPP_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LOC_NORTH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const openDim = {
    departmentScope: "all" as const,
    allowedDepartmentIds: null,
    siteScope: "all" as const,
    allowedSiteLocationIds: null,
};

const northSiteDim = {
    departmentScope: "all" as const,
    allowedDepartmentIds: null,
    siteScope: "restricted" as const,
    allowedSiteLocationIds: [LOC_NORTH],
};

const southLoc = "ffffffff-ffff-4fff-8fff-ffffffffffff";

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: vi.fn(async () => []),
    displayLabelsFromDefinitions: vi.fn(() => ({})),
}));

vi.mock("@/lib/admin/accessScope", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/accessScope")>();
    return {
        ...actual,
        fetchScopedPersonIdsForRestrictedAdmin: vi.fn(async () => null),
        fetchScopedCustomerIdsForRestrictedAdmin: vi.fn(async () => null),
        resolveRecordScopeConstraints: vi.fn(async () => ({
            workUnitIds: null,
            locationIds: null,
            impossible: false,
        })),
        applyRecordScopeConstraintsToQuery: vi.fn((q: unknown) => q),
    };
});

type Row = Record<string, unknown>;

function patternToken(pattern: string): string {
    return pattern.replace(/^%/, "").replace(/%$/, "").toLowerCase();
}

function rowMatchesIlike(row: Row, col: string, pattern: string): boolean {
    return String(row[col] ?? "")
        .toLowerCase()
        .includes(patternToken(pattern));
}

function createMockSupabase(tables: Record<string, Row[]>) {
    const chain = (tableName: string): Record<string, unknown> => {
        let filters: Array<{ kind: string; col: string; val: unknown }> = [];
        let orExpr: string | null = null;
        let limitN = 50;

        const exec = (): { data: Row[]; error: null } => {
            let rows = [...(tables[tableName] ?? [])];
            for (const f of filters) {
                if (f.kind === "eq") rows = rows.filter((r) => r[f.col] === f.val);
                else if (f.kind === "ilike") rows = rows.filter((r) => rowMatchesIlike(r, f.col, String(f.val)));
                else if (f.kind === "in") {
                    const set = new Set(Array.isArray(f.val) ? f.val : []);
                    rows = rows.filter((r) => set.has(r[f.col]));
                }
            }
            if (orExpr && tableName === "opportunities") {
                const patterns = orExpr
                    .split(",")
                    .map((part) => {
                        const m = part.match(/\.ilike\.(.+)$/);
                        return m ? patternToken(m[1]) : "";
                    })
                    .filter(Boolean);
                rows = rows.filter((r) =>
                    patterns.some(
                        (tok) =>
                            String(r.name ?? "")
                                .toLowerCase()
                                .includes(tok) ||
                            String(r.title ?? "")
                                .toLowerCase()
                                .includes(tok)
                    )
                );
            }
            return { data: rows.slice(0, limitN), error: null };
        };

        const builder: Record<string, unknown> = {
            select: () => builder,
            eq: (col: string, val: unknown) => {
                filters.push({ kind: "eq", col, val });
                return builder;
            },
            ilike: (col: string, val: unknown) => {
                filters.push({ kind: "ilike", col, val });
                return builder;
            },
            in: (col: string, val: unknown) => {
                filters.push({ kind: "in", col, val });
                return builder;
            },
            or: (expr: string) => {
                orExpr = expr;
                return builder;
            },
            not: () => builder,
            order: () => builder,
            limit: (n: number) => {
                limitN = n;
                return builder;
            },
            maybeSingle: async () => {
                const { data } = exec();
                return { data: data[0] ?? null, error: null };
            },
            then: (resolve: (v: unknown) => void) => Promise.resolve(exec()).then(resolve),
        };
        return builder;
    };

    return {
        from: (table: string) => chain(table),
    } as unknown as SupabaseClient;
}

const CUSTOMER_MITCHELL = "88888888-8888-4888-8888-888888888888";
const MITCHELL_OPP = "77777777-7777-4777-8777-777777777777";
const MITCHELL_PARENT = "66666666-6666-4666-8666-666666666666";
const MITCHELL_CHILDREN = [
    "mitchell-child-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    "mitchell-child-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
    "mitchell-child-cccc-cccc-cccc-ccccccccccc3",
    "mitchell-child-dddd-dddd-dddd-ddddddddddd4",
] as const;

const mitchellFixtures = {
    customer_members: [
        {
            id: MITCHELL_CHILDREN[0],
            org_id: ORG,
            customer_id: CUSTOMER_MITCHELL,
            person_id: null,
            display_name: "Ava Mitchell",
            first_name: "Ava",
            last_name: "Mitchell",
            relationship: "child",
            status_key: "active",
            dob: "2022-03-15",
        },
        {
            id: MITCHELL_CHILDREN[1],
            org_id: ORG,
            customer_id: CUSTOMER_MITCHELL,
            person_id: null,
            display_name: "Ben Mitchell",
            first_name: "Ben",
            last_name: "Mitchell",
            relationship: "child",
            status_key: "active",
        },
        {
            id: MITCHELL_CHILDREN[2],
            org_id: ORG,
            customer_id: CUSTOMER_MITCHELL,
            person_id: null,
            display_name: "Cara Mitchell",
            first_name: "Cara",
            last_name: "Mitchell",
            relationship: "child",
            status_key: "active",
        },
        {
            id: MITCHELL_CHILDREN[3],
            org_id: ORG,
            customer_id: CUSTOMER_MITCHELL,
            person_id: null,
            display_name: "Drew Mitchell",
            first_name: "Drew",
            last_name: "Mitchell",
            relationship: "child",
            status_key: "active",
        },
    ],
    persons: [
        {
            id: MITCHELL_PARENT,
            org_id: ORG,
            first_name: "Pat",
            last_name: "Mitchell",
            full_name: "Pat Mitchell",
            status_key: "active",
        },
    ],
    customer_persons: [
        {
            org_id: ORG,
            person_id: MITCHELL_PARENT,
            customer_id: CUSTOMER_MITCHELL,
            role_type: "guardian",
            is_primary: true,
        },
    ],
    customers: [
        {
            id: CUSTOMER_MITCHELL,
            org_id: ORG,
            name: "Mitchell Household",
            status_key: "active",
        },
    ],
    opportunities: [
        {
            id: MITCHELL_OPP,
            org_id: ORG,
            customer_id: CUSTOMER_MITCHELL,
            location_id: southLoc,
            name: "Family Inquiry - Mitchell",
            title: "Family Inquiry - Mitchell",
            status_key: "tour_scheduled",
            created_at: "2026-02-01T00:00:00Z",
        },
    ],
    locations: [
        {
            id: southLoc,
            org_id: ORG,
            label: "South Campus",
            location_type: "site",
            is_active: true,
        },
    ],
    opportunity_persons: [],
};

const chenFixtures = {
    customer_members: [
        {
            id: CHILD_MEMBER,
            org_id: ORG,
            customer_id: CUSTOMER_CHEN,
            person_id: SOPHIA_PERSON,
            display_name: "Sophia Chen",
            first_name: "Sophia",
            last_name: "Chen",
            relationship: "child",
            status_key: "active",
        },
    ],
    persons: [
        {
            id: SOPHIA_PERSON,
            org_id: ORG,
            first_name: "Sophia",
            last_name: "Chen",
            full_name: "Sophia Chen",
            status_key: "active",
        },
        {
            id: PARENT_PERSON,
            org_id: ORG,
            first_name: "Sarah",
            last_name: "Chen",
            full_name: "Sarah Chen",
            status_key: "active",
        },
    ],
    customer_persons: [
        {
            org_id: ORG,
            person_id: PARENT_PERSON,
            customer_id: CUSTOMER_CHEN,
            role_type: "guardian",
            is_primary: true,
        },
    ],
    customers: [
        {
            id: CUSTOMER_CHEN,
            org_id: ORG,
            name: "Chen Household",
            status_key: "active",
        },
    ],
    opportunities: [
        {
            id: OPP_ID,
            org_id: ORG,
            customer_id: CUSTOMER_CHEN,
            location_id: LOC_NORTH,
            name: "Family Inquiry - Chen",
            title: "Family Inquiry - Chen",
            status_key: "tour_scheduled",
            created_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "opp-south",
            org_id: ORG,
            customer_id: "cust-other",
            location_id: southLoc,
            name: "Other Inquiry",
            title: "Other Inquiry",
            status_key: "new_inquiry",
            created_at: "2026-01-02T00:00:00Z",
        },
    ],
    locations: [
        {
            id: LOC_NORTH,
            org_id: ORG,
            label: "North Campus",
            location_type: "site",
            is_active: true,
        },
        {
            id: southLoc,
            org_id: ORG,
            label: "South Campus",
            location_type: "site",
            is_active: true,
        },
    ],
    opportunity_persons: [],
};

describe("runGlobalRecordSearch — Chen family", () => {
    it("returns child with household, lead, and campus context", async () => {
        const supabase = createMockSupabase(chenFixtures);
        const { groups, results, clusters } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: openDim,
            rawQ: "Chen",
        });

        const child = results.find((r) => r.group === "children");
        expect(child).toMatchObject({
            entity_type: "customer_members",
            entity_id: CHILD_MEMBER,
            name: "Sophia Chen",
            type_label: "Child",
            household_name: "Chen Household",
            location_label: "North Campus",
            person_id: SOPHIA_PERSON,
            open_entity_type: "persons",
            open_entity_id: SOPHIA_PERSON,
        });
        expect(child?.lead_short_label).toBe("Chen");
        expect(clusters.length).toBeGreaterThan(0);
        expect(groups.some((g) => g.key === "children")).toBe(true);
    });

    it("returns parent/guardian with related household and location", async () => {
        const supabase = createMockSupabase(chenFixtures);
        const { results } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: openDim,
            rawQ: "Chen",
        });

        const parent = results.find((r) => r.group === "parents" && r.entity_id === PARENT_PERSON);
        expect(parent).toMatchObject({
            entity_type: "persons",
            name: "Sarah Chen",
            type_label: "Guardian",
            household_name: "Chen Household",
            location_label: "North Campus",
            open_entity_type: "persons",
            open_entity_id: PARENT_PERSON,
        });
    });

    it("returns children, parents, and leads groups for Chen — no standalone household rows", async () => {
        const supabase = createMockSupabase(chenFixtures);
        const { groups, results } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: openDim,
            rawQ: "Chen",
        });

        expect(groups.map((g) => g.key)).toEqual(
            expect.arrayContaining(["children", "parents", "leads"])
        );
        expect(groups.map((g) => g.key as string)).not.toContain("households");
        expect(results.some((r) => r.type_label === "Household")).toBe(false);
        expect(results.some((r) => r.household_name === "Chen Household")).toBe(true);
    });

    it("clusters Chen family hits with shared household context", async () => {
        const supabase = createMockSupabase(chenFixtures);
        const { results, clusters } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: openDim,
            rawQ: "Chen",
        });

        const familyCluster = clusters.find((c) => c.key !== "__ungrouped__");
        expect(familyCluster).toBeDefined();
        expect(familyCluster?.household_name).toBe("Chen Household");
        expect(familyCluster?.location_label).toBe("North Campus");
        expect(familyCluster?.children.some((c) => c.name === "Sophia Chen")).toBe(true);

        const contextLine = formatGlobalSearchClusterContextLine(familyCluster!);
        expect(contextLine).toContain("Chen Household");
        expect(contextLine).toContain("Lead: Chen");
        expect(contextLine).toContain("North Campus");
        expect(contextLine!.split("North Campus")).toHaveLength(2);

        const child = results.find((r) => r.group === "children")!;
        const secondary = formatGlobalSearchHitSecondaryLine(child, { inCluster: true });
        expect(secondary).toBe("Child");
        const secondaryFull = formatGlobalSearchHitSecondaryLine(child);
        expect(secondaryFull).toContain("Chen Household");
        expect(secondaryFull).toContain("North Campus");

        const meta = formatGlobalSearchHitMetaLine(child);
        expect(meta).not.toContain("Family lead");
        expect(meta).toMatch(/Active|Future Start/);
    });

    it("child search status label uses linked person status_key, not customer_members roster status", async () => {
        const fixtures = {
            ...chenFixtures,
            customer_members: [
                {
                    ...chenFixtures.customer_members[0]!,
                    status_key: "legacy_roster_only",
                },
            ],
            persons: [
                {
                    ...chenFixtures.persons[0]!,
                    status_key: "future_start",
                },
                chenFixtures.persons[1]!,
            ],
        };
        const supabase = createMockSupabase(fixtures);
        const { results } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: openDim,
            rawQ: "Sophia",
        });
        const child = results.find((r) => r.group === "children" && r.entity_id === CHILD_MEMBER);
        expect(child?.status_label).toBe("Future Start");
    });
});

describe("runGlobalRecordSearch — site scope", () => {
    it("restricted location user only receives records for allowed campuses", async () => {
        const supabase = createMockSupabase(chenFixtures);
        const { results } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: northSiteDim,
            rawQ: "Chen",
        });

        expect(results.length).toBeGreaterThan(0);
        for (const hit of results) {
            if (hit.group === "locations") {
                expect(hit.entity_id).toBe(LOC_NORTH);
            } else {
                expect(hit.location_label).toBe("North Campus");
            }
        }
        expect(results.some((r) => r.name === "Other Inquiry")).toBe(false);
    });

    it("globalSearchRecordAllowedBySiteScope rejects inaccessible locations", () => {
        expect(globalSearchRecordAllowedBySiteScope(LOC_NORTH, northSiteDim)).toBe(true);
        expect(globalSearchRecordAllowedBySiteScope(southLoc, northSiteDim)).toBe(false);
        expect(globalSearchRecordAllowedBySiteScope(null, northSiteDim)).toBe(false);
    });
});

describe("global search implementation guards", () => {
    it("service source does not expose standalone household search group", () => {
        const servicePath = resolve(process.cwd(), "lib/admin/globalSearch/globalRecordSearchService.ts");
        const src = readFileSync(servicePath, "utf8");
        expect(src).not.toContain("searchHouseholds");
        expect(src).not.toMatch(/group:\s*"households"/);
    });

    it("does not reference customer_members.site_id in service source", () => {
        const servicePath = resolve(process.cwd(), "lib/admin/globalSearch/globalRecordSearchService.ts");
        const locationPath = resolve(process.cwd(), "lib/admin/globalSearch/globalRecordSearchLocationContext.ts");
        const serviceSrc = readFileSync(servicePath, "utf8");
        const locationSrc = readFileSync(locationPath, "utf8");
        expect(serviceSrc).not.toMatch(/customer_members[\s\S]{0,400}\bsite_id\b/);
        expect(locationSrc).not.toContain("customer_members");
    });

    it("does not fetch customer_members status definitions in global search", () => {
        const servicePath = resolve(process.cwd(), "lib/admin/globalSearch/globalRecordSearchService.ts");
        const serviceSrc = readFileSync(servicePath, "utf8");
        expect(serviceSrc).not.toMatch(/fetchEffectiveStatusDefinitions\([^)]*["']customer_members["']/);
    });

    it("TopNavBar uses inline GlobalSearchBox without modal", () => {
        const topNavPath = resolve(process.cwd(), "app/adminV2/components/TopNavBar.tsx");
        const src = readFileSync(topNavPath, "utf8");
        expect(src).toContain("GlobalSearchBox");
        expect(src).not.toContain("GlobalSearchModal");
    });

    it("GlobalSearchBox is inline autocomplete, not a modal", () => {
        const boxPath = resolve(process.cwd(), "app/adminV2/components/GlobalSearchBox.tsx");
        const src = readFileSync(boxPath, "utf8");
        expect(src).toContain('data-adminv2-global-search-box="true"');
        expect(src).not.toContain("aria-modal");
        expect(src).not.toContain("fixed inset-0");
    });

    it("GlobalSearchBox never opens drawer via legacy entity_type", () => {
        const boxPath = resolve(process.cwd(), "app/adminV2/components/GlobalSearchBox.tsx");
        const src = readFileSync(boxPath, "utf8");
        // Search V2 resolves destinations server-side, so the control validates the
        // already-resolved entity type against the AdminV2 allow-list instead of
        // re-resolving a hit. The invariant is unchanged: legacy member/contact
        // drawers are never an open target.
        expect(src).toContain("isGlobalSearchAdminV2DrawerEntityType");
        for (const legacy of GLOBAL_SEARCH_LEGACY_DRAWER_ENTITY_TYPES) {
            expect(src).not.toContain(`entity_type: "${legacy}"`);
        }
    });

    it("GlobalRecordSearchOpenListener blocks legacy drawer types", () => {
        const listenerPath = resolve(process.cwd(), "components/adminV2/GlobalRecordSearchOpenListener.tsx");
        const src = readFileSync(listenerPath, "utf8");
        expect(src).toContain("isGlobalSearchLegacyDrawerEntityType");
        expect(src).toContain("open_entity_type");
    });

    it("drawer outside-click ignore list includes global search box", () => {
        expect(ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS).toContain(
            '[data-adminv2-global-search-box="true"]'
        );
    });

    it("GlobalSearchBox dropdown z-index stays above drawer panel within shell chrome", () => {
        expect(GLOBAL_SEARCH_DROPDOWN_Z_INDEX).toBeGreaterThan(70);
        expect(GLOBAL_SEARCH_DROPDOWN_Z_INDEX).toBeGreaterThanOrEqual(ADMINV2_SHELL_CHROME_Z);
        const boxPath = resolve(process.cwd(), "app/adminV2/components/GlobalSearchBox.tsx");
        const src = readFileSync(boxPath, "utf8");
        expect(src).toContain("GLOBAL_SEARCH_DROPDOWN_Z_INDEX");
    });

    it("GlobalSearchBox uses restrained neutral styling without blue accent rows", () => {
        const boxPath = resolve(process.cwd(), "app/adminV2/components/GlobalSearchBox.tsx");
        const src = readFileSync(boxPath, "utf8");
        expect(src).not.toContain("text-alloy-blue");
        expect(src).not.toContain("border-l-alloy-blue");
        expect(src).not.toContain("bg-alloy-blue");
    });

    /**
     * Search V2 replaced household CLUSTERS with subject-centred rows: one row per
     * canonical subject, carrying its own recognition context and destinations.
     * The V1 cluster DOM guard is obsolete by design — this asserts the product
     * property that replaced it.
     */
    it("GlobalSearchBox renders subject rows with recognition context and inline destinations", () => {
        const boxPath = resolve(process.cwd(), "app/adminV2/components/GlobalSearchBox.tsx");
        const src = readFileSync(boxPath, "utf8");
        expect(src).toContain("recognitionLine");
        expect(src).toContain('data-search-subject-button="true"');
        expect(src).toContain("data-search-destination");
        expect(src).toContain("splitInlineDestinations");
        // No intermediate search-detail page — the subject button opens the
        // canonical surface directly, never a search-owned route.
        expect(src).not.toMatch(/router\.push\(\s*["'`]\/search/);
        // Destinations carry resolved hrefs; the control builds no URLs itself.
        expect(src).toContain("destination.href");
    });

    it("AdminDrawerContext swaps drawer in place for global search source", () => {
        const ctxPath = resolve(process.cwd(), "contexts/AdminDrawerContext.tsx");
        const src = readFileSync(ctxPath, "utf8");
        expect(src).toContain("GLOBAL_SEARCH_DRAWER_OPEN_SOURCE");
        expect(src).toMatch(/swapInPlace[\s\S]*global search replaces the open record/i);
        expect(GLOBAL_SEARCH_DRAWER_OPEN_SOURCE).toBe("global_search");
    });
});

describe("drawer open targets", () => {
    beforeEach(() => {
        const store = new Map<string, string>();
        vi.stubGlobal("sessionStorage", {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => store.set(k, v),
            removeItem: (k: string) => store.delete(k),
        });
        vi.stubGlobal("window", {
            sessionStorage: globalThis.sessionStorage,
            location: { pathname: "/adminV2/workspace" },
            dispatchEvent: vi.fn(),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("child with canonical person opens persons drawer, not customer_members", async () => {
        const supabase = createMockSupabase(chenFixtures);
        const { results } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: openDim,
            rawQ: "Sophia",
        });

        const child = results.find((r) => r.group === "children");
        expect(child?.entity_type).toBe("customer_members");
        const target = resolveGlobalSearchDrawerOpenTarget(child!);
        expect(target).toEqual({ entity_type: "persons", entity_id: SOPHIA_PERSON });

        const resolution = resolveGlobalSearchOpenFromHit(child!);
        expect(resolution.supported).toBe(true);
        launchGlobalRecordSearchOpen(resolution.detail!);
        const event = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as CustomEvent;
        expect(event.detail.open_entity_type).toBe("persons");
        expect(event.detail.open_entity_id).toBe(SOPHIA_PERSON);
        expect(event.detail.open_entity_type).not.toBe("customer_members");
    });

    it("resolveGlobalSearchDrawerOpenTarget never returns legacy drawer types", async () => {
        const supabase = createMockSupabase(chenFixtures);
        const { results } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: openDim,
            rawQ: "Chen",
        });

        for (const hit of results) {
            const target = resolveGlobalSearchDrawerOpenTarget(hit);
            if (target) {
                expect(GLOBAL_SEARCH_LEGACY_DRAWER_ENTITY_TYPES).not.toContain(target.entity_type);
            }
        }
    });

    it("launchGlobalRecordSearchOpen dispatches AdminV2 open detail while on drawer host", () => {
        launchGlobalRecordSearchOpen({
            open_entity_type: "persons",
            open_entity_id: PARENT_PERSON,
        });
        expect(window.dispatchEvent).toHaveBeenCalled();
        const event = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CustomEvent;
        expect(event.detail.open_entity_type).toBe("persons");
        expect(event.detail.open_entity_id).toBe(PARENT_PERSON);
    });

    it("stores persons drawer intent for non-host routes", () => {
        vi.stubGlobal("window", {
            sessionStorage: globalThis.sessionStorage,
            location: { pathname: "/adminV2/workflows" },
            dispatchEvent: vi.fn(),
        });
        sessionStorage.removeItem(GLOBAL_RECORD_SEARCH_OPEN_INTENT_KEY);
        const nav = launchGlobalRecordSearchOpen({
            open_entity_type: "persons",
            open_entity_id: PARENT_PERSON,
        });
        expect(nav).toBe("/workspace");
        expect(readGlobalRecordSearchOpenIntent()?.open_entity_type).toBe("persons");
        clearGlobalRecordSearchOpenIntent();
    });
});

describe("presentation helpers", () => {
    it("formatGlobalSearchHitSecondaryLine follows typography hierarchy", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-05-29T12:00:00Z"));

        const childLine = formatGlobalSearchHitSecondaryLine({
            entity_type: "customer_members",
            entity_id: CHILD_MEMBER,
            group: "children",
            name: "Sophia Chen",
            type_label: "Child",
            household_name: "Chen Household",
            opportunity_name: "Family Inquiry - Chen",
            lead_short_label: "Chen",
            status_label: "Tour Scheduled",
            location_label: "North Campus",
            age_label: "4y 2mo",
        });
        expect(childLine).toBe("Child · 4y 2mo · Chen Household · North Campus");

        const childInCluster = formatGlobalSearchHitSecondaryLine(
            {
                entity_type: "customer_members",
                entity_id: CHILD_MEMBER,
                group: "children",
                name: "Ethan Mitchell",
                type_label: "Child",
                household_name: "Mitchell Household",
                opportunity_name: "Family Inquiry - Mitchell",
                lead_short_label: "Mitchell",
                status_label: "Lost",
                location_label: "South Campus",
                age_label: "4y 2mo",
            },
            { inCluster: true }
        );
        expect(childInCluster).toBe("Child · 4y 2mo");

        const leadLine = formatGlobalSearchHitSecondaryLine({
            entity_type: "opportunities",
            entity_id: OPP_ID,
            group: "leads",
            name: "Mitchell",
            type_label: "Lead",
            household_name: "Mitchell Household",
            opportunity_name: "Family Inquiry - Mitchell",
            lead_short_label: "Mitchell",
            status_label: "Lost",
            location_label: "South Campus",
        });
        expect(leadLine).toBe("Lead · South Campus");

        expect(
            formatGlobalSearchHitPrimaryName({
                entity_type: "opportunities",
                entity_id: OPP_ID,
                group: "leads",
                name: "Mitchell",
                type_label: "Lead",
                household_name: "Mitchell Household",
                opportunity_name: "Family Inquiry - Mitchell",
                lead_short_label: "Mitchell",
                status_label: "Lost",
                location_label: "South Campus",
            })
        ).toBe("Mitchell");

        vi.useRealTimers();
    });

    it("child row includes age when DOB is available and omits when unavailable", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-05-29T12:00:00Z"));
        expect(globalSearchAgeLabelFromDob("2022-03-15")).toBe("4y 2mo");
        expect(globalSearchAgeLabelFromDob(null)).toBeNull();

        const withAge = formatGlobalSearchHitSecondaryLine({
            entity_type: "customer_members",
            entity_id: "x",
            group: "children",
            name: "Ethan Mitchell",
            type_label: "Child",
            household_name: null,
            opportunity_name: null,
            lead_short_label: null,
            status_label: null,
            location_label: "South Campus",
            age_label: globalSearchAgeLabelFromDob("2022-03-15"),
        });
        expect(withAge).toContain("4y 2mo");

        const withoutAge = formatGlobalSearchHitSecondaryLine({
            entity_type: "customer_members",
            entity_id: "y",
            group: "children",
            name: "No Dob Child",
            type_label: "Child",
            household_name: null,
            opportunity_name: null,
            lead_short_label: null,
            status_label: null,
            location_label: "South Campus",
            age_label: null,
        });
        expect(withoutAge).toBe("Child · South Campus");
        vi.useRealTimers();
    });

    it("presentation never surfaces Family inquiry boilerplate", () => {
        const hit: import("@/lib/admin/globalSearch/globalRecordSearchTypes").GlobalRecordSearchHit = {
            entity_type: "opportunities",
            entity_id: OPP_ID,
            group: "leads",
            name: "Mitchell",
            type_label: "Lead",
            household_name: "Mitchell Household",
            opportunity_name: "Family Inquiry - Mitchell",
            lead_short_label: "Mitchell",
            status_label: "Lost",
            location_label: "South Campus",
        };
        const lines = [
            ...globalSearchPresentationLinesForHit(hit),
            formatGlobalSearchClusterContextLine({
                household_name: hit.household_name,
                lead_short_label: hit.lead_short_label,
                location_label: hit.location_label,
            }) ?? "",
        ];
        for (const line of lines) {
            expect(line.toLowerCase()).not.toContain("family inquiry");
        }
        expect(globalSearchLeadPrimaryName(hit)).toBe("Mitchell");
    });

    it("formatGlobalSearchHitMetaLine includes secondary and status without Family lead", () => {
        const line = formatGlobalSearchHitMetaLine({
            entity_type: "customer_members",
            entity_id: CHILD_MEMBER,
            group: "children",
            name: "Sophia Chen",
            type_label: "Child",
            household_name: "Chen Household",
            opportunity_name: "Family Inquiry - Chen",
            lead_short_label: "Chen",
            status_label: "Tour Scheduled",
            location_label: "North Campus",
        });
        expect(line).toContain("Child");
        expect(line).toContain("Chen Household");
        expect(line).toContain("North Campus");
        expect(line).toContain("Tour Scheduled");
        expect(line).not.toContain("Family lead");
    });

    it("buildGlobalSearchStatusPill is the only colored pill surface", () => {
        const pillsPath = resolve(process.cwd(), "app/adminV2/components/GlobalSearchResultPills.tsx");
        const src = readFileSync(pillsPath, "utf8");
        expect(src).toContain("Status-only pill");
        expect(src).not.toContain("alloy-blue");
    });

    it("globalSearchCrmDisplayLabel maps inquiry to Lead in legacy helper only", () => {
        expect(globalSearchCrmDisplayLabel("Inquiry")).toBe("Lead");
    });

    it("humanizeGlobalSearchStatusLabel title-cases raw keys", () => {
        expect(humanizeGlobalSearchStatusLabel("tour_completed", {})).toBe("Tour Completed");
        expect(humanizeGlobalSearchStatusLabel("new_inquiry", {})).toBe("New Inquiry");
        expect(humanizeGlobalSearchStatusLabel("tour_scheduled", {})).toBe("Tour Scheduled");
    });

    it("personRowIsChildRelationship recognizes child keys", () => {
        expect(personRowIsChildRelationship("child")).toBe(true);
    });

    it("globalSearchPersonTypeLabel labels guardians", () => {
        expect(
            globalSearchPersonTypeLabel({
                person_id: PARENT_PERSON,
                customer_persons: [{ role_type: "guardian" }],
            })
        ).toBe("Guardian");
    });

    it("adminV2PathHasDrawerHost matches workspace routes", () => {
        expect(adminV2PathHasDrawerHost("/adminV2/workspace/dept/x")).toBe(true);
        expect(adminV2PathHasDrawerHost("/adminV2/workflows")).toBe(false);
    });

    it("buildGlobalSearchFamilyClusters groups by customer and opportunity without household rows", () => {
        const hits = buildGlobalSearchFamilyClusters([
            {
                entity_type: "opportunities",
                entity_id: OPP_ID,
                group: "leads",
                name: "Family Inquiry - Chen",
                type_label: "Lead",
                household_name: "Chen Household",
                opportunity_name: "Family Inquiry - Chen",
                lead_short_label: "Chen",
                status_label: "Tour Scheduled",
                location_label: "North Campus",
                customer_id: CUSTOMER_CHEN,
                opportunity_id: OPP_ID,
                cluster_key: `${CUSTOMER_CHEN}:${OPP_ID}`,
            },
            {
                entity_type: "customer_members",
                entity_id: CHILD_MEMBER,
                group: "children",
                name: "Sophia Chen",
                type_label: "Child",
                household_name: "Chen Household",
                opportunity_name: "Family Inquiry - Chen",
                lead_short_label: "Chen",
                status_label: "Tour Scheduled",
                location_label: "North Campus",
                customer_id: CUSTOMER_CHEN,
                opportunity_id: OPP_ID,
                cluster_key: `${CUSTOMER_CHEN}:${OPP_ID}`,
            },
        ]);
        expect(hits).toHaveLength(1);
        expect(hits[0]?.children).toHaveLength(1);
        expect(hits[0]?.anchors).toHaveLength(1);
        expect(hits[0]?.anchors[0]?.group).toBe("leads");
        expect(hits[0]?.household_name).toBe("Chen Household");
    });
});

describe("runGlobalRecordSearch — Mitchell household completeness", () => {
    it("returns all four Mitchell children when searching last name", async () => {
        const supabase = createMockSupabase(mitchellFixtures);
        const { results, clusters } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: openDim,
            rawQ: "mitchell",
        });

        const childHits = results.filter((r) => r.group === "children");
        expect(childHits).toHaveLength(4);
        expect(childHits.map((h) => h.name).sort()).toEqual([
            "Ava Mitchell",
            "Ben Mitchell",
            "Cara Mitchell",
            "Drew Mitchell",
        ]);

        const ava = childHits.find((h) => h.name === "Ava Mitchell");
        expect(ava?.age_label).toBeTruthy();

        const lead = results.find((r) => r.group === "leads");
        expect(lead?.name).toBe("Mitchell");
        expect(lead?.name.toLowerCase()).not.toContain("family inquiry");

        const mitchellCluster = clusters.find((c) => c.household_name === "Mitchell Household");
        expect(mitchellCluster?.children).toHaveLength(4);
        expect(mitchellCluster?.children_overflow ?? 0).toBe(0);
    });

    it("expands household siblings when only household name matches", async () => {
        const fixtures = {
            ...mitchellFixtures,
            customer_members: mitchellFixtures.customer_members.map((m, i) => ({
                ...m,
                display_name: i === 0 ? "Ava Mitchell" : `Child ${i + 1}`,
                first_name: i === 0 ? "Ava" : `Kid${i + 1}`,
                last_name: i === 0 ? "Mitchell" : "Other",
            })),
        };
        const supabase = createMockSupabase(fixtures);
        const { results } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: openDim,
            rawQ: "mitchell",
        });

        expect(results.filter((r) => r.group === "children")).toHaveLength(4);
    });

    it("includes children without person_id", async () => {
        const supabase = createMockSupabase(mitchellFixtures);
        const { results } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: openDim,
            rawQ: "mitchell",
        });

        for (const child of results.filter((r) => r.group === "children")) {
            expect(child.person_id).toBeNull();
            expect(child.open_entity_type).toBe("opportunities");
            expect(child.status_label).toBeNull();
        }
    });

    it("site-restricted user keeps Mitchell records at allowed campus only", async () => {
        const supabase = createMockSupabase(mitchellFixtures);
        const { results } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: {
                departmentScope: "all" as const,
                allowedDepartmentIds: null,
                siteScope: "restricted" as const,
                allowedSiteLocationIds: [southLoc],
            },
            rawQ: "mitchell",
        });

        expect(results.filter((r) => r.group === "children")).toHaveLength(4);
        for (const hit of results) {
            if (hit.group !== "locations") {
                expect(hit.location_label).toBe("South Campus");
            }
        }
    });

    it("site-restricted user excludes Mitchell when campus is not allowed", async () => {
        const supabase = createMockSupabase(mitchellFixtures);
        const { results } = await runGlobalRecordSearch({
            supabase,
            orgId: ORG,
            accessDim: northSiteDim,
            rawQ: "mitchell",
        });

        expect(results.filter((r) => r.group === "children")).toHaveLength(0);
    });
});

describe("global search household expansion helpers", () => {
    it("expandGlobalSearchChildMemberRows includes all siblings for matched household", async () => {
        const supabase = createMockSupabase(mitchellFixtures);
        const direct = mitchellFixtures.customer_members.slice(0, 1);
        const expanded = await expandGlobalSearchChildMemberRows({
            supabase,
            orgId: ORG,
            token: "mitchell",
            directMatches: direct,
        });
        expect(expanded).toHaveLength(4);
    });

    it("clustering does not drop valid children from the same household", () => {
        const hits = Array.from({ length: 4 }).map((_, i) => ({
            entity_type: "customer_members" as const,
            entity_id: MITCHELL_CHILDREN[i],
            group: "children" as const,
            name: `Child ${i + 1}`,
            type_label: "Child",
            household_name: "Mitchell Household",
            opportunity_name: "Family Inquiry - Mitchell",
            lead_short_label: "Mitchell",
            status_label: "Active",
            location_label: "South Campus",
            customer_id: CUSTOMER_MITCHELL,
            opportunity_id: MITCHELL_OPP,
            cluster_key: `${CUSTOMER_MITCHELL}:${MITCHELL_OPP}`,
        }));
        const clusters = buildGlobalSearchFamilyClusters(hits);
        expect(clusters).toHaveLength(1);
        expect(clusters[0]?.children).toHaveLength(4);
    });

    it("applyGlobalSearchClusterDisplayLimits surfaces children_overflow", () => {
        const hits = Array.from({ length: 14 }).map((_, i) => ({
            entity_type: "customer_members" as const,
            entity_id: `child-${i}`,
            group: "children" as const,
            name: `Child ${i}`,
            type_label: "Child",
            household_name: "Mitchell Household",
            opportunity_name: null,
            lead_short_label: null,
            status_label: null,
            location_label: "South Campus",
            customer_id: CUSTOMER_MITCHELL,
            opportunity_id: MITCHELL_OPP,
            cluster_key: `${CUSTOMER_MITCHELL}:${MITCHELL_OPP}`,
        }));
        const [cluster] = applyGlobalSearchClusterDisplayLimits(buildGlobalSearchFamilyClusters(hits));
        expect(cluster?.children.length).toBe(12);
        expect(cluster?.children_overflow).toBe(2);
    });
});
