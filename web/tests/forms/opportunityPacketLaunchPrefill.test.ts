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
    it("includes launch_surface when present on link metadata", () => {
        const ctx = pickLaunchContextForPacketSession({
            form_context_mode: "packet",
            packet_definition_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            launch_surface: "crm_opportunity",
            extra_ignored: true,
        });
        expect(ctx.launch_surface).toBe("crm_opportunity");
        expect("extra_ignored" in ctx).toBe(false);
    });
});
