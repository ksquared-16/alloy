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
    /** Next-gen admin UI (App Router) — must be allowlisted or middleware redirects to /admin/dashboard */
    "/adminV2",
    "/adminv2",
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

    /**
     * Provider delivery webhooks (Twilio SMS status callbacks, Resend lifecycle) are intentionally
     * **public HTTPS endpoints**. They MUST NOT rely on Alloy admin/session auth at the edge.
     * Authorization is enforced **inside each route** via Twilio signature validation (`X-Twilio-Signature`)
     * or Resend Svix signing headers (`svix-*`), using server-side secrets (`TWILIO_AUTH_TOKEN`,
     * `RESEND_WEBHOOK_SECRET`).
     *
     * Skip Supabase session refresh entirely so webhook traffic reaches the Route Handler reliably
     * and does not contend with incidental auth/session behavior at the middleware layer.
     */
    if (
        pathname === "/api/webhooks/twilio/sms-status" ||
        pathname === "/api/webhooks/resend"
    ) {
        return NextResponse.next();
    }

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

    if (!pathname.startsWith("/admin")) {
        return response;
    }

    if (!isAllowedAdminPath(pathname)) {
        const res = NextResponse.redirect(new URL("/admin/dashboard", request.url));
        res.headers.set("x-alloy-admin-mw", "blocked");
        return res;
    }

    if (!user) {
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
