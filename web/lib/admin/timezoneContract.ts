/**
 * Alloy Timezone Contract v1 — shared resolution (server).
 * Operational calendar: org metadata chain.
 * User-facing display: user_profiles.timezone → org metadata chain → UTC.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { withDbTiming } from "@/lib/admin/dbQueryTiming";

export const UTC_FALLBACK_IANA = "UTC";

export type OperationalTimezoneSource = "org_metadata" | "org_metadata_time_zone" | "utc_fallback";

export type UserDisplayTimezoneSource =
    | "user_profile"
    | "org_metadata"
    | "org_metadata_time_zone"
    | "utc_fallback";

export function isValidIanaTimeZone(tz: string): boolean {
    const s = tz.trim();
    if (!s) return false;
    try {
        Intl.DateTimeFormat(undefined, { timeZone: s });
        return true;
    } catch {
        return false;
    }
}

/** Pure: org_settings.metadata JSON → IANA + source (operational / display fallback chain). */
export function resolveOrgTimezoneFromMetadata(metadata: unknown): {
    iana: string;
    source: OperationalTimezoneSource;
} {
    const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
    const tzRaw =
        typeof meta.timezone === "string" && meta.timezone.trim()
            ? meta.timezone.trim()
            : typeof meta.time_zone === "string" && meta.time_zone.trim()
              ? meta.time_zone.trim()
              : "";
    if (!tzRaw) {
        return { iana: UTC_FALLBACK_IANA, source: "utc_fallback" };
    }
    if (!isValidIanaTimeZone(tzRaw)) {
        return { iana: UTC_FALLBACK_IANA, source: "utc_fallback" };
    }
    const source: OperationalTimezoneSource =
        typeof meta.timezone === "string" && meta.timezone.trim() ? "org_metadata" : "org_metadata_time_zone";
    return { iana: tzRaw, source };
}

export async function fetchOperationalTimezoneForOrg(
    supabase: SupabaseClient,
    orgId: string
): Promise<{ iana: string; source: OperationalTimezoneSource }> {
    return withDbTiming("org_settings.metadata_for_timezone", { orgId }, async () => {
        const { data, error } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
        if (error || !data) {
            return { iana: UTC_FALLBACK_IANA, source: "utc_fallback" };
        }
        return resolveOrgTimezoneFromMetadata((data as { metadata?: unknown }).metadata);
    });
}

/**
 * effectiveUserTimeZone for admin UI: user_profiles.timezone → org → UTC.
 */
export async function fetchEffectiveUserDisplayTimezone(
    supabase: SupabaseClient,
    params: { userId: string; orgId: string }
): Promise<{ iana: string; source: UserDisplayTimezoneSource }> {
    const { userId, orgId } = params;
    const { data: profile, error: profileErr } = await supabase
        .from("user_profiles")
        .select("timezone")
        .eq("id", userId)
        .maybeSingle();

    if (!profileErr && profile) {
        const raw = (profile as { timezone?: string | null }).timezone;
        if (typeof raw === "string" && raw.trim() && isValidIanaTimeZone(raw)) {
            return { iana: raw.trim(), source: "user_profile" };
        }
    }

    const orgResolved = await fetchOperationalTimezoneForOrg(supabase, orgId);
    return { iana: orgResolved.iana, source: orgResolved.source };
}
