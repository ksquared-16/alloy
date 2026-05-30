import { describe, expect, it } from "vitest";
import { buildPersonDrawerQuickLinks } from "@/components/admin/entity/PersonDrawerContextPanel";
import { buildPersonEnrollmentActivityEntries } from "@/components/admin/entity/PersonDrawerEnrollmentActivity";
import {
    personDrawerChildDisplayName,
    personDrawerCrmDisplayLabel,
    resolvePersonDrawerChildIdentitySummary,
    resolvePersonDrawerPrimaryGuardian,
} from "@/lib/admin/person/personDrawerChildIdentity";
import {
    CHILD_LIFECYCLE_PREMIUM_SECTION_KEYS,
    CHILD_LIFECYCLE_ROADMAP_UX,
    childLifecycleSectionSurface,
    personDrawerShowsChildContextPanel,
    personDrawerShowsChildLifecycleSurface,
    resolveChildLifecycleSlotStates,
    sortOverviewSectionsForChildLifecycle,
} from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";

const childProfile: PersonDrawerProfileResult = {
    profiles: ["child"],
    display: "child",
    badgeLabels: ["Child"],
};

const parentProfile: PersonDrawerProfileResult = {
    profiles: ["parent"],
    display: "parent",
    badgeLabels: ["Parent"],
};

const childRecord = {
    id: "child-1",
    first_name: "Mia",
    last_name: "Chen",
    date_of_birth: "2021-03-15",
    _compatibility_members: [{ id: "cm-1", customer_id: "cust-1", relationship: "child" }],
    _household_context: [{ customer_id: "cust-1", customer_name: "Chen Family" }],
    _household_adult_links: [
        {
            person_id: "parent-1",
            display_name: "Sarah Chen",
            role_type: "parent",
            role_label: "Parent",
            customer_id: "cust-1",
            is_primary: true,
        },
        {
            person_id: "parent-2",
            display_name: "Michael Chen",
            role_type: "parent",
            role_label: "Parent",
            customer_id: "cust-1",
            is_primary: false,
        },
    ],
    _sibling_links: [
        {
            customer_member_id: "cm-2",
            person_id: "child-2",
            display_name: "Emma Chen",
            customer_id: "cust-1",
        },
    ],
    _enrollment_mirror: [
        {
            id: "ocm-1",
            opportunity_id: "opp-1",
            opportunity_name: "Fall enrollment",
            opportunity_status_key: "inquiry",
            opportunity_status_label: "Inquiry",
            customer_member_id: "cm-1",
            child_display_name: "Mia",
            location_label: "Main campus",
            program_label: "Preschool",
            room_label: null,
            outcome_status_key: null,
            outcome_status_label: null,
        },
    ],
    _enrollment_opportunities: [],
};

describe("personDrawerShowsChildLifecycleSurface", () => {
    it("is true for child emphasis only", () => {
        expect(personDrawerShowsChildLifecycleSurface(childProfile)).toBe(true);
        expect(personDrawerShowsChildLifecycleSurface(parentProfile)).toBe(false);
    });
});

describe("child summary identity", () => {
    it("prioritizes child name, age, household, and primary guardian without enrollment duplication", () => {
        expect(personDrawerChildDisplayName(childRecord)).toBe("Mia Chen");
        const summary = resolvePersonDrawerChildIdentitySummary(childRecord, "Chen Family");
        expect(summary.display_name).toBe("Mia Chen");
        expect(summary.age_label).toBeTruthy();
        expect(summary.household_label).toBe("Chen Family");
        expect(summary.primary_guardian?.display_name).toBe("Sarah Chen");
        expect(summary).not.toHaveProperty("lead_context");
    });

    it("selects primary guardian from household is_primary", () => {
        const guardian = resolvePersonDrawerPrimaryGuardian(childRecord);
        expect(guardian?.display_name).toBe("Sarah Chen");
        expect(guardian?.role_label).toBe("Parent");
    });
});

describe("deduplication ownership", () => {
    it("hides quick links for child lifecycle — Family owns relationships", () => {
        expect(personDrawerShowsChildContextPanel(childProfile)).toBe(false);
        expect(buildPersonDrawerQuickLinks(childRecord)?.length ?? 0).toBeGreaterThan(0);
    });

    it("keeps quick links for parent profile", () => {
        expect(personDrawerShowsChildContextPanel(parentProfile)).toBe(true);
    });

    it("uses default section chrome for overview sections — accent in summary and enrollment shells", () => {
        expect(CHILD_LIFECYCLE_PREMIUM_SECTION_KEYS.size).toBe(0);
        expect(childLifecycleSectionSurface("enrollment_activity")).toBe("default");
        expect(childLifecycleSectionSurface("relationships")).toBe("default");
    });
});

describe("personDrawerCrmDisplayLabel", () => {
    it("maps inquiry terminology to lead labels", () => {
        expect(personDrawerCrmDisplayLabel("Inquiry")).toBe("Lead");
        expect(personDrawerCrmDisplayLabel("Family inquiry")).toBe("Family Lead");
        expect(personDrawerCrmDisplayLabel("Enrollment inquiry")).toBe("Enrollment lead");
    });
});

describe("resolveChildLifecycleSlotStates", () => {
    it("includes lead and tour roadmap steps with enrollment active when data exists", () => {
        const states = resolveChildLifecycleSlotStates({
            _enrollment_mirror: childRecord._enrollment_mirror,
            _enrollment_opportunities: [],
        });
        expect(states.find((s) => s.key === "lead")?.phase).toBe("active");
        expect(states.find((s) => s.key === "tour")?.phase).toBe("future");
        expect(states.find((s) => s.key === "enrollment_activity")?.phase).toBe("active");
        expect(CHILD_LIFECYCLE_ROADMAP_UX).toBe("overview_lifecycle_snapshot");
    });
});

describe("sortOverviewSectionsForChildLifecycle", () => {
    it("orders basic information before family and enrollment", () => {
        const sorted = sortOverviewSectionsForChildLifecycle([
            { key: "enrollment_activity" },
            { key: "relationships" },
            { key: "medical" },
            { key: "basic_info" },
        ]);
        expect(sorted.map((s) => s.key)).toEqual([
            "relationships",
            "enrollment_activity",
            "basic_info",
            "medical",
        ]);
    });
});

describe("buildPersonEnrollmentActivityEntries dedupe", () => {
    it("merges mirror and opportunity rows for one opportunity", () => {
        const entries = buildPersonEnrollmentActivityEntries(
            childRecord._enrollment_mirror as Parameters<typeof buildPersonEnrollmentActivityEntries>[0],
            [
                {
                    opportunity_id: "opp-1",
                    opportunity_name: "Fall enrollment",
                    status_key: "inquiry",
                    status_label: "Inquiry",
                    role_label: "Child",
                    link_source: "opportunity_person",
                },
            ]
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]?.program_label).toBe("Preschool");
    });
});

describe("parent drawer regression", () => {
    it("child lifecycle surface flag is false for parent-only profile", () => {
        expect(personDrawerShowsChildLifecycleSurface(parentProfile)).toBe(false);
    });
});
