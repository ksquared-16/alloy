import type { TenantBootstrapPayloadV1 } from "@/lib/admin/tenantBootstrap/types";
import { CHILDCARE_TENANT_BOOTSTRAP_V1 } from "@/lib/admin/tenantBootstrap/childcareTenantBootstrapV1";

/**
 * Stub cleaning / home-services tenant — derived once from childcare by renaming the Growth
 * department to `sales` (no mutation of CHILDCARE_TENANT_BOOTSTRAP_V1).
 */
function buildCleaningTenantBootstrapV1(): TenantBootstrapPayloadV1 {
    const j = JSON.parse(JSON.stringify(CHILDCARE_TENANT_BOOTSTRAP_V1)) as TenantBootstrapPayloadV1;
    j.org_profile = {
        industry_key: "cleaning",
        industry_label: "Cleaning & home services",
        display_name_hint: "Demo Cleaning Co",
    };
    j.growth_department_keys = ["sales"];
    j.starter_seed = { deferred: true, reference: "cleaning_v1" };

    const sc = j.structural_config;
    sc.vertical_key = "cleaning";
    if (sc.onboarding_context) {
        sc.onboarding_context.industry_key = "cleaning";
        sc.onboarding_context.industry_label = "Cleaning & home services";
    }

    for (const d of sc.departments) {
        if (d.key === "enrollment") {
            d.key = "sales";
            d.name = "Sales & scheduling";
            d.description = "Quotes, bookings, and customer pipeline (Growth).";
        }
    }

    for (const w of sc.work_units) {
        if (w.department_key === "enrollment") {
            w.department_key = "sales";
        }
    }

    return j;
}

export const CLEANING_TENANT_BOOTSTRAP_V1: TenantBootstrapPayloadV1 = buildCleaningTenantBootstrapV1();
