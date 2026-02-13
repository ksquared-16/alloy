import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
];

function isAllowedAdminPath(pathname: string): boolean {
  return ADMIN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

export async function middleware(request: NextRequest) {
  // Only protect /admin routes
  if (!request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // Allow only known admin paths; redirect unknown paths to dashboard (avoid 404 for valid app routes)
  if (!isAllowedAdminPath(request.nextUrl.pathname)) {
    const res = NextResponse.redirect(new URL("/admin/dashboard", request.url));
    res.headers.set("x-alloy-admin-mw", "blocked");
    return res;
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Server: Prefer SUPABASE_URL/SUPABASE_ANON_KEY, fallback to NEXT_PUBLIC_* for robustness
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[MIDDLEWARE] Missing Supabase environment variables. Required: SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)");
    const res = NextResponse.redirect(new URL("/login?error=config", request.url));
    res.headers.set("x-alloy-admin-mw", "redirect:/login?error=config");
    return res;
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

  // No session → login. Role check (admin/ops only) is the single gate and is done in admin layout via user_profiles.
  if (!user) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.headers.set("x-alloy-admin-mw", "redirect:/login");
    return res;
  }

  response.headers.set("x-alloy-admin-mw", "next");
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};

