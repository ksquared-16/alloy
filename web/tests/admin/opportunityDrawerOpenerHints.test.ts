import { describe, expect, it } from "vitest";
import {
    appendOpportunityDrawerOpenerHintsToUrl,
    buildOpportunityDrawerOpenerHintParams,
    readOpportunityDrawerOpenerHints,
} from "@/lib/admin/opportunityDrawerOpenerHints";
import { buildOpportunityDrawerPrimaryUrl } from "@/lib/admin/opportunityDrawerPrimaryPrefetch";

describe("opportunityDrawerOpenerHints", () => {
    it("builds department + work_unit hint params from workspace context", () => {
        const params = buildOpportunityDrawerOpenerHintParams({
            work_unit_id: "wu-1",
            department_id: "dept-1",
        });
        expect(params.get("hint_department_id")).toBe("dept-1");
        expect(params.get("hint_work_unit_id")).toBe("wu-1");
    });

    it("produces no params when workspace context is missing", () => {
        expect(buildOpportunityDrawerOpenerHintParams(null).toString()).toBe("");
        expect(buildOpportunityDrawerOpenerHintParams({ work_unit_id: "  ", department_id: "" }).toString()).toBe("");
    });

    it("appends hints to a url that already has a query string", () => {
        const url = appendOpportunityDrawerOpenerHintsToUrl(
            "/api/admin/entity/opportunities/o1?surface=drawer_primary",
            { work_unit_id: "wu-9", department_id: "dept-9" }
        );
        expect(url).toContain("surface=drawer_primary");
        expect(url).toContain("hint_department_id=dept-9");
        expect(url).toContain("hint_work_unit_id=wu-9");
        expect(url.startsWith("/api/admin/entity/opportunities/o1?surface=drawer_primary&")).toBe(true);
    });

    it("round-trips hints through search params", () => {
        const search = new URLSearchParams("hint_department_id=dept-2&hint_work_unit_id=wu-2");
        expect(readOpportunityDrawerOpenerHints(search)).toEqual({
            departmentId: "dept-2",
            workUnitId: "wu-2",
            customerName: null,
            primaryPersonName: null,
            primaryPersonEmail: null,
            primaryPersonPhone: null,
        });
        expect(readOpportunityDrawerOpenerHints(new URLSearchParams())).toEqual({
            departmentId: null,
            workUnitId: null,
            customerName: null,
            primaryPersonName: null,
            primaryPersonEmail: null,
            primaryPersonPhone: null,
        });
    });

    it("carries queue preview seed as display hints", () => {
        const params = buildOpportunityDrawerOpenerHintParams(
            { work_unit_id: "wu-1", department_id: "dept-1" },
            { title: "Parent Name", subtitle: "Household Name" }
        );
        expect(params.get("hint_primary_person_name")).toBe("Parent Name");
        expect(params.get("hint_customer_name")).toBe("Household Name");
    });

    it("buildOpportunityDrawerPrimaryUrl carries hints when workspace context is provided", () => {
        const withHints = buildOpportunityDrawerPrimaryUrl("o1", { work_unit_id: "wu-1", department_id: "dept-1" });
        expect(withHints).toContain("surface=drawer_primary");
        expect(withHints).toContain("hint_department_id=dept-1");

        const withoutHints = buildOpportunityDrawerPrimaryUrl("o1");
        expect(withoutHints).toBe("/api/admin/entity/opportunities/o1?surface=drawer_primary");
    });
});
