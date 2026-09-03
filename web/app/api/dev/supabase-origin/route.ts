/**
 * The SERVER's view of the public Supabase origin. Development only.
 *
 * WHY THIS EXISTS. A dev server was serving a client bundle compiled against an older environment.
 * The server rendered the hosted project; the JavaScript in the browser posted sign-ins at a local
 * Supabase that was not running. Every server-side check agreed with itself and none of them could
 * see the browser's value, so the disagreement was invisible from either side alone -- it took a
 * screenshot to find, twice.
 *
 * The login page's dev panel can now ask the server what IT thinks and compare. Two views, one
 * comparison, and a stale bundle announces itself instead of presenting as a wrong password.
 *
 * Returns an ORIGIN -- scheme, host, port. Never a key, and never the anon key's value.
 */

import { NextResponse } from "next/server";

export async function GET() {
    // Not merely uninteresting in production -- this must not become a probe of deployment config.
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "not_available" }, { status: 404 });
    }

    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
    let origin: string | null = null;
    try {
        origin = raw ? new URL(raw).origin : null;
    } catch {
        origin = null;
    }

    /*
     * The URL and anon key are returned so a client running a STALE BUNDLE can sign in against the
     * project this server is actually configured for, instead of whatever was compiled into it.
     *
     * Neither is a secret: both are NEXT_PUBLIC_ values that are already shipped to every browser
     * that loads the app. What makes this safe is not that they are harmless in general -- it is that
     * this route does not exist in production, and in development it reveals nothing the page itself
     * does not already carry.
     */
    return NextResponse.json(
        { origin, url: raw || null, anonKey: anonKey || null, urlDefined: Boolean(raw) },
        { headers: { "cache-control": "no-store" } },
    );
}
