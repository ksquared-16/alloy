import { describe, expect, it } from "vitest";
import { resolveLeadDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";

describe("resolveLeadDrawerCommandHeaderMeta", () => {
    it("builds identity meta row without stage or status", () => {
        const meta = resolveLeadDrawerCommandHeaderMeta(
            {
                "person.primary_contact_name": "Jamie Mitchell",
                "person.primary_email": "jamie@example.com",
                "person.primary_phone": "(541) 555-0100",
                _customer_name: "Mitchell Household",
            },
            {
                locationLabel: "South Campus",
                statusLabel: "Contact Attempted",
                stageLabel: "Qualification",
            },
        );
        expect(meta.metaRow).toBe("Jamie Mitchell · Mitchell Household · South Campus");
        expect(meta.contactRow).toBe("jamie@example.com · (541) 555-0100");
        expect(meta.metaRow).not.toContain("Qualification");
        expect(meta.metaRow).not.toContain("Contact Attempted");
    });
});
