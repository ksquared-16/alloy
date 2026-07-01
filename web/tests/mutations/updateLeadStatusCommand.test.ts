import { describe, expect, it } from "vitest";
import { ACTION_BUTTON_LIBRARY, actionRegistryEntryForKey } from "@/lib/admin/actions/actionDefinitionRegistry";
import { resolveDomainForCommand, LEAD_STATUS_DOMAIN } from "@/lib/mutations/leadStatusDomain";

describe("update_lead_status command registration", () => {
    it("is registered in ACTION_BUTTON_LIBRARY", () => {
        const entry = actionRegistryEntryForKey("update_lead_status");
        expect(entry).not.toBeNull();
        expect(entry?.key).toBe("update_lead_status");
        expect(entry?.category).toBe("status_lifecycle");
    });

    it("is NOT settingsConfigurable as a legacy action", () => {
        // update_lead_status IS settingsConfigurable (it's the new command)
        const entry = actionRegistryEntryForKey("update_lead_status");
        expect(entry?.settingsConfigurable).toBe(true);
    });

    it("update_status_add_note is marked as NOT settingsConfigurable (legacy)", () => {
        const legacy = actionRegistryEntryForKey("update_status_add_note");
        expect(legacy).not.toBeNull();
        expect(legacy?.settingsConfigurable).toBe(false);
    });
});

describe("update_lead_status domain mapping", () => {
    it("resolves to lead_status domain", () => {
        const domain = resolveDomainForCommand("update_lead_status");
        expect(domain).not.toBeNull();
        expect(domain?.key).toBe("lead_status");
    });

    it("lead_status domain points to opportunities.status_key", () => {
        expect(LEAD_STATUS_DOMAIN.canonicalField).toBe("opportunities.status_key");
        expect(LEAD_STATUS_DOMAIN.subjectType).toBe("opportunity");
    });

    it("does NOT map update_child_enrollment_status (different domain — not in V1 slice)", () => {
        expect(resolveDomainForCommand("update_child_enrollment_status")).toBeNull();
    });

    it("does NOT map generic update_status (no domain — rejected by runtime)", () => {
        expect(resolveDomainForCommand("update_status")).toBeNull();
    });
});

describe("domain isolation — regression checks", () => {
    it("lead_status domain does not touch OCM table", () => {
        const domain = resolveDomainForCommand("update_lead_status");
        expect(domain?.canonicalField).not.toContain("opportunity_customer_members");
        expect(domain?.subjectType).not.toBe("opportunity_customer_member");
    });

    it("lead_status domain does not touch person status", () => {
        const domain = resolveDomainForCommand("update_lead_status");
        expect(domain?.canonicalField).not.toContain("persons");
        expect(domain?.key).not.toBe("person_status");
    });
});
