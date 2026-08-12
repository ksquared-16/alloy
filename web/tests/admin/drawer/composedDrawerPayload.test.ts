import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import {
    composedDrawerPreparingCopy,
    evaluateComposedOpportunityDrawerPayload,
    evaluateComposedPersonDrawerPayload,
    requiredOpportunityDrawerPayloadSectionKeys,
    requiredPersonDrawerPayloadSectionKeys,
} from "@/lib/admin/drawer/composedDrawerPayload";
import { prefetchLinkedPersonsFromOpportunityRecord } from "@/lib/admin/drawer/prefetchLinkedPersonsFromOpportunityRecord";
import { openViewPersonFromOpportunity } from "@/lib/admin/drawer/openViewPersonFromOpportunity";

const webRoot = join(__dirname, "..", "..", "..");

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

const parentHouseholdRecord = {
    id: "parent-1",
    display_name: "Jordan Lee",
    is_employee: true,
    _household_context: [{ customer_id: "cust-1", customer_name: "Lee family" }],
    _household_adult_links: [
        { person_id: "parent-1", customer_id: "cust-1", display_name: "Jordan Lee", role_type: "parent" },
    ],
    _household_child_links: [
        { customer_member_id: "m-child", customer_id: "cust-1", person_id: "child-1", display_name: "Sam Lee" },
    ],
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
        { person_id: "parent-1", customer_id: "cust-1", display_name: "Jordan Lee", role_type: "parent" },
    ],
    _household_child_links: [
        { customer_member_id: "m-child", customer_id: "cust-1", person_id: "child-1", display_name: "Sam Lee" },
    ],
};

const opportunityRecord = {
    id: "opp-1",
    _record_surface: "full",
    _customer_name: "Lee family",
    next_follow_up_at: "2026-06-15T10:00:00Z",
    _inquiry_children: [{ person_id: "child-1", display_name: "Sam Lee", desired_program_label: "Toddler" }],
};

describe("composedDrawerPayload", () => {
    it("blocks parent frame reveal until composed parent payload is complete", () => {
        const incomplete = evaluateComposedPersonDrawerPayload({
            surface: "parent",
            drawerId: "parent-1",
            record: { id: "parent-1", display_name: "Jordan Lee" },
            bodyHydrated: true,
            operatingSections: ["parent_summary", "household", "household_address", "employee_status"],
            overviewSectionKeys: [],
        });
        expect(incomplete.ready).toBe(false);
        expect(incomplete.missing).toContain("parent_household");

        const complete = evaluateComposedPersonDrawerPayload({
            surface: "parent",
            drawerId: "parent-1",
            record: parentHouseholdRecord,
            bodyHydrated: true,
            operatingSections: ["parent_summary", "household", "household_address", "employee_status"],
            overviewSectionKeys: [],
        });
        expect(complete.ready).toBe(true);
    });

    it("blocks child frame reveal until composed child payload is complete", () => {
        const incomplete = evaluateComposedPersonDrawerPayload({
            surface: "child",
            drawerId: "child-1",
            record: { id: "child-1", _person_name: "Sam Lee", _drawer_presentation_emphasis: "child_lifecycle" },
            bodyHydrated: true,
            operatingSections: ["child_summary", "household"],
            overviewSectionKeys: [],
        });
        expect(incomplete.ready).toBe(false);

        const complete = evaluateComposedPersonDrawerPayload({
            surface: "child",
            drawerId: "child-1",
            record: childRecord,
            bodyHydrated: true,
            operatingSections: ["child_summary", "household"],
            overviewSectionKeys: [],
        });
        expect(complete.ready).toBe(true);
    });

    it("blocks opportunity reveal without action rail and inquiry children", () => {
        const noActions = evaluateComposedOpportunityDrawerPayload({
            drawerId: "opp-1",
            record: opportunityRecord,
            bodyHydrated: true,
            fullHydrateReady: true,
            headerActionsReady: false,
            inquiryChildrenSectionVisible: true,
        });
        expect(noActions.ready).toBe(false);
        expect(noActions.missing).toContain("header_actions");

        const ready = evaluateComposedOpportunityDrawerPayload({
            drawerId: "opp-1",
            record: opportunityRecord,
            bodyHydrated: true,
            fullHydrateReady: true,
            headerActionsReady: true,
            inquiryChildrenSectionVisible: true,
        });
        expect(ready.ready).toBe(true);
        expect(requiredOpportunityDrawerPayloadSectionKeys(true)).toContain("opportunity_inquiry_children");
    });

    it("employee status must be present before parent payload is ready", () => {
        const { is_employee: _removed, ...withoutEmployee } = parentHouseholdRecord;
        const evalWithoutEmployee = evaluateComposedPersonDrawerPayload({
            surface: "parent",
            drawerId: "parent-1",
            record: withoutEmployee,
            bodyHydrated: true,
            operatingSections: ["parent_summary", "household", "household_address", "employee_status"],
            overviewSectionKeys: [],
        });
        expect(evalWithoutEmployee.ready).toBe(false);
        expect(evalWithoutEmployee.missing).toContain("parent_employee_status");
    });

    it("derives required parent sections from configured operating modules", () => {
        expect(
            requiredPersonDrawerPayloadSectionKeys({
                surface: "parent",
                operatingSections: ["parent_summary", "household", "household_address", "employee_status"],
                overviewSectionKeys: [],
            })
        ).toEqual(
            expect.arrayContaining([
                "parent_summary",
                "parent_household",
                "parent_address",
                "parent_employee_status",
                "parent_bos_panel",
            ])
        );
    });

    it("uses premium preparing copy for opportunity, parent, and child", () => {
        expect(composedDrawerPreparingCopy("opportunity").description).toBe("Preparing lead…");
        expect(composedDrawerPreparingCopy("parent").description).toBe("Preparing parent profile…");
        expect(composedDrawerPreparingCopy("child").description).toBe("Preparing child profile…");
    });
});

