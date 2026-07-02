import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalNewLeadStatusLabel } from "@/lib/lifecycle/enrollmentLeadStageStatusAliases";
import { opportunityMatchesEnrollmentNewLeadsQueue } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { buildCreateLeadOcmInsertRow } from "@/lib/admin/actions/createLeadChildOcmPersistence";

const root = resolve(__dirname, "../..");

describe("Child enrollment status — eliminate new_inquiry / 'New Inquiry'", () => {
    it("Create Lead does NOT write `new_inquiry` (or any disposition) to the child OCM row", () => {
        const row = buildCreateLeadOcmInsertRow({
            orgId: "org-1",
            opportunityId: "opp-1",
            customerMemberId: "cm-1",
            ocm: {
                location_id: null,
                program_category_id: null,
                schedule_type: null,
                start_date: null,
                program_room_cohort_key: null,
                notes: null,
            },
        });
        expect(row.outcome_status_key).toBeNull();
        expect(row.outcome_status_key).not.toBe("new_inquiry");
    });

    it("canonicalNewLeadStatusLabel renders legacy new_inquiry (and future new_lead) as 'New Lead'", () => {
        expect(canonicalNewLeadStatusLabel("new_inquiry")).toBe("New Lead");
        expect(canonicalNewLeadStatusLabel("new_lead")).toBe("New Lead");
        expect(canonicalNewLeadStatusLabel("NEW_INQUIRY")).toBe("New Lead");
        expect(canonicalNewLeadStatusLabel("waitlisted")).toBeNull();
        expect(canonicalNewLeadStatusLabel(null)).toBeNull();
    });

    it("opportunity New Leads queue still includes legacy new_inquiry rows (deferred opportunity key)", () => {
        expect(opportunityMatchesEnrollmentNewLeadsQueue("new_inquiry")).toBe(true);
        expect(opportunityMatchesEnrollmentNewLeadsQueue("open")).toBe(true);
        expect(opportunityMatchesEnrollmentNewLeadsQueue("new")).toBe(true);
    });

    it("no operator-facing 'New Inquiry' copy remains in status-label sources", () => {
        const files = [
            "lib/admin/opportunityActivityTimelineFormat.ts",
            "lib/lifecycle/enrollmentProcessStageBindings.ts",
            "lib/completion/lifecycleStageWorkspaceMapping.ts",
        ];
        for (const rel of files) {
            const src = readFileSync(resolve(root, rel), "utf8");
            expect(src).not.toMatch(/["'`]New Inquiry["'`]/);
        }
    });
});
