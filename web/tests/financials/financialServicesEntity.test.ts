import { describe, expect, it } from "vitest";
import {
    createFinancialService,
    listFinancialServices,
    setFinancialServiceActive,
    updateFinancialService,
} from "@/lib/financials/services/financialServicesStore";
import { createRatePlan } from "@/lib/financials/rates/rateAuthoringService";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

function setup() {
    const store = createOperationalEnrollmentMockStore();
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

describe("financial_services — first-class entity (Commercial Model)", () => {
    it("creates, lists, edits, and toggles services in the table", async () => {
        const { store, supabase } = setup();
        const created = await createFinancialService(supabase, ORG_ID, { label: "Full-Time Care", serviceType: "recurring", unit: "month" }, "user-1");
        expect(created).toMatchObject({ key: "full_time_care", serviceType: "recurring", unit: "month", isActive: true });
        expect(store.financial_services).toHaveLength(1);

        const listed = await listFinancialServices(supabase, ORG_ID);
        expect(listed.map((s) => s.key)).toEqual(["full_time_care"]);

        const edited = await updateFinancialService(supabase, ORG_ID, { id: created.id, label: "Full-Time Care", serviceType: "recurring", description: "5 days/week" });
        expect(edited.description).toBe("5 days/week");

        const toggled = await setFinancialServiceActive(supabase, ORG_ID, created.id, false);
        expect(toggled.isActive).toBe(false);
    });

    it("rejects a duplicate service key", async () => {
        const { supabase } = setup();
        await createFinancialService(supabase, ORG_ID, { label: "Meals", serviceType: "usage" });
        await expect(createFinancialService(supabase, ORG_ID, { label: "Meals", serviceType: "usage" })).rejects.toMatchObject({
            code: "conflict",
        });
    });

    it("rejects an invalid service type", async () => {
        const { supabase } = setup();
        await expect(createFinancialService(supabase, ORG_ID, { label: "X", serviceType: "nope" })).rejects.toMatchObject({
            code: "invalid_input",
        });
    });
});

describe("Rate Plan → Service relationship", () => {
    it("stores service_id on a created rate plan and carries it through versions", async () => {
        const { store, supabase } = setup();
        const service = await createFinancialService(supabase, ORG_ID, { label: "Full-Time Care", serviceType: "recurring" });
        const plan = await createRatePlan(supabase, {
            orgId: ORG_ID,
            scopeType: "org",
            planKey: "standard_tuition",
            serviceId: service.id,
            billingBasis: "monthly",
            effectiveStart: "2026-01-01",
        });
        expect(plan.service_id).toBe(service.id);
        expect((store.childcare_rate_plans[0] as { service_id?: string }).service_id).toBe(service.id);
    });
});
