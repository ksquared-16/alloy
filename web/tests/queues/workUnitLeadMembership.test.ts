import { describe, expect, it } from "vitest";
import {
    WORK_UNIT_LEAD_MEMBERSHIP_STATUS_KEYS,
    applyWorkUnitLeadMembershipFilter,
    applyWorkUnitScopeToOpportunityQuery,
    workUnitLeadRowQualifies,
} from "@/lib/queues/workUnitLeadMembership";

const M = { orgId: "org-1", workUnitId: "wu-1" };

describe("workUnitLeadRowQualifies — canonical WU lead membership", () => {
    it("qualifies a lead in this org + work unit with a lead status", () => {
        expect(workUnitLeadRowQualifies({ org_id: "org-1", work_unit_id: "wu-1", status_key: "new_inquiry" }, M)).toBe(true);
        expect(workUnitLeadRowQualifies({ org_id: "org-1", work_unit_id: "wu-1", status_key: "open" }, M)).toBe(true);
    });

    it("EXCLUDES work_unit_id IS NULL (orphan leads)", () => {
        expect(workUnitLeadRowQualifies({ org_id: "org-1", work_unit_id: null, status_key: "new_inquiry" }, M)).toBe(false);
        expect(workUnitLeadRowQualifies({ org_id: "org-1", work_unit_id: "", status_key: "new_inquiry" }, M)).toBe(false);
    });

    it("EXCLUDES sibling work units", () => {
        expect(workUnitLeadRowQualifies({ org_id: "org-1", work_unit_id: "wu-2", status_key: "new_inquiry" }, M)).toBe(false);
    });

    it("excludes non-lead statuses and other orgs", () => {
        expect(workUnitLeadRowQualifies({ org_id: "org-1", work_unit_id: "wu-1", status_key: "enrolled" }, M)).toBe(false);
        expect(workUnitLeadRowQualifies({ org_id: "org-2", work_unit_id: "wu-1", status_key: "new_inquiry" }, M)).toBe(false);
    });

    it("the canonical status set includes new_inquiry + the open/new aliases", () => {
        expect(WORK_UNIT_LEAD_MEMBERSHIP_STATUS_KEYS).toEqual(expect.arrayContaining(["new_inquiry", "open", "new"]));
    });
});

describe("count parity — ONE membership → the number queue rows AND the WU metric must report", () => {
    it("counts only this WU's lead rows (NULL + siblings + non-lead dropped)", () => {
        const rows = [
            { org_id: "org-1", work_unit_id: "wu-1", status_key: "new_inquiry" }, // ✓
            { org_id: "org-1", work_unit_id: "wu-1", status_key: "open" }, //         ✓
            { org_id: "org-1", work_unit_id: null, status_key: "new_inquiry" }, //    ✗ orphan
            { org_id: "org-1", work_unit_id: "wu-2", status_key: "new_inquiry" }, //  ✗ sibling
            { org_id: "org-1", work_unit_id: "wu-1", status_key: "enrolled" }, //     ✗ not a lead
        ];
        expect(rows.filter((r) => workUnitLeadRowQualifies(r, M)).length).toBe(2);
    });
});

describe("query builders — org + work_unit + status IN, NULL excluded by eq", () => {
    type Rec = [string, unknown, unknown?];
    function recorder() {
        const calls: Rec[] = [];
        const q = {
            eq(c: string, v: unknown) { calls.push(["eq", c, v]); return q; },
            in(c: string, v: readonly unknown[]) { calls.push(["in", c, v]); return q; },
        };
        return { q, calls };
    }

    it("membership filter applies org + work_unit + status IN", () => {
        const { q, calls } = recorder();
        applyWorkUnitLeadMembershipFilter(q, M);
        expect(calls).toContainEqual(["eq", "org_id", "org-1"]);
        expect(calls).toContainEqual(["eq", "work_unit_id", "wu-1"]);
        expect(calls.some((c) => c[0] === "in" && c[1] === "status_key")).toBe(true);
    });

    it("scope helper applies eq work_unit_id only (single WU, NULL excluded)", () => {
        const { q, calls } = recorder();
        applyWorkUnitScopeToOpportunityQuery(q, "wu-9");
        expect(calls).toEqual([["eq", "work_unit_id", "wu-9"]]);
    });
});
