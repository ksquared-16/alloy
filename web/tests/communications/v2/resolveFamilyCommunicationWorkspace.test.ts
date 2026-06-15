import { describe, it, expect } from "vitest";
import { assembleFamilyWorkspace } from "@/lib/communications/v2/familyWorkspace/resolveFamilyCommunicationWorkspace";
import type { RawFamilyWorkspaceData } from "@/lib/communications/v2/familyWorkspace/loadFamilyWorkspaceData";

const bindings = [
    { id: "b1", channel: "email", provider: "resend", status: "active", secret_ref: "sk_email" },
    { id: "b2", channel: "sms", provider: "twilio", status: "active", secret_ref: "sk_sms" },
];

function rivera(): RawFamilyWorkspaceData {
    return {
        customer: { id: "cust-1", name: "The Rivera Family", status_key: "lead" },
        members: [
            { id: "cm-1", person_id: "p-child1", display_name: "Elena Rivera", dob: "2021-04-01", relationship: "child", is_active: true },
            { id: "cm-2", person_id: "p-child2", display_name: "Mateo Rivera", dob: "2023-04-01", relationship: "child", is_active: true },
        ],
        customerPersons: [
            { person_id: "p-mom", role_type: "parent", is_primary: true },
            { person_id: "p-dad", role_type: "parent", is_primary: false },
            { person_id: "p-arch", role_type: "guardian", is_primary: false },
            { person_id: "p-child1", role_type: "child", is_primary: false },
        ],
        opportunityPersons: [{ person_id: "p-grandma", role_type: "emergency_contact", opportunity_id: "opp-1" }],
        opportunities: [{ id: "opp-1", customer_id: "cust-1", location_id: "loc-1" }],
        persons: [
            { id: "p-mom", full_name: "Sarah Rivera", email: "sarah@example.com", phone: "+15105550101" },
            { id: "p-dad", full_name: "Carlos Rivera", email: null, phone: "+15105550199" },
            { id: "p-arch", full_name: "Old Guardian", email: "old@example.com", phone: null, archived_at: "2020-01-01T00:00:00Z" },
            { id: "p-grandma", full_name: "Rosa Rivera", email: "rosa@example.com", phone: null },
            { id: "p-child1", full_name: "Elena Rivera" },
        ],
        roleTypes: [{ key: "parent", label: "Parent" }, { key: "emergency_contact", label: "Emergency contact" }],
        bindings,
    };
}

describe("assembleFamilyWorkspace", () => {
    it("builds structured children and excludes child persons from the roster", () => {
        const vm = assembleFamilyWorkspace(rivera(), { customerId: "cust-1", composerChannel: "email" });
        expect(vm.children.map((c) => c.name)).toEqual(["Elena Rivera", "Mateo Rivera"]);
        const ids = [...vm.eligibleRecipients, ...vm.disabledRecipients].map((r) => r.id);
        expect(ids).not.toContain("p-child1");
    });
    it("excludes archived persons entirely", () => {
        const vm = assembleFamilyWorkspace(rivera(), { customerId: "cust-1" });
        const ids = [...vm.eligibleRecipients, ...vm.disabledRecipients].map((r) => r.id);
        expect(ids).not.toContain("p-arch");
    });
    it("dad (no email) is disabled for email but present; mom eligible", () => {
        const vm = assembleFamilyWorkspace(rivera(), { customerId: "cust-1", composerChannel: "email" });
        expect(vm.eligibleRecipients.map((r) => r.id)).toContain("p-mom");
        expect(vm.disabledRecipients.map((r) => r.id)).toContain("p-dad");
        const dad = vm.disabledRecipients.find((r) => r.id === "p-dad");
        expect(dad?.channels.email.unavailableReason).toBe("No email on file");
        expect(dad?.channels.sms.available).toBe(true);
    });
    it("default selection is eligible primary only", () => {
        const vm = assembleFamilyWorkspace(rivera(), { customerId: "cust-1", composerChannel: "email" });
        expect(vm.selectedRecipients).toEqual(["p-mom"]);
    });
    it("opportunity-only adult is merged into secondary roster", () => {
        const vm = assembleFamilyWorkspace(rivera(), { customerId: "cust-1" });
        const grandma = [...vm.eligibleRecipients, ...vm.disabledRecipients].find((r) => r.id === "p-grandma");
        expect(grandma?.tier).toBe("secondary");
    });
    it("empty household still yields a valid VM", () => {
        const empty: RawFamilyWorkspaceData = { customer: { id: "c0", name: "Empty" }, members: [], customerPersons: [], opportunityPersons: [], opportunities: [], persons: [], roleTypes: [], bindings: [] };
        const vm = assembleFamilyWorkspace(empty, { customerId: "c0" });
        expect(vm.children).toEqual([]);
        expect(vm.recipientGroups).toEqual([]);
        expect(vm.selectedRecipients).toEqual([]);
        expect(vm.family.label).toBe("Empty");
    });
});
