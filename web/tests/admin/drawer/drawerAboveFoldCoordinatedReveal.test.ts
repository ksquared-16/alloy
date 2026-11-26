import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import {
    childDrawerAboveFoldCoordinatedReady,
    opportunityInquiryChildrenCoordinatedReady,
    parentDrawerAboveFoldCoordinatedReady,
} from "@/lib/admin/drawer/drawerAboveFoldCoordinatedReveal";
import {
    personDrawerCoordinatedBodyReady,
    personDrawerSectionShowsCoordinatedReserve,
} from "@/lib/admin/drawer/drawerFirstPaintReadiness";
import {
    filterOpportunityOverviewSectionsForFirstPaint,
    OPPORTUNITY_ENRICHMENT_DEFERRED_OVERVIEW_SECTION_KEYS,
} from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { composeAdminV2DrawerRuntime } from "@/lib/adminV2/runtime/contract/drawerComposerPolicy";
import { opportunityDrawerComposedRevealReady } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { peekOpportunityDrawerHeaderActionsCache } from "@/lib/admin/drawer/opportunityDrawerHeaderActionsCache";

const webRoot = join(__dirname, "..", "..", "..");

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

const parentRecord = {
    id: "parent-1",
    display_name: "Jordan Lee",
    is_employee: true,
    _household_customer_addresses: [
        {
            customer_id: "cust-1",
            location_id: "loc-1",
            address_line1: "123 Main",
            city: "Austin",
            state: "TX",
            postal_code: "78701",
        },
    ],
    _household_context: [{ customer_id: "cust-1", customer_name: "Lee family" }],
    _household_adult_links: [
        {
            person_id: "parent-1",
            customer_id: "cust-1",
            display_name: "Jordan Lee",
            role_type: "parent",
        },
    ],
    _household_child_links: [
        {
            customer_member_id: "m-child",
            customer_id: "cust-1",
            person_id: "child-1",
            display_name: "Sam Lee",
        },
    ],
};

const childRecord = {
    id: "child-1",
    _drawer_presentation_emphasis: "child_lifecycle",
    _person_name: "Sam Lee",
    first_name: "Sam",
    last_name: "Lee",
    medical: { allergies: "Peanuts" },
    _household_context: [{ customer_id: "cust-1", customer_name: "Lee family" }],
    _household_adult_links: [
        {
            person_id: "parent-1",
            customer_id: "cust-1",
            display_name: "Jordan Lee",
            role_type: "parent",
        },
    ],
    _household_child_links: [
        {
            customer_member_id: "m-child",
            customer_id: "cust-1",
            person_id: "child-1",
            display_name: "Sam Lee",
        },
    ],
};

const opportunityRecord = {
    id: "opp-1",
    _record_surface: "full",
    _customer_name: "Lee family",
    _inquiry_children: [
        {
            person_id: "child-1",
            display_name: "Sam Lee",
            desired_program_label: "Toddler",
        },
    ],
};

