import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCreateLeadSuccess } from "@/lib/platform/commands/createLead/createLeadSuccess";
import { createdLeadStatusIsNewLeadsMember } from "@/lib/platform/commands/createLead/createLeadSuccessDiagnostic";
import { enrollmentPipelineNewLeadsStatusKeys } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import type { ActionResultOk } from "@/lib/adminV2/actions/actionTypes";

const root = resolve(__dirname, "../../../..");

function okResult(detail: Record<string, unknown>): ActionResultOk {
    return {
        ok: true,
        correlationId: "corr-1",
        result: {
            actionKey: "create_lead",
            entityType: "opportunity",
            entityId: "opp-1",
            affectedId: "opp-1",
            detail,
        },
    } as ActionResultOk;
}

describe("buildCreateLeadSuccess — refresh contract", () => {
    it("includes BOTH the created opportunity AND the lead's work-unit queue/count refresh targets", () => {
        const success = buildCreateLeadSuccess({
            result: okResult({ opportunity_id: "opp-1", work_unit_id: "wu-lead", status_key: "new_inquiry" }),
            knownInputs: { first_name: "Ada", last_name: "Lovelace" },
        });
        expect(success.createdRecordId).toBe("opp-1");
        expect(success.workUnitId).toBe("wu-lead");
        expect(success.statusKey).toBe("new_inquiry");
        expect(success.refreshTargets).toEqual(
            expect.arrayContaining([
                { entityType: "opportunity", entityId: "opp-1" },
                { entityType: "work_unit", entityId: "wu-lead" },
            ]),
        );
    });

    it("includes process-context routing fields from action detail", () => {
        const success = buildCreateLeadSuccess({
            result: okResult({
                opportunity_id: "opp-1",
                work_unit_id: "wu-1",
                work_unit_key: "pipeline",
                work_view_id: "fresh_prospects",
                status_key: "open",
            }),
        });
        expect(success.focusPanelHref).toBe("/workspace/work-unit/fresh-prospects?subject_id=opp-1");
        expect(success.workUnitKey).toBe("pipeline");
        expect(success.workViewId).toBe("fresh_prospects");
    });

    it("omits the work-unit target when the lead has no resolved work unit (safe degrade)", () => {
        const success = buildCreateLeadSuccess({
            result: okResult({ opportunity_id: "opp-1", work_unit_id: null, status_key: "new_inquiry" }),
        });
        expect(success.workUnitId).toBeNull();
        expect(success.refreshTargets).toEqual([{ entityType: "opportunity", entityId: "opp-1" }]);
    });
});

describe("New Leads membership proof (diagnostic predicate)", () => {
    it("accepts the statuses Create Lead actually writes (new_inquiry, open) — not hardcoded to one key", () => {
        // The lifecycle binding may write new_inquiry (builder) or legacy open — both must count.
        expect(createdLeadStatusIsNewLeadsMember("new_inquiry")).toBe(true);
        expect(createdLeadStatusIsNewLeadsMember("open")).toBe(true);
        // Sanity: the accepted set is derived from the queue definition, not a literal.
        expect(enrollmentPipelineNewLeadsStatusKeys().map((k) => k.toLowerCase())).toEqual(
            expect.arrayContaining(["new_inquiry", "open"]),
        );
    });

    it("rejects statuses that belong to other lanes / unknown", () => {
        expect(createdLeadStatusIsNewLeadsMember("enrolled")).toBe(false);
        expect(createdLeadStatusIsNewLeadsMember("waitlisted")).toBe(false);
        expect(createdLeadStatusIsNewLeadsMember(null)).toBe(false);
        expect(createdLeadStatusIsNewLeadsMember("")).toBe(false);
    });
});

describe("Focus Panel composes by record id (not queue membership)", () => {
    it("the opportunity drawer/focus-panel VM loads by org_id + id, never gated on work_unit_id", () => {
        const src = readFileSync(
            resolve(root, "lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts"),
            "utf8",
        );
        // Primary record load is keyed on id + org only — so a just-created lead composes even when
        // the work-unit queue list has not refreshed yet.
        expect(src).toMatch(/\.eq\(\s*["']id["']\s*,\s*opportunityId\s*\)/);
        expect(src).toMatch(/\.eq\(\s*["']org_id["']\s*,\s*orgId\s*\)/);
        expect(src).not.toMatch(/from\(["']opportunities["']\)[\s\S]{0,200}\.eq\(\s*["']work_unit_id["']/);
    });
});
