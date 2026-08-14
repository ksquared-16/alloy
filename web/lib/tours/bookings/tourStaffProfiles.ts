/**
 * Resolve canonical staff user profiles for Tour internal calendar recipients.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type TourStaffProfile = {
    userId: string;
    email: string | null;
    displayName: string | null;
};

export async function resolveTourStaffProfile(
    supabase: SupabaseClient,
    userId: string,
): Promise<TourStaffProfile | null> {
    const id = String(userId ?? "").trim();
    if (!id) return null;

    const { data, error } = await supabase.auth.admin.getUserById(id);
    if (error || !data?.user) return null;

    const email =
        typeof data.user.email === "string" && data.user.email.trim() ? data.user.email.trim() : null;
    const meta = data.user.user_metadata;
    const displayRaw =
        meta && typeof meta === "object"
            ? (meta as { full_name?: unknown; name?: unknown }).full_name
              ?? (meta as { name?: unknown }).name
            : null;
    const displayName =
        typeof displayRaw === "string" && displayRaw.trim() ? displayRaw.trim() : null;
    return { userId: id, email, displayName };
}

export async function resolveTourStaffProfiles(
    supabase: SupabaseClient,
    userIds: readonly string[],
): Promise<TourStaffProfile[]> {
    const ids = [...new Set(userIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
    const out: TourStaffProfile[] = [];
    for (const id of ids) {
        const profile = await resolveTourStaffProfile(supabase, id);
        if (profile) out.push(profile);
    }
    return out;
}