describe("drawerAboveFoldCoordinatedReveal policy", () => {
    it("1. opportunity inquiry children default expanded in first-paint section filter", () => {
        expect(OPPORTUNITY_ENRICHMENT_DEFERRED_OVERVIEW_SECTION_KEYS.has("inquiry_children")).toBe(false);
        const sections = filterOpportunityOverviewSectionsForFirstPaint(
            [
                { key: "lead_summary", title: "Lead", fields: [] },
                { key: "inquiry_children", title: "Children", fields: [] },
                { key: "inquiry_tuition", title: "Tuition", fields: [] },
            ],
            true,
            false,
            false
        );
        const children = sections.find((s) => s.key === "inquiry_children");
        expect(children?.defaultExpanded).toBe(true);
    });

    it("2. opportunity header actions cache module exports peek/put restore API", () => {
        const cache = readSrc("lib/admin/drawer/opportunityDrawerHeaderActionsCache.ts");
        expect(cache).toContain("peekOpportunityDrawerHeaderActionsCache");
        expect(cache).toContain("putOpportunityDrawerHeaderActionsCache");
        expect(cache).toContain("resolvedSig");
    });

    it("4. parent drawer blocks reveal when household data missing from hydrated record", () => {
        const plan = composeAdminV2DrawerRuntime({
            entityType: "persons",
            surface: "parent",
            drawerId: "parent-1",
            activeTab: "overview",
            record: { id: "parent-1", display_name: "Jordan Lee", is_employee: true },
            error: null,
            typedSnapshot: false,
            bodyHydrated: true,
            fullHydrateReady: true,
            frameReady: true,
            headerActionsResolved: true,
            headerActionsLoading: false,
            headerActionsExpectRegistry: false,
            inquiryWorkflow: false,
            belowFoldRevealed: true,
            presentationReady: true,
            primaryContractReady: true,
            needsBackgroundHydrate: false,
        });
        expect(plan.canRevealDrawerFrame).toBe(false);
        expect(plan.sectionsBlocking).toContain("parent_household");
        expect(
            parentDrawerAboveFoldCoordinatedReady({
                record: { id: "parent-1", display_name: "Jordan Lee", is_employee: true },
                drawerId: "parent-1",
                bodyHydrated: true,
                requireHousehold: true,
                requireAddress: true,
                requireEmployeeStatus: true,
            })
        ).toBe(false);
    });

    it("5. parent drawer blocks reveal when address fields missing on first paint", () => {
        const plan = composeAdminV2DrawerRuntime({
            entityType: "persons",
            surface: "parent",
            drawerId: "parent-1",
            activeTab: "overview",
            record: {
                id: "parent-1",
                display_name: "Jordan Lee",
                is_employee: true,
                _household_context: parentRecord._household_context,
                _household_adult_links: parentRecord._household_adult_links,
                _household_child_links: parentRecord._household_child_links,
            },
            error: null,
            typedSnapshot: false,
            bodyHydrated: true,
            fullHydrateReady: true,
            frameReady: true,
            headerActionsResolved: true,
            headerActionsLoading: false,
            headerActionsExpectRegistry: false,
            inquiryWorkflow: false,
            belowFoldRevealed: true,
            presentationReady: true,
            primaryContractReady: true,
            needsBackgroundHydrate: false,
        });
        expect(plan.canRevealDrawerFrame).toBe(false);
        expect(plan.sectionsBlocking).toContain("parent_address");
    });

    it("7. child drawer blocks reveal when household info missing", () => {
        const plan = composeAdminV2DrawerRuntime({
            entityType: "persons",
            surface: "child",
            drawerId: "child-1",
            activeTab: "overview",
            record: { id: "child-1", _person_name: "Sam Lee", medical: { allergies: "Peanuts" } },
            error: null,
            typedSnapshot: false,
            bodyHydrated: true,
            fullHydrateReady: true,
            frameReady: true,
            headerActionsResolved: true,
            headerActionsLoading: false,
            headerActionsExpectRegistry: false,
            inquiryWorkflow: false,
            belowFoldRevealed: true,
            presentationReady: true,
            primaryContractReady: true,
            needsBackgroundHydrate: false,
        });
        expect(plan.canRevealDrawerFrame).toBe(false);
        expect(plan.sectionsBlocking).toContain("child_household");
    });

    it("8. child medical known-empty: does not block when body hydrated (no medical data present)", () => {
        // Core doctrine: the persons API has no medical column.
        // After a full fetch, absence of medical data is the final known-empty answer — the drawer should reveal.
        const recordNoMedical = {
            id: "child-1",
            _person_name: "Sam Lee",
            first_name: "Sam",
            last_name: "Lee",
            _drawer_presentation_emphasis: "child_lifecycle",
            _household_context: childRecord._household_context,
            _household_adult_links: childRecord._household_adult_links,
            _household_child_links: childRecord._household_child_links,
        };
        const plan = composeAdminV2DrawerRuntime({
            entityType: "persons",
            surface: "child",
            drawerId: "child-1",
            activeTab: "overview",
            record: recordNoMedical,
            error: null,
            typedSnapshot: false,
            bodyHydrated: true,
            fullHydrateReady: true,
            frameReady: true,
            headerActionsResolved: true,
            headerActionsLoading: false,
            headerActionsExpectRegistry: false,
            inquiryWorkflow: false,
            belowFoldRevealed: true,
            presentationReady: true,
            primaryContractReady: true,
            needsBackgroundHydrate: false,
        });
        expect(plan.canRevealDrawerFrame).toBe(true);
        expect(plan.sectionsBlocking).not.toContain("child_medical");
        expect(
            childDrawerAboveFoldCoordinatedReady({
                record: recordNoMedical,
                drawerId: "child-1",
                bodyHydrated: true,
                requireHousehold: true,
                requireMedical: true,
            })
        ).toBe(true);
    });

    it("10. parent household known-empty: ready when _household_adult_links present but empty", () => {
        const singleAdultRecord = {
            id: "parent-1",
            display_name: "Jordan Lee",
            is_employee: false,
            _household_context: [],
            _household_adult_links: [],
            _household_child_links: [],
            _household_customer_addresses: [],
        };
        const plan = composeAdminV2DrawerRuntime({
            entityType: "persons",
            surface: "parent",
            drawerId: "parent-1",
            activeTab: "overview",
            record: singleAdultRecord,
            error: null,
            typedSnapshot: false,
            bodyHydrated: true,
            fullHydrateReady: true,
            frameReady: true,
            headerActionsResolved: true,
            headerActionsLoading: false,
            headerActionsExpectRegistry: false,
            inquiryWorkflow: false,
            belowFoldRevealed: true,
            presentationReady: true,
            primaryContractReady: true,
            needsBackgroundHydrate: false,
        });
        expect(plan.canRevealDrawerFrame).toBe(true);
        expect(plan.sectionsBlocking).not.toContain("parent_household");
        expect(plan.sectionsBlocking).not.toContain("parent_address");
        expect(
            parentDrawerAboveFoldCoordinatedReady({
                record: singleAdultRecord,
                drawerId: "parent-1",
                bodyHydrated: true,
                requireHousehold: true,
                requireAddress: true,
                requireEmployeeStatus: true,
            })
        ).toBe(true);
    });

    it("11. parent address known-empty: ready when _household_customer_addresses present but empty", () => {
        const recordEmptyAddress = {
            ...parentRecord,
            _household_customer_addresses: [],
        };
        const plan = composeAdminV2DrawerRuntime({
            entityType: "persons",
            surface: "parent",
            drawerId: "parent-1",
            activeTab: "overview",
            record: recordEmptyAddress,
            error: null,
            typedSnapshot: false,
            bodyHydrated: true,
            fullHydrateReady: true,
            frameReady: true,
            headerActionsResolved: true,
            headerActionsLoading: false,
            headerActionsExpectRegistry: false,
            inquiryWorkflow: false,
            belowFoldRevealed: true,
            presentationReady: true,
            primaryContractReady: true,
            needsBackgroundHydrate: false,
        });
        expect(plan.canRevealDrawerFrame).toBe(true);
        expect(plan.sectionsBlocking).not.toContain("parent_address");
    });

    it("12. child chrome ready via drawer hint when record has no presentation emphasis", () => {
        // A child opened via open_source hint without _drawer_presentation_emphasis in the record.
        // The hint alone should make the chrome active and allow the drawer to reveal.
        const childRecordNoEmphasis = {
            id: "child-2",
            _person_name: "Alex Kim",
            first_name: "Alex",
            last_name: "Kim",
            _household_context: [{ customer_id: "cust-2", customer_name: "Kim family" }],
            _household_adult_links: [
                { person_id: "parent-2", customer_id: "cust-2", display_name: "Kim Parent", role_type: "parent" },
            ],
            _household_child_links: [
                { customer_member_id: "m-2", customer_id: "cust-2", person_id: "child-2", display_name: "Alex Kim" },
            ],
        };
        const childHint = { presentation_emphasis: "child_lifecycle" as const };
        expect(
            childDrawerAboveFoldCoordinatedReady({
                record: childRecordNoEmphasis,
                drawerId: "child-2",
                bodyHydrated: true,
                requireHousehold: true,
                requireMedical: true,
                childChromeHint: childHint,
            })
        ).toBe(true);
    });

    it("13. child household known-empty: ready when _household_adult_links present but empty", () => {
        const childNoHousehold = {
            id: "child-3",
            _person_name: "Orphan Child",
            first_name: "Orphan",
            last_name: "Child",
            _drawer_presentation_emphasis: "child_lifecycle",
            _household_context: [],
            _household_adult_links: [],
            _household_child_links: [],
        };
        expect(
            childDrawerAboveFoldCoordinatedReady({
                record: childNoHousehold,
                drawerId: "child-3",
                bodyHydrated: true,
                requireHousehold: true,
                requireMedical: true,
            })
        ).toBe(true);
    });

    it("opportunity composed open requires hydrated inquiry children", () => {
        expect(
            opportunityInquiryChildrenCoordinatedReady(
                { _inquiry_children: [{ person_id: "c1", program_category_id: "cat-toddler" }] },
                true
            )
        ).toBe(false);
        expect(opportunityInquiryChildrenCoordinatedReady(opportunityRecord, true)).toBe(true);
        expect(
            opportunityDrawerComposedRevealReady({
                opportunityId: "opp-1",
                bootstrap: { entity: { id: "opp-1" } } as never,
                primaryEntity: opportunityRecord,
                fullEntity: null,
                headerActions: emptyResolvedActionsBySlot(),
                enrichmentHeldUntilInteraction: false,
            })
        ).toBe(true);
    });

    it("first-paint section filter keeps inquiry children expanded", () => {
        const sections = filterOpportunityOverviewSectionsForFirstPaint(
            [
                { key: "inquiry_children", title: "Children", fields: [] },
                { key: "inquiry_tuition", title: "Tuition", fields: [] },
            ] as never,
            true,
            false,
            false
        );
        expect(sections.find((s) => s.key === "inquiry_children")?.defaultExpanded).toBe(true);
        expect(sections.find((s) => s.key === "inquiry_tuition")?.defaultExpanded).toBe(false);
    });
});

describe("drawerAboveFoldCoordinatedReveal wiring", () => {
    it("header actions cache export is available for restore tests", () => {
        expect(typeof peekOpportunityDrawerHeaderActionsCache).toBe("function");
    });
});
