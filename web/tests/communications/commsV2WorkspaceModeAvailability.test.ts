import { describe, expect, it } from "vitest";
import { assembleFamilyWorkspace } from "@/lib/communications/v2/familyWorkspace/assembleFamilyWorkspace";
import { resolveWorkspaceModeAvailability } from "@/lib/communications/v2/workspaceModeAvailability";
import type { FamilyCommunicationWorkspaceVM } from "@/lib/communications/v2/familyWorkspace/types";
import type { RawFamilyWorkspaceData } from "@/lib/communications/v2/familyWorkspace/loadFamilyWorkspaceData";

function minimalVm(overrides: Partial<FamilyCommunicationWorkspaceVM> = {}): FamilyCommunicationWorkspaceVM {
    return {
        family: { id: "c1", label: "Family", program: null, location: { id: null, label: null }, stage: null, ownerUserId: null, ownerLabel: null, lifecycleStage: "lead" },
        children: [],
        recipientGroups: [],
        eligibleRecipients: [],
        disabledRecipients: [],
        selectedRecipients: [],
        consentSummary: { byContact: {}, household: { email: "unset", sms: "unset", marketing: "unset" }, preferenceProfile: { email_transactional: "unset", sms_transactional: "unset", email_marketing: "unset", sms_marketing: "unset" }, preferenceProfilesByContact: {}, displayFlags: { email: true, sms: true, marketing: true } },
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

    it("Kurzman: active SMS provider + Kelly phone enables SMS mode; Kristi no phone does not block Kelly", () => {
        const kurzmanBindings = [
            { id: "email", channel: "email", provider: "resend", status: "active", secret_ref: "env:RESEND_API_KEY" },
            { id: "sms", channel: "sms", provider: "twilio", status: "active", secret_ref: "env:TWILIO_AUTH_TOKEN" },
        ];
        const raw: RawFamilyWorkspaceData = {
            customer: { id: "cust-kurzman", name: "Kurzman Family", status_key: "lead" },
            members: [
                { id: "cm-child-1", person_id: "p-child-1", display_name: "Child One", relationship: "child", is_active: true },
            ],
            customerPersons: [
                { person_id: "1624a9ea-c295-43fb-8523-98827dc7f731", role_type: "parent", is_primary: true },
                { person_id: "0e850943-2d68-46c7-8008-d24a389cff07", role_type: "parent", is_primary: false },
            ],
            opportunityPersons: [],
            opportunities: [{ id: "df771481-841f-4329-b7bb-c0a03d9fb621", customer_id: "cust-kurzman" }],
            persons: [
                {
                    id: "1624a9ea-c295-43fb-8523-98827dc7f731",
                    full_name: "Kelly Kurzman",
                    email: "kelly.kurzman@gmail.com",
                    phone: "6022904816",
                },
                {
                    id: "0e850943-2d68-46c7-8008-d24a389cff07",
                    full_name: "Kristi Kurzman",
                    email: null,
                    phone: null,
                },
                { id: "p-child-1", full_name: "Child One" },
            ],
            roleTypes: [{ key: "parent", label: "Parent" }],
            bindings: kurzmanBindings,
        };
        const vm = assembleFamilyWorkspace(raw, {
            customerId: "cust-kurzman",
            focusOpportunityId: "df771481-841f-4329-b7bb-c0a03d9fb621",
            composerChannel: "email",
        });
        const kelly = [...vm.eligibleRecipients, ...vm.disabledRecipients].find((r) => r.displayName === "Kelly Kurzman");
        const kristi = [...vm.eligibleRecipients, ...vm.disabledRecipients].find((r) => r.displayName === "Kristi Kurzman");
        expect(kelly?.phone).toBe("+16022904816");
        expect(kelly?.channels.sms.available).toBe(true);
        expect(kelly?.channels.sms.unavailableReason).toBeNull();
        expect(kristi?.channels.sms.available).toBe(false);
        expect(kristi?.channels.sms.unavailableReason).toBe("No phone on file");
        expect(vm.composerDraft.availableChannels.sms).toBe(true);

        const modes = resolveWorkspaceModeAvailability(vm);
        expect(modes.sms.available).toBe(true);
        expect(modes.sms.reason).toBeNull();
        expect(modes.email.available).toBe(true);
    });
});
