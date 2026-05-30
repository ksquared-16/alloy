import { describe, expect, it } from "vitest";
import { buildPersonDrawerQuickLinks } from "@/components/admin/entity/PersonDrawerContextPanel";
import { buildPersonEnrollmentActivityEntries } from "@/components/admin/entity/PersonDrawerEnrollmentActivity";
import {
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

describe("personDrawerShowsChildLifecycleSurface", () => {
    it("is true for child emphasis only", () => {
        expect(personDrawerShowsChildLifecycleSurface(childProfile)).toBe(true);
        expect(personDrawerShowsChildLifecycleSurface(parentProfile)).toBe(false);
    });
});

describe("resolveChildLifecycleSlotStates", () => {
    it("marks enrollment active when mirror or opportunity rows exist", () => {
        const states = resolveChildLifecycleSlotStates({
            _enrollment_mirror: [
                {
                    id: "ocm-1",
                    opportunity_id: "opp-1",
                    opportunity_name: "Fall enrollment",
                    opportunity_status_key: "inquiry",
                    opportunity_status_label: "Inquiry",
                    customer_member_id: "cm-1",
                    child_display_name: "Mia",
                    location_label: null,
                    program_label: null,
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
            _enrollment_opportunities: [],
        });
        const enrollment = states.find((s) => s.key === "enrollment_activity");
        expect(enrollment?.phase).toBe("active");
        expect(states.filter((s) => s.phase === "future")).toHaveLength(6);
    });

    it("marks enrollment idle without data and keeps future slots non-section cards", () => {
        const states = resolveChildLifecycleSlotStates({});
        expect(states.find((s) => s.key === "enrollment_activity")?.phase).toBe("idle");
        for (const slot of states) {
            if (slot.key !== "enrollment_activity") {
                expect(slot.phase).toBe("future");
            }
        }
    });

    it("maps future slots to layout section keys for config migration", () => {
        const states = resolveChildLifecycleSlotStates({});
        expect(states.find((s) => s.key === "schedule")?.layoutSectionKey).toBe("schedule_summary");
        expect(states.find((s) => s.key === "billing")?.layoutSectionKey).toBe("billing_summary");
    });
});

describe("sortOverviewSectionsForChildLifecycle", () => {
    it("orders relationships and enrollment before profile fields", () => {
        const sorted = sortOverviewSectionsForChildLifecycle([
            { key: "basic_info" },
            { key: "enrollment_activity" },
            { key: "relationships" },
            { key: "medical" },
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
            [
                {
                    id: "ocm-1",
                    opportunity_id: "opp-1",
                    opportunity_name: "Fall enrollment",
                    opportunity_status_key: "inquiry",
                    opportunity_status_label: "Inquiry",
                    customer_member_id: "cm-1",
                    child_display_name: "Mia",
                    location_label: "Main",
                    program_label: "Preschool",
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
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

describe("buildPersonDrawerQuickLinks", () => {
    const childRecord = {
        id: "child-1",
        _compatibility_members: [{ id: "cm-1", customer_id: "cust-1", relationship: "child" }],
        _household_adult_links: [
            {
                person_id: "parent-1",
                display_name: "Jordan Lee",
                role_type: "parent",
                role_label: "Parent",
                customer_id: "cust-1",
                is_primary: true,
            },
            {
                person_id: "parent-2",
                display_name: "Alex Lee",
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
                display_name: "Sam Chen",
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
                location_label: null,
                program_label: null,
                room_label: null,
                outcome_status_key: null,
                outcome_status_label: null,
            },
        ],
        _enrollment_opportunities: [],
    };

    it("caps child quick links at four and reserves a slot for enrollment", () => {
        const links = buildPersonDrawerQuickLinks(childRecord);
        expect(links).not.toBeNull();
        expect(links!.length).toBeLessThanOrEqual(4);
        expect(links!.some((l) => l.group === "Enrollment")).toBe(true);
        expect(links!.some((l) => l.group === "Parent")).toBe(true);
    });

    it("does not add enrollment quick link for parent profile", () => {
        const links = buildPersonDrawerQuickLinks({
            id: "parent-1",
            _customer_persons: [{ role_type: "parent" }],
            _household_child_links: [
                {
                    customer_member_id: "cm-1",
                    person_id: "child-1",
                    display_name: "Mia Chen",
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
                    location_label: null,
                    program_label: null,
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
        });
        expect(links?.some((l) => l.group === "Enrollment")).toBe(false);
        expect(links?.some((l) => l.group === "Child")).toBe(true);
    });
});

describe("parent drawer does not inherit child lifecycle overview sections", () => {
    it("child lifecycle surface flag is false for parent-only profile", () => {
        expect(personDrawerShowsChildLifecycleSurface(parentProfile)).toBe(false);
    });

    it("future lifecycle slots are roadmap-only — no extra overview section keys", () => {
        const futureKeys = resolveChildLifecycleSlotStates({})
            .filter((s) => s.phase === "future")
            .map((s) => s.key);
        expect(futureKeys).toEqual([
            "schedule",
            "attendance",
            "billing",
            "documents",
            "communications",
            "history",
        ]);
        expect(futureKeys).not.toContain("relationships");
    });
});
