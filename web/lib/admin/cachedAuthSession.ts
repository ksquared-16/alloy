import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabaseServer";
import { logDbTiming } from "@/lib/admin/dbQueryTiming";
import { getCachedJwks } from "@/lib/auth/jwksCache";
import { getSupabaseAnonKeyForAuth, getSupabaseUrlForAuth } from "@/lib/supabase/auth-env";

type AuthSessionState = {
    userId: string | null;
    user: User | null;
    authSource: "claims" | "getUser" | "none";
};

/**
 * One Supabase auth resolution per HTTP request.
 * `getCachedAuthUserId` may resolve via JWT claims without `getUser()`.
 * `getCachedAuthUser` reuses the same session and loads the full User at most once.
 */
const resolveAuthSessionOnce = cache(async (): Promise<AuthSessionState> => {
    const t0 = Date.now();
    let source: AuthSessionState["authSource"] = "none";
    try {
        const supabase = await createClient();
        /**
         * The key set must be supplied from the process cache. auth-js caches JWKS on the
         * GoTrueClient INSTANCE, and `createClient()` builds a fresh one per request, so this
         * "local" verification was refetching `/.well-known/jwks.json` from the remote Auth server
         * on every request — measured at ~200ms each. See `lib/auth/jwksCache.ts`.
         */
        const jwks = await getCachedJwks(getSupabaseUrlForAuth() ?? "", getSupabaseAnonKeyForAuth() ?? "");
        const claimsRes = await supabase.auth.getClaims(undefined, jwks ? { jwks } : undefined);
        if (!claimsRes.error && claimsRes.data?.claims) {
            const sub = (claimsRes.data.claims as { sub?: unknown }).sub;
            if (typeof sub === "string" && sub.length > 0) {
                source = "claims";
                return { userId: sub, user: null, authSource: source };
            }
        }
        const { data: authData, error: userErr } = await supabase.auth.getUser();
        if (userErr) {
            console.error("[resolveAuthSessionOnce] auth.getUser error:", userErr);
        }
        const user = authData?.user ?? null;
        const uid = user?.id;
        source = "getUser";
        return {
            userId: typeof uid === "string" && uid.length > 0 ? uid : null,
            user,
            authSource: source,
        };
    } catch (e) {
        console.error("[resolveAuthSessionOnce] unexpected:", e);
        return { userId: null, user: null, authSource: "none" };
    } finally {
        logDbTiming("auth.session_resolve", Date.now() - t0, { source });
    }
});

export const getCachedAuthUserId = cache(async (): Promise<string | null> => {
    const session = await resolveAuthSessionOnce();
    return session.userId;
});

export const getCachedAuthUser = cache(async (): Promise<User | null> => {
    const session = await resolveAuthSessionOnce();
    if (session.user) return session.user;
    if (!session.userId) return null;
    if (session.authSource === "claims") {
        try {
            const supabase = await createClient();
            const t0 = Date.now();
            const { data: authData, error } = await supabase.auth.getUser();
            logDbTiming("auth.cached_user_hydrate", Date.now() - t0, { source: "claims_followup" });
            if (error) {
                console.error("[getCachedAuthUser] auth.getUser error:", error);
                return null;
            }
            session.user = authData?.user ?? null;
            return session.user;
        } catch (e) {
            console.error("[getCachedAuthUser] unexpected:", e);
            return null;
        }
    }
    return null;
});
