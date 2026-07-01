import type { SupabaseClient } from "@supabase/supabase-js";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";

export type TourPublicBookingLinkRow = {
    id: string;
    org_id: string;
    opportunity_id: string;
    location_id: string;
    expires_at: string | null;
    is_active: boolean;
};

export type ResolveTourPublicBookingLinkFailure =
    | { code: "NOT_FOUND" | "INACTIVE" | "EXPIRED"; message: string };

export function decodePublicTourToken(raw: string): string {
    try {
        return decodeURIComponent(raw ?? "");
    } catch {
        return raw ?? "";
    }
}

/**
 * Resolve a plaintext tour public link token (hashed at rest). Used by Card 7 public routes (service role).
 */
export async function resolveTourPublicBookingLinkByToken(
    supabase: SupabaseClient,
    plaintextToken: string
): Promise<{ ok: true; row: TourPublicBookingLinkRow } | { ok: false; error: ResolveTourPublicBookingLinkFailure }> {
    const token = String(plaintextToken ?? "").trim();
    if (!token) {
        return { ok: false, error: { code: "NOT_FOUND", message: "Missing token" } };
    }
    const token_hash = hashFormLinkToken(token);
    const { data, error } = await supabase
        .from("tour_public_booking_links")
        .select("id, org_id, opportunity_id, location_id, expires_at, is_active")
        .eq("token_hash", token_hash)
        .maybeSingle();

    if (error || !data) {
        return { ok: false, error: { code: "NOT_FOUND", message: "Invalid or unknown link" } };
    }
    const row = data as TourPublicBookingLinkRow;
    if (!row.is_active) {
        return { ok: false, error: { code: "INACTIVE", message: "This link is not active" } };
    }
    if (row.expires_at) {
        const exp = new Date(row.expires_at).getTime();
        if (!Number.isNaN(exp) && exp < Date.now()) {
            return { ok: false, error: { code: "EXPIRED", message: "This link has expired" } };
        }
    }
    return { ok: true, row };
}
