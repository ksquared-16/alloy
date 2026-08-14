/**
 * RECORDS WORKSPACE V1 — the cohort model and the record gestures.
 *
 * The browser proves the surface. These prove the parts a screenshot cannot: that cohort membership
 * is DERIVED rather than stored, that `Lead Teachers` comes from the tenant's configuration and not
 * from a platform string, and that both sections declare durable intent with the right key.
 *
 * The gesture assertions are source-level on purpose. The keys are the whole contract — a Child row
 * keyed on `person_id` would look identical in a screenshot and be wrong for every child whose
 * person is null, which in the certification tenant is all 1500 of them.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    applyCohort,
    buildChildCohorts,
    buildStaffCohorts,
    cohortCount,
    pluralizePosition,
    STARTING_SOON_DAYS,
    type ChildCohortRecord,
    type StaffCohortRecord,
} from "@/lib/adminV2/records/recordCohorts";
import { resolveRecordsSection, RECORDS_SECTION_TABS } from "@/app/adminV2/records/recordsSections";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const TODAY = "2026-08-14";

function staff(over: Partial<StaffCohortRecord>): StaffCohortRecord {
    return { isOpen: true, startDate: "2026-01-05", endDate: null, positionKey: null, ...over };
}

describe("Records is two sections and no People layer", () => {
    it("declares exactly Staff and Children", () => {
        expect(RECORDS_SECTION_TABS.map((t) => t.key)).toEqual(["staff", "children"]);
    });

    it("resolves a deep link, and refuses an unknown section rather than defaulting", () => {
        expect(resolveRecordsSection("children")).toBe("children");
        expect(resolveRecordsSection("people")).toBeNull();
        expect(resolveRecordsSection(null)).toBeNull();
    });
});

describe("staff cohorts are configured, not hardcoded", () => {
    const positions = [
        { key: "lead_teacher", label: "Lead Teacher" },
        { key: "assistant", label: "Assistant" },
    ];

    it("builds one cohort per TENANT position — the platform supplies no position vocabulary", () => {
        const cohorts = buildStaffCohorts(TODAY, positions);
        expect(cohorts.map((c) => c.key)).toEqual([
            "all",
            "position:lead_teacher",
            "position:assistant",
            "starting_soon",
            "inactive",
        ]);
        // "Lead Teachers" is the tenant's label pluralised, never a platform constant.
        expect(cohorts[1]!.label).toBe("Lead Teachers");
    });

    it("a tenant with no configured positions gets no position cohorts", () => {
        expect(buildStaffCohorts(TODAY, []).map((c) => c.key)).toEqual([
            "all",
            "starting_soon",
            "inactive",
        ]);
    });

    it("position membership matches on the KEY, so a renamed label cannot break it", () => {
        const cohorts = buildStaffCohorts(TODAY, positions);
        const leads = cohorts.find((c) => c.key === "position:lead_teacher")!;
        expect(leads.predicate(staff({ positionKey: "lead_teacher" }))).toBe(true);
        expect(leads.predicate(staff({ positionKey: "assistant" }))).toBe(false);
        expect(leads.predicate(staff({ positionKey: null }))).toBe(false);
    });

    it("Starting Soon is future-dated OPEN employment inside the window", () => {
        const soon = buildStaffCohorts(TODAY, []).find((c) => c.key === "starting_soon")!;
        expect(soon.predicate(staff({ startDate: "2026-09-01" }))).toBe(true);
        // Already started — active, not starting.
        expect(soon.predicate(staff({ startDate: "2026-01-05" }))).toBe(false);
        // Today is not "soon" — they are here.
        expect(soon.predicate(staff({ startDate: TODAY }))).toBe(false);
        // Beyond the window is a real hire, but not an imminent one.
        expect(soon.predicate(staff({ startDate: "2027-01-01" }))).toBe(false);
        // An ENDED employment with a future start date is incoherent data, not a starter.
        expect(soon.predicate(staff({ startDate: "2026-09-01", isOpen: false }))).toBe(false);
        expect(STARTING_SOON_DAYS).toBe(30);
    });

    it("Inactive is ended employment", () => {
        const inactive = buildStaffCohorts(TODAY, []).find((c) => c.key === "inactive")!;
        expect(inactive.predicate(staff({ isOpen: false, endDate: "2026-06-30" }))).toBe(true);
        expect(inactive.predicate(staff({}))).toBe(false);
    });

    it("cohorts OVERLAP — a record is not assigned to exactly one", () => {
        const cohorts = buildStaffCohorts(TODAY, positions);
        const startingLead = staff({ positionKey: "lead_teacher", startDate: "2026-09-01" });
        const memberships = cohorts.filter((c) => c.predicate(startingLead)).map((c) => c.key);
        // All Staff + their position + Starting Soon. A stage model could not express this.
        expect(memberships).toEqual(["all", "position:lead_teacher", "starting_soon"]);
    });

    it("membership is derived on read — counting never mutates the records", () => {
        const records = [staff({ positionKey: "lead_teacher" }), staff({ isOpen: false })];
        const snapshot = JSON.stringify(records);
        const cohorts = buildStaffCohorts(TODAY, positions);
        cohorts.forEach((c) => cohortCount(c, records));
        expect(JSON.stringify(records)).toBe(snapshot);
    });
});

describe("position pluralisation is presentation, and stays out of the platform's way", () => {
    it("handles the ordinary cases without owning an inflection dictionary", () => {
        expect(pluralizePosition("Lead Teacher")).toBe("Lead Teachers");
        expect(pluralizePosition("Bus")).toBe("Buses");
        expect(pluralizePosition("Deputy")).toBe("Deputies");
        expect(pluralizePosition("Coach")).toBe("Coaches");
        expect(pluralizePosition("")).toBe("");
    });
});

describe("child cohorts are record cohorts, not enrollment stages", () => {
    const child = (over: Partial<ChildCohortRecord>): ChildCohortRecord => ({
        isActive: true,
        participationState: null,
        ...over,
    });

    it("offers the four V1 views", () => {
        expect(buildChildCohorts().map((c) => c.key)).toEqual([
            "all",
            "enrolled",
            "in_process",
            "inactive",
        ]);
    });

    it("a child with NO participation is still in All Children — that is the whole point", () => {
        const cohorts = buildChildCohorts();
        const noProcess = child({});
        expect(cohorts[0]!.predicate(noProcess)).toBe(true);
        // …and in nothing else. They are a record, not a work item.
        expect(cohorts.filter((c) => c.predicate(noProcess)).map((c) => c.key)).toEqual(["all"]);
    });

    it("Enrolled and In Process read participation truth, not a stage clone", () => {
        const cohorts = buildChildCohorts();
        const enrolled = cohorts.find((c) => c.key === "enrolled")!;
        const inProcess = cohorts.find((c) => c.key === "in_process")!;
        expect(enrolled.predicate(child({ participationState: "enrolled" }))).toBe(true);
        expect(enrolled.predicate(child({ participationState: "in_process" }))).toBe(false);
        expect(inProcess.predicate(child({ participationState: "in_process" }))).toBe(true);
        // A CLOSED enrollment is neither — but the child is still in All Children.
        const closed = child({ participationState: "closed" });
        expect(enrolled.predicate(closed)).toBe(false);
        expect(inProcess.predicate(closed)).toBe(false);
        expect(applyCohort(cohorts[0]!, [closed])).toHaveLength(1);
    });

    it("Inactive is the membership ending, independent of any process", () => {
        const inactive = buildChildCohorts().find((c) => c.key === "inactive")!;
        expect(inactive.predicate(child({ isActive: false }))).toBe(true);
        expect(inactive.predicate(child({ isActive: false, participationState: "enrolled" }))).toBe(true);
    });
});

describe("the record gestures use the durable contract", () => {
    it("Staff declares durable intent on the PERSON and names Employment", () => {
        const src = read("components/adminV2/records/RecordsStaffSection.tsx");
        expect(src).toContain('entity_type: "persons"');
        expect(src).toContain('intent: "durable_record"');
        expect(src).toContain("OPERATOR_FOCUS_CARDS.employment");
    });

    it("Children declares durable intent on the MEMBER — never person_id", () => {
        const src = read("components/adminV2/records/RecordsChildrenSection.tsx");
        expect(src).toContain('entity_type: "customer_members"');
        expect(src).toContain('intent: "durable_record"');
        expect(src).toContain("customerMemberId");
        // The failure this guards is invisible in a screenshot and wrong for every person-less child.
        expect(src).not.toContain("entity_id: c.personId");
    });

    it("Records resolves no households, opportunities, work units or routes of its own", () => {
        for (const rel of [
            "components/adminV2/records/RecordsStaffSection.tsx",
            "components/adminV2/records/RecordsChildrenSection.tsx",
        ]) {
            const src = read(rel);
            expect(src, `${rel} must not route`).not.toContain("router.push");
            expect(src, `${rel} must not resolve work units`).not.toContain("work_unit");
            expect(src, `${rel} must not resolve opportunities`).not.toContain("opportunit");
        }
    });

    it("Add Child is NOT wired to any execution path", () => {
        const src = read("components/adminV2/records/RecordsChildrenSection.tsx");
        // Phase 0 found the existing child-create path resolves ambiguous identity silently.
        expect(src).not.toContain("add_child");
        expect(src).not.toContain("create_lead");
        expect(src).not.toContain("CreateLead");
    });
});

describe("Add Staff moved rather than being rewritten", () => {
    it("Records mounts the existing AddStaffModal, not a second command", () => {
        const src = read("components/adminV2/records/RecordsStaffSection.tsx");
        expect(src).toContain("AddStaffModal");
        expect(src).not.toContain("staff.add");
        // Cohort membership is derived, so the projection decides where the new staff member lands.
        expect(src).toContain("void load()");
    });

    it("`/organization/staff` no longer renders a directory", () => {
        const src = read("app/adminV2/settings/organization/staff/page.tsx");
        expect(src).toContain("redirect");
        expect(src).toContain("workspace=records");
        expect(src).not.toContain("StaffDirectoryPage");
    });
});
