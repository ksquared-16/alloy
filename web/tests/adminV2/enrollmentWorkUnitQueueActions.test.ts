import { describe, expect, it } from "vitest";

import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { buildEnrollmentOpportunityQueueItemVm } from "@/lib/workspace/viewModels/enrollmentWorkUnitViewModel";

function registryAction(
    key: string,
    label: string,
    action_type: string,
    payload: Record<string, unknown>
): ResolvedActionForClient {
    return {
        key,
        label,
        description: null,
        action_type,
        icon: null,
        style: null,
        display_style: "button",
        payload,
        workflow_id: null,
    };
}

describe("enrollment work-unit queue quick actions", () => {
    it("does not show Message from preview JSON without a placement", () => {
        const vm = buildEnrollmentOpportunityQueueItemVm(
            {
                id: "opp-1",
                name: "Smith family",
                status_key: "new_inquiry",
                _customer_name: "Smith family",
                _primary_person_id: "person-1",
                _primary_email: "jane@example.com",
                _primary_phone: "5551234567",
            } as never,
            {
                workUnitKey: "needs_attention",
                previewActions: ["open", "call", "email", "message"],
            }
        );
        const ids = vm.quickActions?.map((a) => a.actionId) ?? [];
        expect(ids).toContain("open_record");
        expect(ids).not.toContain("crm_message");
        expect(ids).not.toContain("quick_message");
        expect(vm.quickActions?.map((a) => a.label)).not.toContain("Call");
        expect(vm.quickActions?.map((a) => a.label)).not.toContain("Email");
    });

    it("shows Message when quick_message placement is configured", () => {
        const vm = buildEnrollmentOpportunityQueueItemVm(
            {
                id: "opp-1",
                name: "Smith family",
                status_key: "new_inquiry",
                _primary_person_id: "person-1",
            } as never,
            {
                workUnitKey: "new_inquiry",
                previewActions: ["open", "message"],
                queueRowRegistryPlacements: [
                    registryAction("quick_message", "Message", "ui_intent", { intent: "quick_message" }),
                ],
            }
        );
        expect(vm.quickActions?.some((a) => a.actionId === "quick_message")).toBe(true);
    });

    it("includes registry update status when placement is configured", () => {
        const vm = buildEnrollmentOpportunityQueueItemVm(
            {
                id: "opp-2",
                name: "Lee",
                status_key: "new_inquiry",
                _primary_person_id: "person-2",
            } as never,
            {
                workUnitKey: "new_inquiry",
                previewActions: ["open"],
                queueRowRegistryPlacements: [
                    registryAction("update_status_add_note", "Update status", "open_form", {
                        form_key: "update_status_add_note",
                    }),
                ],
            }
        );
        expect(vm.quickActions?.some((a) => a.actionId === "update_status_add_note")).toBe(true);
    });
});
