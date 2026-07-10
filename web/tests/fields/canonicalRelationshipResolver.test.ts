import { describe, expect, it } from "vitest";
import type { CanonicalRelationshipResolveContext } from "@/lib/fields/relationship/canonicalRelationshipContext";
import { resolveCanonicalRelationshipFromDataBag } from "@/lib/fields/relationship/canonicalRelationshipResolver";
import { resolveRelationshipLeafFromPersonRow } from "@/lib/fields/relationship/resolveRelationshipLeafValue";
import { formsRelationshipPrefillStateFromResolution } from "@/lib/forms/prefill/formsRelationshipPrefillState";
import { formsRelationshipContextFromLaunch } from "@/lib/fields/relationship/canonicalRelationshipContext";

const CUSTOMER_ID = "cust-1";

function ctx(relationshipId: string, source: CanonicalRelationshipResolveContext["source"]): CanonicalRelationshipResolveContext {
    return {
        organizationId: "org-1",
        relationshipId,
        source,
        customerMemberId: source.entityType === "customer_member" ? source.recordId : null,
    };
}

describe("canonical relationship resolver contract", () => {
    it("returns unsupported for unknown relationship_id", () => {
        const resolution = resolveCanonicalRelationshipFromDataBag(
            ctx("person.contact_role.unknown", { entityType: "customer", recordId: CUSTOMER_ID }),
            {},
            CUSTOMER_ID,
        );
        expect(resolution.status).toBe("unsupported");
    });

    it("returns invalid_context when source entity is not allowed", () => {
        const resolution = resolveCanonicalRelationshipFromDataBag(
            ctx("person.contact_role.secondary", { entityType: "customer_member", recordId: "member-1" }),
            {},
            CUSTOMER_ID,
        );
        expect(resolution.status).toBe("invalid_context");
    });

    it("distinguishes missing from resolved-with-conflict for primary contact", () => {
        const missing = resolveCanonicalRelationshipFromDataBag(
            ctx("person.contact_role.primary", { entityType: "customer", recordId: CUSTOMER_ID }),
            { customerPersonRows: [], contactRow: null },
            CUSTOMER_ID,
        );
        expect(missing.status).toBe("missing");

        const conflict = resolveCanonicalRelationshipFromDataBag(
            ctx("person.contact_role.primary", { entityType: "customer", recordId: CUSTOMER_ID }),
            {
                contactRow: { person_id: "p1" },
                customerPersonRows: [
                    { customer_id: CUSTOMER_ID, person_id: "p2", role_type: "primary_contact", is_primary: true },
                ],
            },
            CUSTOMER_ID,
        );
        expect(conflict.status).toBe("resolved");
        expect(conflict.target_record_id).toBe("p2");
        expect(conflict.diagnostics).toContain("relationship_data_conflict");
    });
});

describe("Primary Contact resolution", () => {
    it("resolves singular primary from customer_persons", () => {
        const resolution = resolveCanonicalRelationshipFromDataBag(
            ctx("person.contact_role.primary", { entityType: "customer", recordId: CUSTOMER_ID }),
            {
                customerPersonRows: [
                    { customer_id: CUSTOMER_ID, person_id: "person-primary", role_type: "primary_contact", is_primary: true },
                ],
            },
            CUSTOMER_ID,
        );
        expect(resolution.status).toBe("resolved");
        expect(resolution.target_record_id).toBe("person-primary");
    });

    it("resolves leaf email through person row", () => {
        const value = resolveRelationshipLeafFromPersonRow(
            { email: "parent@example.com", full_name: "Pat Parent" },
            { role: "primary", leafKey: "email", leafProviderRefKey: "person.primary_email" },
        );
        expect(value).toBe("parent@example.com");
    });
});

describe("Guardian / Parents plural behavior", () => {
    it("parents role is collection-shaped — singular leaf unsupported", () => {
        const resolution = resolveCanonicalRelationshipFromDataBag(
            ctx("person.contact_role.parents", { entityType: "customer", recordId: CUSTOMER_ID }),
            {
                customerPersonRows: [
                    { customer_id: CUSTOMER_ID, person_id: "g1", role_type: "guardian" },
                ],
            },
            CUSTOMER_ID,
        );
        expect(resolution.status).toBe("unsupported");
    });
});

describe("Secondary Contact resolution", () => {
    it("secondary role is collection-shaped — unavailable even with one row", () => {
        const resolution = resolveCanonicalRelationshipFromDataBag(
            ctx("person.contact_role.secondary", { entityType: "customer", recordId: CUSTOMER_ID }),
            {
                customerPersonRows: [
                    { customer_id: CUSTOMER_ID, person_id: "s1", role_type: "secondary_contact" },
                ],
            },
            CUSTOMER_ID,
        );
        expect(resolution.status).toBe("unsupported");
    });

    it("billing role is collection-shaped — unavailable", () => {
        const resolution = resolveCanonicalRelationshipFromDataBag(
            ctx("person.contact_role.billing", { entityType: "customer", recordId: CUSTOMER_ID }),
            {
                customerPersonRows: [
                    { customer_id: CUSTOMER_ID, person_id: "b1", role_type: "billing_contact" },
                ],
            },
            CUSTOMER_ID,
        );
        expect(resolution.status).toBe("unsupported");
    });
});

describe("Emergency and Billing contacts", () => {
    it("emergency role is contextual collection — singular leaf unsupported", () => {
        const resolution = resolveCanonicalRelationshipFromDataBag(
            ctx("person.contact_role.emergency", { entityType: "customer_member", recordId: "member-1" }),
            {
                customerMemberContactLinks: [
                    {
                        customer_member_id: "member-1",
                        role_key: "emergency_contact",
                        is_active: true,
                        contact: { person_id: "e1" },
                    },
                ],
            },
            CUSTOMER_ID,
        );
        expect(resolution.status).toBe("unsupported");
    });
});

describe("Forms relationship context adapter", () => {
    it("builds customer context from launch fks", () => {
        const context = formsRelationshipContextFromLaunch({
            orgId: "org-1",
            relationshipId: "person.contact_role.primary",
            customerId: CUSTOMER_ID,
        });
        expect(context?.source.entityType).toBe("customer");
        expect(context?.source.recordId).toBe(CUSTOMER_ID);
    });

    it("returns null for blank public form without relationship root", () => {
        expect(
            formsRelationshipContextFromLaunch({
                orgId: "org-1",
                relationshipId: "person.contact_role.primary",
            }),
        ).toBeNull();
    });

    it("prefill UX states distinguish missing from ambiguous", () => {
        const missing = formsRelationshipPrefillStateFromResolution({ status: "missing", role: "primary" });
        const ambiguous = formsRelationshipPrefillStateFromResolution({ status: "ambiguous", role: "primary" });
        expect(missing.kind).toBe("missing");
        expect(ambiguous.kind).toBe("ambiguous");
        expect(missing.kind === 'missing' ? missing.label : '').not.toBe(ambiguous.kind === 'ambiguous' ? ambiguous.label : '');
    });
});

describe("P3A operational gates", () => {
    it("registers all roles in resolver but keeps picker primary-only", async () => {
        const mod = await import("@/lib/fields/formsRelationshipOperationalSupport");
        expect(mod.isFormsRelationshipResolverRegistered("primary")).toBe(true);
        expect(mod.isFormsRelationshipResolverRegistered("emergency")).toBe(true);
        expect(mod.isFormsRelationshipAuthorableInP2(
            { kind: "relationship", refKey: "person.contact_role.billing.email", relationship: { leaf_key: "email" } } as never,
        )).toBe(false);
    });
});
