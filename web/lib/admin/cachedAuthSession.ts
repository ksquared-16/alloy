import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabaseServer";

/**
 * Request-scoped memoization (React `cache`) so routes that call both
 * `requireAdminOrOps` → `getCachedAuthUser` and `getAdminContext` → `getCachedAuthUserId`
 * share at most one `auth.getUser()` when JWT claims are absent.
 */
export const getCachedAuthUserId = cache(async (): Promise<string | null> => {
    try {
        const supabase = await createClient();
        const claimsRes = await supabase.auth.getClaims();
        if (!claimsRes.error && claimsRes.data?.claims) {
            const sub = (claimsRes.data.claims as { sub?: unknown }).sub;
            if (typeof sub === "string" && sub.length > 0) {
                return sub;
            }
        }
        const { data: authData, error: userErr } = await supabase.auth.getUser();
        if (userErr) {
            console.error("[getCachedAuthUserId] auth.getUser error:", userErr);
        }
        const uid = authData?.user?.id;
        return typeof uid === "string" && uid.length > 0 ? uid : null;
    } catch (e) {
        console.error("[getCachedAuthUserId] unexpected:", e);
        return null;
    }
});

export const getCachedAuthUser = cache(async (): Promise<User | null> => {
    try {
        const supabase = await createClient();
        const { data: authData, error } = await supabase.auth.getUser();
        if (error) {
            console.error("[getCachedAuthUser] auth.getUser error:", error);
            return null;
        }
        return authData?.user ?? null;
    } catch (e) {
        console.error("[getCachedAuthUser] unexpected:", e);
        return null;
    }
});
