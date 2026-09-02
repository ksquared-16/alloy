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
    let origin: string | null = null;
    try {
        origin = raw ? new URL(raw).origin : null;
    } catch {
        origin = null;
    }

    return NextResponse.json(
        { origin, urlDefined: Boolean(raw) },
        { headers: { "cache-control": "no-store" } },
    );
}
