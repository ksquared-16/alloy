/**
 * Public short-link aliases for tour booking tokens.
 *
 * Reuses `action_links` (`/a/{short_code}`) — does not invent a third-party shortener.
 * Metadata carries only a same-origin `/tour-booking/…` path (no open redirect).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildShortActionLinkUrl, createActionLink } from "@/lib/actionLinks";

export const TOUR_BOOKING_ACTION_LINK_TYPE = "tour_booking_redirect";

const TOUR_BOOKING_PATH_RE = /^\/tour-booking\/[A-Za-z0-9._~-]+(?:\?option=[^&\s#]+)?$/;

export function isSafeTourBookingRedirectPath(path: string): boolean {
    const trimmed = String(path ?? "").trim();
    if (!trimmed.startsWith("/tour-booking/")) return false;
    if (trimmed.includes("://") || trimmed.includes("//") || trimmed.includes("\\")) return false;
    return TOUR_BOOKING_PATH_RE.test(trimmed.split("#")[0] ?? "");
}

export function tourBookingPathFromPublicUrl(publicUrl: string): string | null {
    try {
        const u = new URL(publicUrl);
        const path = `${u.pathname}${u.search}`;
        return isSafeTourBookingRedirectPath(path) ? path : null;
    } catch {
        // Relative path
        return isSafeTourBookingRedirectPath(publicUrl) ? publicUrl : null;
    }
}

/**
 * Mint a short `/a/{code}` alias that resolves to an existing tour-booking URL.
 * Returns the short public URL, or the original long URL when alias mint fails.
 */
export async function aliasTourBookingUrl(params: {
    supabase: SupabaseClient;
    orgId: string;
    invitationId: string;
    longUrl: string;
    /** Inherit invitation expiry when known; default 21 days. */
    expiresInMinutes?: number;
}): Promise<string> {
    const path = tourBookingPathFromPublicUrl(params.longUrl);
    if (!path) return params.longUrl;

    const created = await createActionLink(params.supabase, {
        org_id: params.orgId,
        action_type: TOUR_BOOKING_ACTION_LINK_TYPE,
        entity_type: "tour_invitation",
        entity_id: params.invitationId,
        expires_in_minutes: params.expiresInMinutes ?? 21 * 24 * 60,
        metadata: { redirect_path: path },
    });
    if (!created?.short_code) return params.longUrl;
    return buildShortActionLinkUrl(created.short_code) || params.longUrl;
}
