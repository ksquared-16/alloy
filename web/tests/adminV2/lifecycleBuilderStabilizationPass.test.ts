import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIFECYCLE_FIELD_REQUIREMENT_CATALOG } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { LIFECYCLE_BASE_ACTIONS } from "@/lib/lifecycle/lifecycleStageBaseActions";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Lifecycle builder stabilization pass", () => {
    it("add stage form has no starting status field", () => {
        const form = read("components/adminV2/settings/lifecycle/LifecycleAddStageForm.tsx");
        expect(form).not.toContain("lifecycle-add-stage-status");
        expect(form).not.toContain("starting status");
    });

    it("field catalog uses Phone not Mobile for person:phone", () => {
        const phone = LIFECYCLE_FIELD_REQUIREMENT_CATALOG.find((f) => f.rule_id === "person:phone");
        expect(phone?.field_label).toBe("Phone");
        expect(LIFECYCLE_FIELD_REQUIREMENT_CATALOG.some((f) => f.field_label === "Mobile")).toBe(false);
    });

    it("actions card uses base action label and placement checkboxes", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/EnrollmentProcessActionsCard.tsx");
        expect(card).toContain("lifecycle-add-action-base");
        expect(card).toContain("lifecycle-add-action-label");
        expect(card).toContain("lifecycle-add-action-placements");
        expect(card).toContain("Base action:");
        expect(card).not.toContain("definition-catalog");
        expect(card).toContain("lifecycle-actions-empty");
    });

    it("base actions are curated domain verbs, not a generic Change Status", () => {
        expect(LIFECYCLE_BASE_ACTIONS.map((b) => b.key)).toEqual([
            "add_person",
            "add_child",
            "send_form",
            "schedule_tour",
            "send_tour_invitation",
            "waitlist_child",
            "enroll_child",
            "close_lead",
            "create_task",
            "quick_message",
        ]);
        expect(LIFECYCLE_BASE_ACTIONS.map((b) => b.key)).not.toContain("change_status");
        expect(LIFECYCLE_BASE_ACTIONS.some((b) => b.definition_key === "send_tour_invitation")).toBe(true);
    });

    it("queue view has no sync button and uses stabilization copy", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(card).not.toContain("lifecycle-sync-queue-statuses");
        expect(card).not.toContain("Update queue filters");
        expect(card).toContain("lifecycle-queue-view-copy");
        expect(card).toContain("This queue view shows records that are currently in this stage");
        expect(card).toContain("Publish queue view");
    });

    it("status save auto-syncs queue server-side", () => {
        const route = read("app/api/admin/enrollment-process/status-stages/route.ts");
        expect(route).toContain("syncDepartmentQueueForStage");
    });

    it("scratch hub has no hardcoded enrollment stage order", () => {
        const hub = read("components/adminV2/settings/LifecycleHubClient.tsx");
        expect(hub).not.toContain("LIFECYCLE_STAGE_ORDER");
        expect(hub).toContain("Queue view");
        expect(hub).toContain("Required Fields");
    });

    it("stage actions POST requires base action label and placements", () => {
        const route = read("app/api/admin/enrollment-process/stage-actions/route.ts");
        expect(route).toContain("base_action_key");
        expect(route).toContain("placement_ids");
        expect(route).toContain("ensureOrgLifecycleActionDefinition");
    });
});
