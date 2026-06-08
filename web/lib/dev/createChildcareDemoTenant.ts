/**
 * Thin alias around `spinChildcareTenantFlow` (same behavior) for callers that only need org params.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { spinChildcareTenantFlow } from "@/lib/dev/spinChildcareTenantFlow";
import type { CreateOrgParams } from "@/lib/dev/createOrgAndAssignAdmin";
import type { SeedChildcareDemoResult } from "@/lib/dev/seedChildcareDemo";

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
    const r = await spinChildcareTenantFlow(supabase, orgParams);
    if (!r.ok) {
        return r;
    }
    return {
        ok: true,
        org_id: r.org_id,
        slug: r.slug,
        bootstrap: r.bootstrap,
        seed: r.seed,
    };
}
