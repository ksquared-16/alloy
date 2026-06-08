import { describe, expect, it } from "vitest";
import { CHILDCARE_TENANT_BOOTSTRAP_V1 } from "@/lib/admin/tenantBootstrap/childcareTenantBootstrapV1";
import { parseTenantBootstrapPayload } from "@/lib/admin/tenantBootstrap/parseTenantBootstrapPayload";

describe("parseTenantBootstrapPayload", () => {
    it("accepts childcare tenant reference payload", () => {
        const r = parseTenantBootstrapPayload(CHILDCARE_TENANT_BOOTSTRAP_V1);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.payload.org_profile.industry_key).toBe("childcare");
            expect(r.payload.growth_department_keys).toEqual(["enrollment"]);
            expect(r.payload.structural_config.departments).toHaveLength(5);
            expect(r.payload.structural_config.work_units.length).toBeGreaterThanOrEqual(8);
            expect(r.payload.starter_seed?.reference).toBe("childcare_v1");
        }
    });

    it("rejects scaffold department listed as growth", () => {
        const bad = {
            ...CHILDCARE_TENANT_BOOTSTRAP_V1,
            growth_department_keys: ["operations"],
        };
        const r = parseTenantBootstrapPayload(bad);
        expect(r.ok).toBe(false);
    });
});
