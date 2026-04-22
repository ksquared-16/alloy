/**
 * Internal childcare tenant spin-up — mirrors future onboarding:
 * create org → generate config → apply tenant bootstrap → seed demo data.
 * Reuses generateTenantConfig, applyTenantBootstrap, seedChildcareDemo (no duplicate SQL).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTenantConfig } from "@/lib/admin/configGenerator/generateTenantConfig";
import { applyTenantBootstrap } from "@/lib/admin/tenantBootstrap/applyTenantBootstrap";
import type { TenantBootstrapPayloadV1 } from "@/lib/admin/tenantBootstrap/types";
import { createOrgAndAssignAdmin, type CreateOrgParams } from "@/lib/dev/createOrgAndAssignAdmin";
import { seedChildcareDemo, type SeedChildcareDemoResult } from "@/lib/dev/seedChildcareDemo";

export type SpinChildcareTenantParams = CreateOrgParams & {
    /** Passed to generateTenantConfig; default childcare center wording. */
    configPrompt?: string;
};

export type SpinChildcareTenantFlowResult =
    | {
          ok: true;
          org_id: string;
          slug: string;
          tenant_payload: TenantBootstrapPayloadV1;
          bootstrap: { summary: import("@/lib/admin/verticalBootstrap/types").VerticalBootstrapApplySummary };
          seed: Extract<SeedChildcareDemoResult, { ok: true }>;
      }
    | { ok: false; error: string; org_id?: string; phase?: "org" | "bootstrap" | "seed" };

const DEFAULT_PROMPT = "We run a childcare center";

export async function spinChildcareTenantFlow(
    supabase: SupabaseClient,
    params: SpinChildcareTenantParams
): Promise<SpinChildcareTenantFlowResult> {
    const orgRes = await createOrgAndAssignAdmin(supabase, params);
    if (!orgRes.ok) {
        return { ok: false, phase: "org", error: orgRes.error };
    }

    const { org_id: orgId, slug } = orgRes;

    const tenant_payload = generateTenantConfig({
        prompt: params.configPrompt ?? DEFAULT_PROMPT,
    });

    const boot = await applyTenantBootstrap(supabase, orgId, tenant_payload);
    if (!boot.ok) {
        return { ok: false, phase: "bootstrap", error: `tenant_bootstrap: ${boot.error}`, org_id: orgId };
    }

    const seed = await seedChildcareDemo(supabase, orgId);
    if (!seed.ok) {
        return {
            ok: false,
            phase: "seed",
            org_id: orgId,
            error:
                `seed failed (tenant bootstrap already succeeded for org ${orgId}): ${seed.error}`,
        };
    }

    return {
        ok: true,
        org_id: orgId,
        slug,
        tenant_payload,
        bootstrap: { summary: boot.summary },
        seed,
    };
}
