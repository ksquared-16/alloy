import { describe, expect, it } from "vitest";

import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { normalizeEnrollmentQueueRowPreviewActions } from "@/lib/ui-v2/enrollmentQueueRowPreviewPolicy";
import {
    mergeQueueRowQuickActions,
    mergeQueueRowQuickActionsForOpportunityRow,
} from "@/lib/workspace/viewModels/mergeQueueRowQuickActions";

const baseRow = {
    previewActions: ["open"] as Array<"open" | "call" | "email" | "message">,
    opportunityId: "opp-1",
    personId: "person-1",
    displayName: "Jane",
    email: "j@example.com",
    phone: "5551234567",
};

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

describe("mergeQueueRowQuickActions", () => {
    it("strips call and email from enrollment preview actions", () => {
        expect(normalizeEnrollmentQueueRowPreviewActions(["open", "call", "email", "message"])).toEqual(["open"]);
    });

    it("does not show Message from preview JSON even when message token is present", () => {
        const actions = mergeQueueRowQuickActions({
            previewActions: ["open", "message"],
            registryPlacements: [],
            enrollmentLike: true,
            row: { ...baseRow, previewActions: ["open", "message"] },
        });
        expect(actions.map((a) => a.actionId)).toEqual(["open_record"]);
    });

    it("shows Message only when queue_row placement exists", () => {
        const actions = mergeQueueRowQuickActions({
            previewActions: ["open", "message"],
            registryPlacements: [
                registryAction("quick_message", "Message", "ui_intent", { intent: "quick_message" }),
            ],
            enrollmentLike: true,
            row: { ...baseRow, previewActions: ["open", "message"] },
        });
        expect(actions.map((a) => a.actionId)).toEqual(["open_record", "quick_message"]);
    });

    it("includes Ask BOS registry chip only when placed", () => {
        const without = mergeQueueRowQuickActions({
            previewActions: ["open"],
            registryPlacements: [],
            enrollmentLike: true,
            row: baseRow,
        });
        expect(without.some((a) => a.actionId === "ask_bos")).toBe(false);

        const withBos = mergeQueueRowQuickActions({
            previewActions: ["open"],
            registryPlacements: [
                registryAction("ask_bos", "Ask BOS", "ui_intent", { intent: "ask_bos" }),
            ],
            enrollmentLike: true,
            row: baseRow,
        });
        expect(withBos.some((a) => a.actionId === "ask_bos")).toBe(true);
    });

    it("merges registry update_status with preview open only", () => {
        const actions = mergeQueueRowQuickActions({
            previewActions: ["open", "message"],
            registryPlacements: [
                registryAction("update_status_add_note", "Update status", "open_form", {
                    form_key: "update_status_add_note",
                }),
            ],
            enrollmentLike: true,
            row: { ...baseRow, previewActions: ["open", "message"] },
        });
        const labels = actions.map((a) => a.label);
        expect(labels).toContain("Open");
        expect(labels).toContain("Update status");
        expect(labels).not.toContain("Message");
        expect(labels).not.toContain("Call");
        expect(labels).not.toContain("Email");
    });

    it("reads primary_person_id from queue row (not only _primary_person_id)", () => {
        const actions = mergeQueueRowQuickActionsForOpportunityRow(
            {
                id: "opp-9",
                primary_person_id: "person-kelly",
                _customer_name: "Kelly Kurzman",
                _primary_email: "kelly@example.com",
            } as never,
            ["open"],
            [
                {
                    key: "quick_message",
                    label: "Message",
                    action_type: "ui_intent",
                    payload: { intent: "quick_message" },
                },
            ] as never,
            { enrollmentLike: true }
        );
        const msg = actions.find((a) => a.actionId === "quick_message");
        expect(msg?.payload).toMatchObject({
            opportunityId: "opp-9",
            personId: "person-kelly",
            displayName: "Kelly Kurzman",
        });
    });
});
