import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    UTC_FALLBACK_IANA,
    fetchOperationalTimezoneForOrg,
    isValidIanaTimeZone,
} from "@/lib/admin/timezoneContract";

/** Org operational IANA for public booking when `ALLOY_PUBLIC_ORG_ID` is set; else UTC. */
export async function resolvePublicBookingOperationalTimezoneIana(): Promise<string> {
    const orgId = process.env.ALLOY_PUBLIC_ORG_ID?.trim();
    if (!orgId) return UTC_FALLBACK_IANA;
    try {
        const supabase = createAdminClient();
        const { iana } = await fetchOperationalTimezoneForOrg(supabase, orgId);
        return isValidIanaTimeZone(iana) ? iana : UTC_FALLBACK_IANA;
    } catch {
        return UTC_FALLBACK_IANA;
    }
}
