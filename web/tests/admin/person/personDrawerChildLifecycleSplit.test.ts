import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePersonDrawerChildEnrollmentProgress } from "@/lib/admin/person/resolvePersonDrawerChildEnrollmentProgress";
import { resolvePersonDrawerChildModuleNavModel } from "@/lib/admin/person/resolvePersonDrawerChildModuleNavModel";

describe("resolvePersonDrawerChildEnrollmentProgress", () => {
    it("derives pipeline stages from linked opportunity status", () => {
        const progress = resolvePersonDrawerChildEnrollmentProgress({
            _enrollment_mirror: [
                {
                    id: "ocm-1",
                    opportunity_id: "opp-1",
                    opportunity_name: "Rivera inquiry",
                    opportunity_status_key: "tour_scheduled",
                    opportunity_status_label: "Tour scheduled",
                    customer_member_id: "cm-1",
                    child_display_name: "Sophia Rivera",
                    location_label: "North Campus",
                    program_label: "Preschool",
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
            _enrollment_opportunities: [],
        });

        expect(progress).not.toBeNull();
        expect(progress!.model.steps.map((s) => s.label)).toEqual([
            "New Leads",
            "Tours",
            "Follow Up",
            "Waitlist",
            "Enrolling",
            "Enrolled",
        ]);
        expect(progress!.model.currentIndex).toBe(1);
    });
});

describe("resolvePersonDrawerChildModuleNavModel", () => {
    it("lists operational modules separately from enrollment pipeline", () => {
        const items = resolvePersonDrawerChildModuleNavModel({
            _enrollment_mirror: [
                {
                    id: "ocm-1",
                    opportunity_id: "opp-1",
                    opportunity_name: "Lead",
                    opportunity_status_key: "new_inquiry",
                    opportunity_status_label: "New inquiry",
                    customer_member_id: "cm-1",
                    child_display_name: "Child",
                    location_label: null,
                    program_label: null,
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
            _enrollment_opportunities: [],
        });

        expect(items.map((i) => i.key)).toEqual([
            "documents",
            "communications",
            "activity",
            "schedule",
            "attendance",
            "billing",
        ]);
        expect(items.find((i) => i.key === "activity")?.label).toBe("Activity");
        expect(items.find((i) => i.key === "lead")).toBeUndefined();
    });
});

describe("child lifecycle split wiring", () => {
    it("attachPersonDrawerVisibility merges household adults at projection source", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/admin/person/attachPersonDrawerVisibility.ts"),
            "utf8"
        );
        expect(src).toContain("mergeHouseholdAdultLinks");
    });

    it("PersonDrawerChildLifecycleRail renders module nav only — no enrollment pipeline", () => {
        const src = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildLifecycleRail.tsx"),
            "utf8"
        );
        expect(src).not.toContain("resolvePersonDrawerChildEnrollmentProgress");
        expect(src).not.toContain("RecordLifecycleRail");
        expect(src).not.toContain('data-testid="person-child-enrollment-progress-rail"');
        expect(src).toContain("PersonDrawerChildModuleNav");
        expect(src).toContain("resolvePersonDrawerChildModuleNavModel");
        const moduleNav = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildModuleNav.tsx"),
            "utf8"
        );
        expect(moduleNav).toContain('data-testid="person-child-module-nav"');
    });

    it("child summary does not repeat age — age lives in title row only", () => {
        const summary = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildSummary.tsx"),
            "utf8"
        );
        expect(summary).not.toContain("personDrawerChildAgeLabel");
        expect(summary).not.toContain("age_label");
        const title = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildTitleRow.tsx"),
            "utf8"
        );
        expect(title).toContain("personDrawerChildAgeLabel");
    });

    it("person status dropdown is separate from opportunity enrollment status", () => {
        const drawer = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("personDrawerChildHeaderStatus");
        expect(drawer).toContain('aria-label="Child status"');
        expect(drawer).toContain("statusDefsForDrawer");
        expect(drawer).not.toMatch(
            /personChildLifecycleChrome[\s\S]{0,400}opportunity_status_key[\s\S]{0,120}personDrawerChildHeaderStatus/
        );
    });

    it("AdminEntityDrawer renders summary from seed without full hydrate gate", () => {
        const src = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(src).toMatch(
            /personChildLifecycleChrome[\s\S]{0,120}personDrawerPaintReady[\s\S]{0,120}isPersonDrawerSeedRecord/
        );
        expect(src).toContain("PersonDrawerChildHeaderExecutive");
        expect(src).not.toContain("PersonDrawerChildEnrollmentContext");
    });
});
