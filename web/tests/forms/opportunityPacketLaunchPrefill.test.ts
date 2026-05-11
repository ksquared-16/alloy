import { describe, expect, it } from "vitest";
import { defaultOpportunityLaunchPrefillFieldMap } from "@/lib/forms/prefill/defaultOpportunityLaunchPrefillFieldMap";
import { pickLaunchContextForPacketSession } from "@/lib/forms/packets/formPacketService";

describe("defaultOpportunityLaunchPrefillFieldMap", () => {
    it("maps registry-aligned field ids to trusted prefill roots", () => {
        const m = defaultOpportunityLaunchPrefillFieldMap();
        expect(m.guardian_email).toBe("person.email");
        expect(m.customer_account_name).toBe("customer.name");
    });
});

describe("pickLaunchContextForPacketSession", () => {
    it("includes enrollment selection fields when present", () => {
        const ctx = pickLaunchContextForPacketSession({
            form_context_mode: "packet",
            packet_definition_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            selected_customer_member_id: "33333333-3333-4333-8333-333333333333",
            recipient_person_id: "66666666-6666-4666-8666-666666666666",
            delivery_intent: "email_later",
        });
        expect(ctx.selected_customer_member_id).toBe("33333333-3333-4333-8333-333333333333");
        expect(ctx.recipient_person_id).toBe("66666666-6666-4666-8666-666666666666");
        expect(ctx.delivery_intent).toBe("email_later");
    });
});
