import { describe, expect, it } from "vitest";
import { resolveWorkspaceModeAvailability } from "@/lib/communications/v2/workspaceModeAvailability";
import type { FamilyCommunicationWorkspaceVM } from "@/lib/communications/v2/familyWorkspace/types";

function minimalVm(overrides: Partial<FamilyCommunicationWorkspaceVM> = {}): FamilyCommunicationWorkspaceVM {
    return {
        family: { id: "c1", label: "Family", program: null, location: { id: null, label: null }, stage: null, ownerUserId: null, ownerLabel: null, lifecycleStage: "lead" },
        children: [],
        recipientGroups: [],
        eligibleRecipients: [],
        disabledRecipients: [],
        selectedRecipients: [],
        consentSummary: { byContact: {}, household: { email: "unset", sms: "unset", marketing: "unset" }, displayFlags: { email: true, sms: true, marketing: true } },
        composerDraft: {
            channel: "email",
            recipientContactIds: [],
            subject: null,
            body: "",
            availableChannels: { email: true, sms: false, note: true, reasons: { sms: "SMS unavailable because no SMS-capable recipient exists." } },
            consentBlockers: [],
        },
        scope: { level: "family", customerId: "c1", focusChildId: null, focusOpportunityId: null, focusPersonId: null },
        threads: [],
        selectedThread: null,
        messages: [],
        timelineEvents: [],
        healthSummary: { status: "healthy", engagementScore: 0, responseRate: null, lastContactAt: null, unreadCount: 0 },
        relatedTasks: [],
        ...overrides,
    };
}

describe("resolveWorkspaceModeAvailability", () => {
    it("marks SMS unavailable when no provider or recipients", () => {
        const modes = resolveWorkspaceModeAvailability(minimalVm());
        expect(modes.sms.available).toBe(false);
        expect(modes.sms.reason).toMatch(/SMS/);
    });

    it("enables tasks when an opportunity is in scope", () => {
        const modes = resolveWorkspaceModeAvailability(
            minimalVm({ scope: { level: "family", customerId: "c1", focusChildId: null, focusOpportunityId: "opp-1", focusPersonId: null } })
        );
        expect(modes.tasks.available).toBe(true);
    });
});
