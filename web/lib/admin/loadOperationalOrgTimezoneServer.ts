import { createAdminClient } from "@/lib/supabaseAdmin";
import { fetchOperationalTimezoneForOrg } from "@/lib/admin/timezoneContract";

/** Org-only IANA for operational defaults (not user display). */
export async function loadOperationalOrgTimezoneIana(orgId: string): Promise<string> {
    const supabase = createAdminClient();
    const { iana } = await fetchOperationalTimezoneForOrg(supabase, orgId);
    return iana;
}
