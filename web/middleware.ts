import { createServerClient } from "@supabase/ssr";

import { getCachedJwks } from "@/lib/auth/jwksCache";
import { NextResponse, type NextRequest } from "next/server";
import {
    getSupabaseAnonKeyForAuth,
    getSupabaseUrlForAuth,
    warnIfAuthSupabaseUrlMismatch,
} from "@/lib/supabase/auth-env";
import {
    isOperatorAdminPath,
    legacyAdminRedirectTarget,
    normalizeTransitionalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";
import {
    isSettingsCompatibilityPath,
    operatorLoginRedirectPath,
    requiresOperatorSession,
} from "@/lib/admin/operatorSessionGate";
import {
    ROUTE_TIMING_HEADER_AUTH_MS,
    ROUTE_TIMING_HEADER_T0,
    routeTimingEnabled,
} from "@/lib/perf/routeTimingDiagnostic";

let didWarnAuthUrlMismatch = false;

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    /**
     * PE-3: middleware runs on EVERY matched request — the document and every `/api/*` call on the
     * page — and completes before the route handler starts, so its cost is invisible to
     * `ProvisioningTimings`. It is reported via response headers because middleware finishes
     * before the first byte.
     *
     * This used to call `supabase.auth.getUser()`, which asks the remote Auth server who the user
     * is. Measured on a qualified host: **377ms p50 per request, 48% of total API request time**,
     * paid ~15x on a single Work Unit load — and then DISCARDED for `/api/*`, because the route
     * gate resolves identity independently.
     *
     * It now resolves through `getClaims()`, verifying the JWT signature locally with WebCrypto,
     * exactly as the canonical route-layer resolver in `lib/admin/cachedAuthSession.ts` already
     * does. `getUser()` remains the fallback, so a project on symmetric (HS*) keys — where
     * `getClaims` cannot verify locally — behaves precisely as before.
     */
    const mwT0 = routeTimingEnabled() ? Date.now() : 0;

    /**
     * Provider delivery webhooks (Twilio SMS status callbacks, Resend lifecycle) are intentionally
     * **public HTTPS endpoints**. They MUST NOT rely on Alloy admin/session auth at the edge.
     */
    if (
        pathname === "/api/webhooks/twilio/sms-status" ||
        pathname === "/api/webhooks/resend"
    ) {
        return NextResponse.next();
    }

    /** Phase H1: legacy `/admin/*` bookmarks → canonical settings/workspace (legacy drawer retired). */
    const legacyTarget = legacyAdminRedirectTarget(pathname);
    if (legacyTarget) {
        const url = request.nextUrl.clone();
        url.pathname = legacyTarget;
        const res = NextResponse.redirect(url);
        res.headers.set("x-alloy-admin-mw", `legacy-redirect:${legacyTarget}`);
        return res;
    }

    /** Phase H1: `/adminV2`, `/admin/v2` → canonical `/admin`. */
    const transitionalTarget = normalizeTransitionalAdminPath(pathname);
    if (transitionalTarget && transitionalTarget !== pathname) {
        const url = request.nextUrl.clone();
        url.pathname = transitionalTarget;
        const res = NextResponse.redirect(url);
        res.headers.set("x-alloy-admin-mw", `canonical-redirect:${transitionalTarget}`);
        return res;
    }

    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabaseUrl = getSupabaseUrlForAuth();
    const supabaseAnonKey = getSupabaseAnonKeyForAuth();

    if (!supabaseUrl || !supabaseAnonKey) {
        if (requiresOperatorSession(pathname) || isSettingsCompatibilityPath(pathname)) {
            console.error(
                "[MIDDLEWARE] Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY)."
            );
            const res = NextResponse.redirect(new URL("/login?error=config", request.url));
            res.headers.set("x-alloy-admin-mw", "redirect:/login?error=config");
            return res;
        }
        return response;
    }

    if (!didWarnAuthUrlMismatch) {
        didWarnAuthUrlMismatch = true;
        warnIfAuthSupabaseUrlMismatch();
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) =>
                    request.cookies.set(name, value)
                );
                response = NextResponse.next({
                    request: {
                        headers: request.headers,
                    },
                });
                cookiesToSet.forEach(({ name, value, options }) =>
                    response.cookies.set(name, value, options)
                );
            },
        },
    });

    const authStartedAt = routeTimingEnabled() ? Date.now() : 0;

    /**
     * `getClaims()` verifies the token's signature against the project's public JWKS and validates
     * `exp`. It is NOT a bare decode. The key set is cached per process — without that, auth-js
     * caches JWKS on the client INSTANCE, and a fresh client per request means "local
     * verification" still costs a round trip to `/.well-known/jwks.json`.
     *
     * A `kid` the cache does not hold (key rotation) falls through to auth-js's own fetch, so
     * rotation needs no invalidation here.
     *
     * `getClaims()` resolves the session first, which is what refreshes an expiring access token
     * and writes the rotated cookies through the `setAll` adapter above. Session refresh — the
     * reason auth middleware exists at all — is preserved.
     */
    let authedUserId: string | null = null;
    let authSource = "claims";
    try {
        const jwks = await getCachedJwks(supabaseUrl, supabaseAnonKey);
        const claimsRes = await supabase.auth.getClaims(undefined, jwks ? { jwks } : undefined);
        const sub = claimsRes.data?.claims?.sub;
        if (!claimsRes.error && typeof sub === "string" && sub.length > 0) {
            authedUserId = sub;
        }
    } catch {
        authedUserId = null;
    }
    if (!authedUserId) {
        // Symmetric keys, WebCrypto unavailable, or a malformed/absent token — ask the Auth server,
        // which is the pre-existing behaviour and the only correct answer in those cases.
        authSource = "getUser";
        const {
            data: { user: fallbackUser },
        } = await supabase.auth.getUser();
        authedUserId = fallbackUser?.id ?? null;
    }

    if (routeTimingEnabled()) {
        response.headers.set(ROUTE_TIMING_HEADER_T0, String(mwT0));
        response.headers.set(ROUTE_TIMING_HEADER_AUTH_MS, String(Date.now() - authStartedAt));
        response.headers.set("x-alloy-mw-auth-source", authSource);
    }

    if (!requiresOperatorSession(pathname)) {
        return response;
    }

    if (!authedUserId) {
        const res = NextResponse.redirect(new URL(operatorLoginRedirectPath(), request.url));
        res.headers.set("x-alloy-admin-mw", "redirect:/login");
        return res;
    }

    response.headers.set("x-alloy-admin-mw", "next");
    return response;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
