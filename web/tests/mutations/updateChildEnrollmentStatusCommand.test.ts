import { describe, expect, it } from "vitest";
import { actionRegistryEntryForKey } from "@/lib/admin/actions/actionDefinitionRegistry";
import { getDomainHandlerForCommand, resolveDomainForCommand } from "@/lib/mutations/domainRegistry";
import { ENROLLMENT_STATUS_DOMAIN } from "@/lib/mutations/domains/enrollmentStatus";
import { LEAD_STATUS_DOMAIN } from "@/lib/mutations/domains/leadStatus";

describe("update_child_enrollment_status command registration", () => {
    it("is registered in ACTION_BUTTON_LIBRARY", () => {
        const entry = actionRegistryEntryForKey("update_child_enrollment_status");
        expect(entry).not.toBeNull();
        expect(entry?.key).toBe("update_child_enrollment_status");
        expect(entry?.category).toBe("status_lifecycle");
        expect(entry?.settingsConfigurable).toBe(true);
    });
});

describe("update_child_enrollment_status domain mapping", () => {
    it("resolves to enrollment_status domain", () => {
        const domain = resolveDomainForCommand("update_child_enrollment_status");
        expect(domain).not.toBeNull();
        expect(domain?.key).toBe("enrollment_status");
    });

    it("enrollment_status domain points to opportunity_customer_members.outcome_status_key", () => {
        expect(ENROLLMENT_STATUS_DOMAIN.canonicalField).toBe(
            "opportunity_customer_members.outcome_status_key"
        );
        expect(ENROLLMENT_STATUS_DOMAIN.subjectType).toBe("opportunity_customer_member");
    });

    it("handler entityType is opportunity_customer_members", () => {
        const handler = getDomainHandlerForCommand("update_child_enrollment_status");
        expect(handler?.entityType).toBe("opportunity_customer_members");
    });
});

describe("domain isolation — regression checks", () => {
    it("enrollment_status domain does NOT touch opportunities table", () => {
        expect(ENROLLMENT_STATUS_DOMAIN.canonicalField).not.toContain("opportunities.status_key");
        expect(ENROLLMENT_STATUS_DOMAIN.subjectType).not.toBe("opportunity");
    });

    it("enrollment_status domain does NOT touch persons or customers", () => {
        expect(ENROLLMENT_STATUS_DOMAIN.canonicalField).not.toContain("persons");
        expect(ENROLLMENT_STATUS_DOMAIN.canonicalField).not.toContain("customers");
    });

    it("lead_status domain does NOT touch OCM table", () => {
        expect(LEAD_STATUS_DOMAIN.canonicalField).not.toContain("opportunity_customer_members");
    });

    it("update_lead_status resolves lead domain, not enrollment domain", () => {
        const domain = resolveDomainForCommand("update_lead_status");
        expect(domain?.key).toBe("lead_status");
        expect(domain?.key).not.toBe("enrollment_status");
    });

    it("update_child_enrollment_status resolves enrollment domain, not lead domain", () => {
        const domain = resolveDomainForCommand("update_child_enrollment_status");
        expect(domain?.key).toBe("enrollment_status");
        expect(domain?.key).not.toBe("lead_status");
    });

    it("generic update_status is not registered", () => {
        expect(resolveDomainForCommand("update_status")).toBeNull();
        expect(getDomainHandlerForCommand("update_status")).toBeNull();
    });
});

describe("enrollment domain handler shape", () => {
    it("has evaluateReadiness hook", () => {
        const handler = getDomainHandlerForCommand("update_child_enrollment_status");
        expect(typeof handler?.evaluateReadiness).toBe("function");
    });

    it("lead status handler does NOT have evaluateReadiness hook", () => {
        const handler = getDomainHandlerForCommand("update_lead_status");
        // V1: no readiness gating for lead status
        expect(handler?.evaluateReadiness).toBeUndefined();
    });
});
