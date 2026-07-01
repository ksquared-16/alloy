import { describe, expect, it, vi } from "vitest";
import { loadOpportunityRecordForEffectiveRequirements } from "@/lib/completion/loadRecordForEffectiveRequirements";

describe("loadOpportunityRecordForEffectiveRequirements", () => {
    it("selects only persisted opportunity columns and enriches department_id", async () => {
        const opportunitySelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                            id: "opp-1",
                            org_id: "org-1",
                            status_key: "lead",
                            metadata: { department_id: "dept-1", created_via: "create_lead" },
                            primary_person_id: "person-1",
                            customer_id: "cust-1",
                            location_id: "loc-1",
                            work_unit_id: "wu-1",
                        },
                        error: null,
                    }),
                }),
            }),
        });
        const ocmSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
        });
        const personSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                            id: "person-1",
                            first_name: "Josh",
                            last_name: "Jacobs",
                            email: null,
                            phone: null,
                        },
                        error: null,
                    }),
                }),
            }),
        });

        const from = vi.fn((table: string) => {
            if (table === "opportunities") return { select: opportunitySelect };
            if (table === "opportunity_customer_members") return { select: ocmSelect };
            if (table === "persons") return { select: personSelect };
            throw new Error(`unexpected table ${table}`);
        });

        const record = await loadOpportunityRecordForEffectiveRequirements(
            { from } as never,
            "org-1",
            "opp-1",
        );

        expect(opportunitySelect).toHaveBeenCalledWith(
            "id, org_id, status_key, metadata, primary_person_id, customer_id, location_id, work_unit_id",
        );
        expect(record?.department_id).toBe("dept-1");
        expect(record?._primary_person).toMatchObject({ first_name: "Josh", last_name: "Jacobs" });
    });
});
