import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

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

// The retired V1 service was the other half of this block. Search V2's own
// site-scope behaviour is certified in tests/search (including at realistic
// allow-list scale). The scope HELPER below is still live — it remains V2's
// fail-closed backstop — so it stays.
describe("site scope helper", () => {
    it("globalSearchRecordAllowedBySiteScope rejects inaccessible locations", () => {
        expect(globalSearchRecordAllowedBySiteScope(LOC_NORTH, northSiteDim)).toBe(true);
        expect(globalSearchRecordAllowedBySiteScope(southLoc, northSiteDim)).toBe(false);
        expect(globalSearchRecordAllowedBySiteScope(null, northSiteDim)).toBe(false);
    });
});

describe("global search implementation guards", () => {
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

});
