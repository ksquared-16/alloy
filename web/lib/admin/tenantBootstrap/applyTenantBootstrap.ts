import type { SupabaseClient } from "@supabase/supabase-js";
import { applyVerticalBootstrap } from "@/lib/admin/verticalBootstrap/applyVerticalBootstrap";
import { parseTenantBootstrapPayload } from "@/lib/admin/tenantBootstrap/parseTenantBootstrapPayload";
import type { TenantBootstrapApplyResult } from "@/lib/admin/tenantBootstrap/types";

export async function applyTenantBootstrap(
    supabase: SupabaseClient,
    orgId: string,
    rawPayload: unknown
): Promise<TenantBootstrapApplyResult> {
    const parsed = parseTenantBootstrapPayload(rawPayload);
    if (!parsed.ok) {
        return { ok: false, error: parsed.errors.join("; ") };
    }

    return applyVerticalBootstrap(supabase, orgId, parsed.payload.structural_config);
}
