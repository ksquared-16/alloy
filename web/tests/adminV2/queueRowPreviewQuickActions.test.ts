import { describe, expect, it } from "vitest";

import {
    buildQueueRowPreviewQuickActionsForOpportunityRow,
    buildQueueRowPreviewQuickActionsFromConfig,
} from "@/lib/workspace/viewModels/queueRowPreviewQuickActions";

describe("buildQueueRowPreviewQuickActionsFromConfig", () => {
    it("ignores message token — placements own Message", () => {
        const actions = buildQueueRowPreviewQuickActionsFromConfig({
            previewActions: ["open", "message"],
            opportunityId: "opp-1",
            personId: "person-1",
            displayName: "Jane",
            email: "jane@example.com",
            phone: "5551234567",
        });
        expect(actions.map((a) => a.label)).toEqual(["Open"]);
        expect(actions.some((a) => a.actionId === "crm_message")).toBe(false);
    });

    it("renders Open when message is absent from config", () => {
        const actions = buildQueueRowPreviewQuickActionsFromConfig({
            previewActions: ["open"],
            opportunityId: "opp-1",
            personId: "person-1",
        });
        expect(actions.map((a) => a.label)).toEqual(["Open"]);
    });

    it("ignores orchestrator and message preview tokens (placements own them)", () => {
        const actions = buildQueueRowPreviewQuickActionsFromConfig({
            previewActions: ["open", "orchestrator", "message"],
            opportunityId: "opp-9",
            personId: "person-1",
            rowRecord: { id: "opp-9", name: "Smith" },
        });
        expect(actions.map((a) => a.label)).toEqual(["Open"]);
        expect(actions.some((a) => a.actionId === "crm_open_orchestrator")).toBe(false);
    });

    it("legacy call and email render when config contains them", () => {
        const actions = buildQueueRowPreviewQuickActionsFromConfig({
            previewActions: ["call", "email"],
            opportunityId: "opp-1",
            email: "a@b.com",
            phone: "5551234567",
            contactCapabilities: { emailMailto: true, phoneTel: true },
        });
        expect(actions.map((a) => a.label)).toEqual(["Call", "Email"]);
        expect(actions[0]?.actionId).toBe("crm_tel");
        expect(actions[1]?.actionId).toBe("crm_mailto");
    });
});

describe("buildQueueRowPreviewQuickActionsForOpportunityRow", () => {
    it("ignores message token on row helper", () => {
        const actions = buildQueueRowPreviewQuickActionsForOpportunityRow(
            {
                id: "opp-1",
                name: "Smith",
                _primary_person_id: "person-1",
                _primary_email: "jane@example.com",
            } as never,
            ["message"]
        );
        expect(actions.some((a) => a.actionId === "crm_message")).toBe(false);
    });
});
