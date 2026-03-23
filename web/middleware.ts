import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
    getSupabaseAnonKeyForAuth,
    getSupabaseUrlForAuth,
    warnIfAuthSupabaseUrlMismatch,
} from "@/lib/supabase/auth-env";

// Allowed admin path prefixes (same as nav: dashboard, jobs, contacts, customers, vendors, etc.).
// Unknown /admin paths redirect to dashboard instead of 404.
const ADMIN_PATH_PREFIXES = [
    "/admin",
    "/admin/dashboard",
    "/admin/opportunities",
    "/admin/jobs",
    "/admin/schedules",
    "/admin/customers",
    "/admin/contacts",
    "/admin/vendors",
    "/admin/contractors",
    "/admin/discounts",
    "/admin/discount-redemptions",
    "/admin/subscriptions",
    "/admin/verticals",
    "/admin/workflows",
    "/admin/messaging",
    "/admin/settings",
    "/admin/users",
];

function isAllowedAdminPath(pathname: string): boolean {
    return ADMIN_PATH_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
    );
}

let didWarnAuthUrlMismatch = false;

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabaseUrl = getSupabaseUrlForAuth();
    const supabaseAnonKey = getSupabaseAnonKeyForAuth();

    if (!supabaseUrl || !supabaseAnonKey) {
        if (pathname.startsWith("/admin")) {
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

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (pathname.startsWith("/admin")) {
        const allNames = request.cookies.getAll().map((c) => c.name);
        const sbNames = allNames.filter((n) => n.startsWith("sb-"));
        console.log("[MIDDLEWARE DEBUG]", {
            path: pathname,
            sbCookieNames: sbNames,
            cookieNameCount: allNames.length,
            hasUser: Boolean(user),
            userId: user?.id ?? null,
        });
    }

    if (!pathname.startsWith("/admin")) {
        return response;
    }

    if (!isAllowedAdminPath(pathname)) {
        const res = NextResponse.redirect(new URL("/admin/dashboard", request.url));
        res.headers.set("x-alloy-admin-mw", "blocked");
        return res;
    }

    if (!user) {
        console.warn(
            "[MIDDLEWARE /admin] redirect → /login: no user (cookies missing or session not readable on this request)",
            { path: pathname }
        );
        const res = NextResponse.redirect(new URL("/login", request.url));
        res.headers.set("x-alloy-admin-mw", "redirect:/login");
        return res;
    }

    response.headers.set("x-alloy-admin-mw", "next");
    return response;
}

export const config = {
    matcher: [
        /*
         * Run on all non-static routes so getUser() can refresh the session and
         * write cookies — matches Supabase Next.js SSR guidance.
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
