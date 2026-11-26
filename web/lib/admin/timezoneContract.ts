/**
 * Alloy Timezone Contract v1 — shared resolution (server).
 * Operational calendar: org metadata chain.
 * User-facing display: user_profiles.timezone → org metadata chain → UTC.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { withDbTiming } from "@/lib/admin/dbQueryTiming";
import { processMap } from "@/lib/perf/processCache";

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

const ORG_OP_TZ_PROCESS_CACHE = processMap<string, { at: number; iana: string; source: OperationalTimezoneSource }>("org_op_tz");
const ORG_OP_TZ_TTL_MS = 90_000;
const ORG_OP_TZ_CACHE_ENABLED = process.env.NODE_ENV !== "test";

export type OperationalTimezoneResolved = {
    iana: string;
    source: OperationalTimezoneSource;
    /** Short-TTL hit on this Node process (`false` means we called `org_settings`). */
    cacheHit: boolean;
};

export async function fetchOperationalTimezoneForOrg(
    supabase: SupabaseClient,
    orgId: string
): Promise<{ iana: string; source: OperationalTimezoneSource }> {
    const r = await fetchOperationalTimezoneForOrgWithCache(supabase, orgId);
    return { iana: r.iana, source: r.source };
}

export async function fetchOperationalTimezoneForOrgWithCache(
    supabase: SupabaseClient,
    orgId: string
): Promise<OperationalTimezoneResolved> {
    const now = Date.now();
    if (ORG_OP_TZ_CACHE_ENABLED) {
        const ent = ORG_OP_TZ_PROCESS_CACHE.get(orgId);
        if (ent && now - ent.at < ORG_OP_TZ_TTL_MS) {
            return { iana: ent.iana, source: ent.source, cacheHit: true };
        }
    }
    const resolved = await withDbTiming("org_settings.metadata_for_timezone", { orgId }, async () => {
        const { data, error } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
        if (error || !data) {
            return { iana: UTC_FALLBACK_IANA, source: "utc_fallback" as OperationalTimezoneSource };
        }
        return resolveOrgTimezoneFromMetadata((data as { metadata?: unknown }).metadata);
    });
    if (ORG_OP_TZ_CACHE_ENABLED) {
        ORG_OP_TZ_PROCESS_CACHE.set(orgId, { at: Date.now(), iana: resolved.iana, source: resolved.source });
    }
    return { ...resolved, cacheHit: false };
}

const USER_DISPLAY_TZ_TTL_MS = 60_000;
const USER_DISPLAY_TZ_CACHE = processMap<
    string,
    { at: number; iana: string; source: UserDisplayTimezoneSource }
>("user_display_tz");

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

/** Process-scoped cache for hot queue/bootstrap paths — safe per org+user. */
export async function fetchEffectiveUserDisplayTimezoneCached(
    supabase: SupabaseClient,
    params: { userId: string; orgId: string }
): Promise<{ iana: string; source: UserDisplayTimezoneSource; cacheHit: boolean }> {
    const key = `${params.orgId}\u0001${params.userId}`;
    const now = Date.now();
    const hit = USER_DISPLAY_TZ_CACHE.get(key);
    if (hit && now - hit.at < USER_DISPLAY_TZ_TTL_MS) {
        return { iana: hit.iana, source: hit.source, cacheHit: true };
    }
    const resolved = await fetchEffectiveUserDisplayTimezone(supabase, params);
    USER_DISPLAY_TZ_CACHE.set(key, { at: now, iana: resolved.iana, source: resolved.source });
    return { ...resolved, cacheHit: false };
}

export function clearUserDisplayTimezoneCacheForTests(): void {
    USER_DISPLAY_TZ_CACHE.clear();
}
