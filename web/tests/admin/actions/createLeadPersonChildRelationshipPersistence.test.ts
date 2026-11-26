import { describe, expect, it, vi } from "vitest";
import { applyCanonicalChildScopedRelationships } from "@/lib/admin/actions/createLeadPersonChildRelationshipPersistence";

vi.mock("@/lib/fields/personChildRelationship/personChildRelationshipService", () => ({
    createPersonChildRelationship: vi.fn(async () => ({
        ok: true,
        relationship: { id: "rel-new", person_id: "p1", operational_roles: ["emergency_contact"] },
    })),
    getPersonChildRelationshipById: vi.fn(async () => null),
    addPersonChildRelationshipRole: vi.fn(async () => ({ ok: true })),
}));

describe("applyCanonicalChildScopedRelationships", () => {
    it("maps emergency_contact member role to canonical operational role", async () => {
        const supabase = {
            from() {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: null, error: null }),
                                }),
                            }),
                        }),
                    }),
                };
            },
        };

        const result = await applyCanonicalChildScopedRelationships(supabase as never, {
            orgId: "org-1",
            customerId: "cust-1",
            assignments: [
                {
                    customer_member_id: "member-1",
                    person_id: "person-alex",
                    role_key: "emergency_contact",
                },
            ],
        });

        expect(result.relationships_written).toBe(1);
    });
});
