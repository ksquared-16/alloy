/**
 * Full internal flow: new org → tenant bootstrap → childcare demo seed.
 * Caller supplies a service-role Supabase client (e.g. createAdminClient()).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyTenantBootstrap } from "@/lib/admin/tenantBootstrap/applyTenantBootstrap";
import { CHILDCARE_TENANT_BOOTSTRAP_V1 } from "@/lib/admin/tenantBootstrap/childcareTenantBootstrapV1";
import { createOrgAndAssignAdmin, type CreateOrgParams } from "@/lib/dev/createOrgAndAssignAdmin";
import { seedChildcareDemo, type SeedChildcareDemoResult } from "@/lib/dev/seedChildcareDemo";

export type CreateChildcareDemoTenantResult =
    | {
          ok: true;
          org_id: string;
          slug: string;
          bootstrap: { summary: import("@/lib/admin/verticalBootstrap/types").VerticalBootstrapApplySummary };
          seed: Extract<SeedChildcareDemoResult, { ok: true }>;
      }
    | { ok: false; error: string; org_id?: string };

export async function createChildcareDemoTenant(
    supabase: SupabaseClient,
    orgParams: CreateOrgParams
): Promise<CreateChildcareDemoTenantResult> {
    const orgRes = await createOrgAndAssignAdmin(supabase, orgParams);
    if (!orgRes.ok) {
        return { ok: false, error: orgRes.error };
    }

    const { org_id: orgId, slug } = orgRes;

    const boot = await applyTenantBootstrap(supabase, orgId, CHILDCARE_TENANT_BOOTSTRAP_V1);
    if (!boot.ok) {
        return { ok: false, error: `tenant_bootstrap: ${boot.error}`, org_id: orgId };
    }

    const seed = await seedChildcareDemo(supabase, orgId);
    if (!seed.ok) {
        return { ok: false, error: `seed: ${seed.error}`, org_id: orgId };
    }

    return {
        ok: true,
        org_id: orgId,
        slug,
        bootstrap: { summary: boot.summary },
        seed,
    };
}
