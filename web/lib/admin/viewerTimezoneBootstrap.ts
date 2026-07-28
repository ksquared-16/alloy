import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminOrgIdForUser } from "@/lib/admin/entityLabelsServer";
import {
    UTC_FALLBACK_IANA,
    fetchEffectiveUserDisplayTimezoneCached,
    type UserDisplayTimezoneSource,
} from "@/lib/admin/timezoneContract";

export type AdminViewerTimezoneBootstrap = {
    iana: string;
    source: UserDisplayTimezoneSource;
};

/**
 * Server-only: resolved display timezone for the current admin user (org-scoped).
 */
export async function loadAdminViewerTimezoneBootstrap(
    userId: string,
    /**
     * The caller's already-authoritative org id (from the admin gate / auth). When provided, skips the
     * redundant `getAdminOrgIdForUser` → `resolveAdminAccessCore` re-resolution — a measured ~1s of
     * duplicate access-core work per navigation, since the workspace layout already holds `auth.orgId`.
     * Omit only where the org is genuinely unknown (the function falls back to resolving it).
     */
    orgIdHint?: string | null,
): Promise<AdminViewerTimezoneBootstrap> {
    try {
        const orgId = orgIdHint?.trim() || (await getAdminOrgIdForUser(userId));
        if (!orgId) {
            return { iana: UTC_FALLBACK_IANA, source: "utc_fallback" };
        }
        const supabase = createAdminClient();
        // Reuse the EXISTING process cache (USER_DISPLAY_TZ_CACHE, 60 s TTL, keyed org+user — "safe per
        // org+user") instead of re-reading user_profiles + org metadata on every navigation. The bootstrap
        // was calling the uncached variant; the cached one already owns the correct lifetime/invalidation.
        const { iana, source } = await fetchEffectiveUserDisplayTimezoneCached(supabase, { userId, orgId });
        return { iana, source };
    } catch (e) {
        console.error("[viewerTimezoneBootstrap] failed:", e);
        return { iana: UTC_FALLBACK_IANA, source: "utc_fallback" };
    }
}
