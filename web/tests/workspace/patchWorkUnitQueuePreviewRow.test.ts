import { describe, expect, it } from "vitest";
import type { OpportunityQueueRowDisplayPatch } from "@/lib/admin/opportunityQueueRowDisplayPatch";
import { buildQueueRowDisplayPatchFromPersonSave } from "@/lib/admin/opportunityQueueRowDisplayPatch";
import {
    patchWorkUnitQueueApiRow,
    patchWorkUnitQueuePreviewItem,
    patchWorkUnitQueuePreviewItems,
} from "@/lib/workspace/patchWorkUnitQueuePreviewRow";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

describe("patchWorkUnitQueuePreviewRow", () => {
    const personPatch = buildQueueRowDisplayPatchFromPersonSave({
        personId: "p1",
        patch: { email: "new@example.com", phone: "5559990000" },
        person: { first_name: "Sam", last_name: "Lee", email: "new@example.com", phone: "5559990000" },
    });

    it("patches API preview row primary contact mirrors", () => {
        const row = {
            id: "opp-1",
            _customer_name: "Lee Family",
            _primary_contact_line: "Sam Lee",
            _primary_phone: "555-111-2222",
            _primary_email: "old@example.com",
            _crm_compact_children: [{ primary: "Sam Lee (5y)", secondary: "Toddler" }],
        };
        const patched = patchWorkUnitQueueApiRow(row, "opp-1", personPatch);
        expect(patched).not.toBeNull();
        expect(patched!._primary_email).toBe("new@example.com");
        expect(patched!._primary_phone).toBe("(555) 999-0000");
    });

    it("patches queue preview VM semantic slots", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            opportunityId: "opp-1",
            title: "Lee Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Lee Family",
                childName: "Sam Lee (5y)",
                stageLabel: null,
                statusLabel: "New",
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactDisplayName: "Sam Lee",
                contactPhoneDisplay: "555-111-2222",
                contactEmail: "old@example.com",
                familyNote: null,
            },
        };
        const patched = patchWorkUnitQueuePreviewItem(item, "opp-1", personPatch);
        expect(patched?.semanticCrmCompact?.contactEmail).toBe("new@example.com");
        expect(patched?.semanticCrmCompact?.contactPhoneDisplay).toBe("(555) 999-0000");
    });

    it("patchWorkUnitQueuePreviewItems returns null when no row matches", () => {
        const items: QueuePreviewItemVm[] = [
            { id: "opp-2", title: "Other", quickActions: [] },
        ];
        expect(patchWorkUnitQueuePreviewItems(items, "opp-1", personPatch)).toBeNull();
    });

    it("buildQueueRowDisplayPatchFromPersonSave includes child primary when DOB present", () => {
        const patch = buildQueueRowDisplayPatchFromPersonSave({
            personId: "p1",
            patch: { date_of_birth: "2019-06-01" },
            person: { first_name: "Sam", last_name: "Lee", date_of_birth: "2019-06-01" },
        });
        expect(patch.child?.primary).toMatch(/Sam Lee/);
    });
});
