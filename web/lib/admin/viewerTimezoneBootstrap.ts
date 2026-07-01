import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminOrgIdForUser } from "@/lib/admin/entityLabelsServer";
import {
    UTC_FALLBACK_IANA,
    fetchEffectiveUserDisplayTimezone,
    type UserDisplayTimezoneSource,
} from "@/lib/admin/timezoneContract";

export type AdminViewerTimezoneBootstrap = {
    iana: string;
    source: UserDisplayTimezoneSource;
};

/**
 * Server-only: resolved display timezone for the current admin user (org-scoped).
 */
export async function loadAdminViewerTimezoneBootstrap(userId: string): Promise<AdminViewerTimezoneBootstrap> {
    try {
        const orgId = await getAdminOrgIdForUser(userId);
        if (!orgId) {
            return { iana: UTC_FALLBACK_IANA, source: "utc_fallback" };
        }
        const supabase = createAdminClient();
        return fetchEffectiveUserDisplayTimezone(supabase, { userId, orgId });
    } catch (e) {
        console.error("[viewerTimezoneBootstrap] failed:", e);
        return { iana: UTC_FALLBACK_IANA, source: "utc_fallback" };
    }
}
