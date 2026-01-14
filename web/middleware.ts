import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Only protect /admin routes
  if (!request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Server-only: Read SUPABASE_URL and SUPABASE_ANON_KEY (not NEXT_PUBLIC_*)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[MIDDLEWARE] Missing Supabase server environment variables: SUPABASE_URL and SUPABASE_ANON_KEY");
    return NextResponse.redirect(new URL("/login?error=config", request.url));
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

  // No session - redirect to login
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check allowlist (only in staging)
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV || "production";
  if (appEnv === "staging") {
    const allowedEmails = process.env.ALLOWED_ADMIN_EMAILS;
    if (allowedEmails) {
      const emailList = allowedEmails.split(",").map((e) => e.trim().toLowerCase());
      const userEmail = user.email?.toLowerCase();
      if (!userEmail || !emailList.includes(userEmail)) {
        return NextResponse.redirect(
          new URL("/login?error=unauthorized", request.url)
        );
      }
    }
  } else {
    // In production, still require allowlist for safety
    // This can be changed if you want production to be completely inaccessible
    const allowedEmails = process.env.ALLOWED_ADMIN_EMAILS;
    if (allowedEmails) {
      const emailList = allowedEmails.split(",").map((e) => e.trim().toLowerCase());
      const userEmail = user.email?.toLowerCase();
      if (!userEmail || !emailList.includes(userEmail)) {
        return NextResponse.redirect(
          new URL("/login?error=unauthorized", request.url)
        );
      }
    } else {
      // If no allowlist is set in production, deny access
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};

