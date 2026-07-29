import { createServerClient } from "@supabase/ssr";
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
     * PE-3 diagnostic: `supabase.auth.getUser()` below validates the JWT against the remote Auth
     * server on EVERY matched request — the document and every `/api/*` call on the page — and it
     * completes before the route handler starts, so it is invisible to `ProvisioningTimings`.
     * Reported via response headers because middleware finishes before the first byte.
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
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (routeTimingEnabled()) {
        response.headers.set(ROUTE_TIMING_HEADER_T0, String(mwT0));
        response.headers.set(ROUTE_TIMING_HEADER_AUTH_MS, String(Date.now() - authStartedAt));
    }

    if (!requiresOperatorSession(pathname)) {
        return response;
    }

    if (!user) {
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
