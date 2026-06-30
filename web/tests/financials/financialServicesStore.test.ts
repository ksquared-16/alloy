import { describe, expect, it } from "vitest";
import {
    createFinancialService,
    listFinancialServices,
    updateFinancialService,
} from "@/lib/financials/services/financialServicesStore";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

function setup() {
    const store = createOperationalEnrollmentMockStore();
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

describe("financialServicesStore — switchboard metadata round-trip", () => {
    it("persists capabilities, default revenue category, and programs on create", async () => {
        const { supabase } = setup();
        const svc = await createFinancialService(supabase, ORG_ID, {
            label: "Full-Time Care",
            serviceType: "recurring",
            unit: "week",
            capabilities: { uses_rate_plans: false }, // override one off the recurring default
            defaultChargeCategory: "tuition",
            programs: ["Toddler", "Preschool"],
        });
        // recurring defaults filled, explicit override kept
        expect(svc.capabilities.creates_schedule).toBe(true);
        expect(svc.capabilities.uses_rate_plans).toBe(false);
        expect(svc.defaultChargeCategory).toBe("tuition");
        expect(svc.programs).toEqual(["Toddler", "Preschool"]);
    });

    it("merges a partial capability update without clobbering the rest", async () => {
        const { supabase } = setup();
        const created = await createFinancialService(supabase, ORG_ID, {
            label: "Full-Time Care",
            serviceType: "recurring",
            capabilities: { uses_rate_plans: false },
            defaultChargeCategory: "tuition",
        });
        const updated = await updateFinancialService(supabase, ORG_ID, {
            id: created.id,
            label: "Full-Time Care",
            serviceType: "recurring",
            capabilities: { creates_schedule: false }, // partial — only this one
        });
        expect(updated.capabilities.creates_schedule).toBe(false); // applied
        expect(updated.capabilities.uses_rate_plans).toBe(false); // preserved from prior
        expect(updated.capabilities.tracks_attendance).toBe(true); // default preserved
        expect(updated.defaultChargeCategory).toBe("tuition"); // not clobbered
    });

    it("lists services with normalized capabilities even when metadata is empty", async () => {
        const { store, supabase } = setup();
        store.financial_services.push({
            id: "svc-legacy",
            org_id: ORG_ID,
            service_key: "legacy",
            label: "Legacy",
            service_type: "one_time",
            unit: null,
            description: null,
            is_active: true,
            sort_order: 5,
            metadata: {},
        });
        const services = await listFinancialServices(supabase, ORG_ID);
        const legacy = services.find((s) => s.key === "legacy");
        expect(legacy).toBeDefined();
        // one-time default posture applied from an empty metadata blob
        expect(legacy?.capabilities.parent_portal_visible).toBe(true);
        expect(legacy?.capabilities.creates_schedule).toBe(false);
    });
});