describe("composedDrawerPayload known-empty doctrine", () => {
    it("child medical ready when full payload fetched but medical data absent", () => {
        const childNoMedical = {
            id: "child-1",
            _drawer_presentation_emphasis: "child_lifecycle",
            _person_name: "Sam Lee",
            first_name: "Sam",
            last_name: "Lee",
            _household_context: [{ customer_id: "cust-1", customer_name: "Lee family" }],
            _household_adult_links: [
                { person_id: "parent-1", customer_id: "cust-1", display_name: "Jordan Lee", role_type: "parent" },
            ],
            _household_child_links: [
                { customer_member_id: "m-child", customer_id: "cust-1", person_id: "child-1", display_name: "Sam Lee" },
            ],
            // no medical field — this is the known-empty case
        };
        const result = evaluateComposedPersonDrawerPayload({
            surface: "child",
            drawerId: "child-1",
            record: childNoMedical,
            bodyHydrated: true,
            operatingSections: ["child_summary", "household"],
            overviewSectionKeys: [],
        });
        expect(result.ready).toBe(true);
        expect(result.missing).not.toContain("child_medical");
    });

    it("child chrome ready when drawer hint provided even without DB presentation emphasis", () => {
        const childNoEmphasis = {
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
        const result = evaluateComposedPersonDrawerPayload({
            surface: "child",
            drawerId: "child-2",
            record: childNoEmphasis,
            bodyHydrated: true,
            operatingSections: ["child_summary", "household"],
            overviewSectionKeys: [],
            childChromeHint: { presentation_emphasis: "child_lifecycle" },
        });
        expect(result.ready).toBe(true);
        expect(result.missing).not.toContain("child_summary");
        expect(result.missing).not.toContain("child_header_chips");
        expect(result.missing).not.toContain("child_bos_panel");
    });

    it("child chrome blocks when no hint and no presentation emphasis in record", () => {
        const childNoHint = {
            id: "child-3",
            _person_name: "Unknown Child",
            first_name: "Unknown",
            last_name: "Child",
            _household_adult_links: [{ person_id: "p-1", customer_id: "cust-3", display_name: "Parent" }],
            _household_child_links: [],
        };
        const result = evaluateComposedPersonDrawerPayload({
            surface: "child",
            drawerId: "child-3",
            record: childNoHint,
            bodyHydrated: true,
            operatingSections: ["child_summary"],
            overviewSectionKeys: [],
            // no hint — chrome cannot be resolved
        });
        expect(result.ready).toBe(false);
        expect(result.missing.some((k) => ["child_summary", "child_header_chips", "child_bos_panel"].includes(k))).toBe(true);
    });

    it("parent household known-empty: ready when _household_adult_links present but empty", () => {
        const singleAdult = {
            id: "parent-solo",
            display_name: "Solo Parent",
            is_employee: false,
            _household_context: [],
            _household_adult_links: [],
            _household_child_links: [],
            _household_customer_addresses: [],
        };
        const result = evaluateComposedPersonDrawerPayload({
            surface: "parent",
            drawerId: "parent-solo",
            record: singleAdult,
            bodyHydrated: true,
            operatingSections: ["parent_summary", "household", "household_address", "employee_status"],
            overviewSectionKeys: [],
        });
        expect(result.ready).toBe(true);
        expect(result.missing).not.toContain("parent_household");
        expect(result.missing).not.toContain("parent_address");
    });

    it("parent address known-empty: ready when _household_customer_addresses present but empty", () => {
        const parentNoAddress = {
            ...parentHouseholdRecord,
            _household_customer_addresses: [],
        };
        const result = evaluateComposedPersonDrawerPayload({
            surface: "parent",
            drawerId: "parent-1",
            record: parentNoAddress,
            bodyHydrated: true,
            operatingSections: ["parent_summary", "household", "household_address", "employee_status"],
            overviewSectionKeys: [],
        });
        expect(result.ready).toBe(true);
        expect(result.missing).not.toContain("parent_address");
    });

    it("employee is_employee: false is ready (key present, value false)", () => {
        const parentFalseEmployee = {
            ...parentHouseholdRecord,
            is_employee: false,
        };
        const result = evaluateComposedPersonDrawerPayload({
            surface: "parent",
            drawerId: "parent-1",
            record: parentFalseEmployee,
            bodyHydrated: true,
            operatingSections: ["parent_summary", "household", "household_address", "employee_status"],
            overviewSectionKeys: [],
        });
        expect(result.ready).toBe(true);
        expect(result.missing).not.toContain("parent_employee_status");
    });

    it("opportunity BOS right panel blocks when primary is loaded but full record not yet arrived", () => {
        // bodyHydrated=true (primary arrived) but fullHydrateReady=false (full not yet)
        // BOS tasks/guidance only arrive with the full record — must not reveal yet.
        const oppPrimaryOnly = {
            id: "opp-2",
            _record_surface: "drawer_primary",
            _customer_name: "Empty family",
            next_follow_up_at: "2026-07-01T10:00:00Z",  // follow-up in primary, but BOS tasks aren't
        };
        const blocked = evaluateComposedOpportunityDrawerPayload({
            drawerId: "opp-2",
            record: oppPrimaryOnly,
            bodyHydrated: true,
            fullHydrateReady: false,
            headerActionsReady: true,
            inquiryChildrenSectionVisible: false,
        });
        expect(blocked.ready).toBe(false);
        expect(blocked.missing).toContain("opportunity_bos_right_column");
    });

    it("opportunity BOS right panel is ready when fullHydrateReady even with no follow-up date", () => {
        const oppNoFollowUp = {
            id: "opp-2",
            _record_surface: "full",
            _customer_name: "Empty family",
            _inquiry_children: [],
        };
        const result = evaluateComposedOpportunityDrawerPayload({
            drawerId: "opp-2",
            record: oppNoFollowUp,
            bodyHydrated: true,
            fullHydrateReady: true,
            headerActionsReady: true,
            inquiryChildrenSectionVisible: false,
        });
        expect(result.ready).toBe(true);
        expect(result.missing).not.toContain("opportunity_bos_right_column");
    });

    it("opportunity action rail blocks when headerActionsReady is false", () => {
        const result = evaluateComposedOpportunityDrawerPayload({
            drawerId: "opp-1",
            record: opportunityRecord,
            bodyHydrated: true,
            fullHydrateReady: true,
            headerActionsReady: false,
            inquiryChildrenSectionVisible: false,
        });
        expect(result.ready).toBe(false);
        expect(result.missing).toContain("header_actions");
    });

    it("opportunity action rail unblocks when headerActionsReady is true with empty actions", () => {
        const result = evaluateComposedOpportunityDrawerPayload({
            drawerId: "opp-1",
            record: opportunityRecord,
            bodyHydrated: true,
            fullHydrateReady: true,
            headerActionsReady: true,
            inquiryChildrenSectionVisible: false,
        });
        expect(result.ready).toBe(true);
        expect(result.missing).not.toContain("header_actions");
    });

    it("preparing state transitions to ready after known-empty payload completes", () => {
        // Before body hydration: no household key present → not ready
        const seed = { id: "parent-1", display_name: "Jordan Lee" };
        const notReady = evaluateComposedPersonDrawerPayload({
            surface: "parent",
            drawerId: "parent-1",
            record: seed,
            bodyHydrated: false,
            operatingSections: ["parent_summary", "household", "household_address"],
            overviewSectionKeys: [],
        });
        expect(notReady.ready).toBe(false);

        // After body hydration: all keys present even with empty arrays → ready
        const hydrated = {
            id: "parent-1",
            display_name: "Jordan Lee",
            is_employee: false,
            _household_adult_links: [],
            _household_child_links: [],
            _household_customer_addresses: [],
        };
        const ready = evaluateComposedPersonDrawerPayload({
            surface: "parent",
            drawerId: "parent-1",
            record: hydrated,
            bodyHydrated: true,
            operatingSections: ["parent_summary", "household", "household_address"],
            overviewSectionKeys: [],
        });
        expect(ready.ready).toBe(true);
    });
});

describe("composedDrawerPayload wiring", () => {

    it("restores opportunity header actions from cache module", () => {
        const cache = readSrc("lib/admin/drawer/opportunityDrawerHeaderActionsCache.ts");
        expect(cache).toContain("peekOpportunityDrawerHeaderActionsCache");
    });

    it("composed person payload cache prevents infinite refetch loops", () => {
        const cache = readSrc("lib/admin/composedPersonPayloadCache.ts");
        expect(cache).toContain("putComposedPersonPayloadReady");
        expect(cache).toContain("isComposedPersonPayloadRecentlyReady");
    });

    it("predictive prefetch is triggered from opportunity for linked persons", () => {
        const ids = prefetchLinkedPersonsFromOpportunityRecord(
            {
                id: "opp-1",
                primary_person_id: "parent-1",
                _inquiry_children: [{ person_id: "child-1", display_name: "Sam Lee" }],
            },
            { source: "opportunity_drawer_idle" }
        );
        expect(ids.length).toBeGreaterThan(0);
    });

    it("View Parent/Child open path uses person drawer prefetch cache", () => {
        const openPath = readSrc("lib/admin/drawer/openViewPersonFromOpportunity.ts");
        expect(openPath).toContain("prefetchPersonDrawerSnapshot");
        expect(openPath).toContain("cachePersonDrawerChildOpenSeed");
        expect(openPath).toContain("cachePersonDrawerParentOpenSeed");
        expect(typeof openViewPersonFromOpportunity).toBe("function");
    });

    it("opportunity header keeps BOS guidance in the same band as action buttons", () => {
        const controls = readSrc("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        expect(controls).toContain('data-opportunity-header-controls-row="composed"');
        expect(controls).toContain("DrawerHeaderAttentionBlock");
        expect(controls).toMatch(/flex w-full min-w-0 items-start gap-2\.5[\s\S]*data-opportunity-header-controls-row="attention"/);
    });
});
