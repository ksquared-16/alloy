import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * Returns whether the org's configuration is locked (no config writes allowed).
 * Requires orgId from getAdminContext. Returns false if column missing or error.
 */
export async function getOrgConfigLocked(orgId: string): Promise<boolean> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("orgs")
        .select("config_locked")
        .eq("id", orgId)
        .maybeSingle();

    if (error || data == null) {
        return false;
    }
    return Boolean((data as { config_locked?: boolean }).config_locked);
}
