import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * Returns whether the org's configuration is locked (industry + entity labels cannot be changed).
 * Source of truth: org_settings.metadata.config_locked. Missing/null treated as false.
 */
export async function getOrgConfigLocked(orgId: string): Promise<boolean> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", orgId)
        .maybeSingle();

    if (error || data == null) {
        return false;
    }
    const metadata = (data as { metadata?: Record<string, unknown> }).metadata;
    if (metadata == null || typeof metadata !== "object") {
        return false;
    }
    return Boolean((metadata as { config_locked?: boolean }).config_locked);
}
