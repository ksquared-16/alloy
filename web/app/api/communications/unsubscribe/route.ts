import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { applyUnsubscribeToken } from "@/lib/communications/preferences/applyUnsubscribe";
import { verifyUnsubscribeToken } from "@/lib/communications/preferences/unsubscribeToken";

/**
 * Recipient-initiated unsubscribe. Public by necessity, bounded by construction.
 *
 * A parent who wants to stop receiving mail must not be asked to log in — the whole point
 * of an unsubscribe link is that it works from the mailbox. So there is no session here.
 * What stands in for one is a signed token that names the Person, the organization and the
 * ONE category it may change; nothing is read from the request, so the request cannot
 * widen what the link authorizes. See `unsubscribeToken.ts`.
 *
 * GET  — shows what would happen and asks. A mail client or a security scanner that
 *        prefetches links must not silently opt somebody out, and RFC 8058 exists
 *        precisely because GET is not safe for state change.
 * POST — performs it. `List-Unsubscribe-Post: List-Unsubscribe=One-Click` makes this the
 *        one-click path mail clients call directly, and the same endpoint serves the
 *        confirm button.
 *
 * Responses are HTML because the reader is a person in a browser, and deliberately plain:
 * no tracking, no assets, nothing that phones home.
 */
export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
    email_marketing: "marketing and promotional email",
    email_operational: "routine email",
};

function page(title: string, body: string, status = 200): NextResponse {
    return new NextResponse(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
            `<title>${title}</title>` +
            `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.25rem;color:#111}` +
            `h1{font-size:1.25rem;margin:0 0 .75rem}p{margin:0 0 1rem}` +
            `button{font:inherit;padding:.6rem 1.1rem;border:1px solid #111;background:#111;color:#fff;border-radius:.375rem;cursor:pointer}</style>` +
            `<h1>${title}</h1>${body}`,
        { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
}

function tokenFrom(request: Request): string | null {
    return new URL(request.url).searchParams.get("t");
}

export async function GET(request: Request): Promise<NextResponse> {
    const token = tokenFrom(request);
    const verified = verifyUnsubscribeToken(token);
    if (!verified.ok) {
        return page(
            "This unsubscribe link is no longer valid",
            `<p>The link may have expired or been altered in transit. Please contact your school directly and they can update your preferences for you.</p>`,
            400,
        );
    }
    const what = CATEGORY_LABEL[verified.claims.c] ?? "these messages";
    // A form POST, not a link: the action must not be reachable by prefetch.
    return page(
        "Unsubscribe",
        `<p>You are about to stop receiving <strong>${what}</strong> from this school.</p>` +
            `<p>Essential messages about your child&rsquo;s care and enrolment will still be sent.</p>` +
            `<form method="post"><input type="hidden" name="confirm" value="1"><button type="submit">Unsubscribe</button></form>`,
    );
}

export async function POST(request: Request): Promise<NextResponse> {
    const token = tokenFrom(request);
    const outcome = await applyUnsubscribeToken(createAdminClient(), token);

    if (!outcome.ok) {
        const expired = outcome.reason === "expired";
        return page(
            expired ? "This unsubscribe link has expired" : "This unsubscribe link is no longer valid",
            `<p>Please contact your school directly and they can update your preferences for you.</p>`,
            400,
        );
    }

    const what = CATEGORY_LABEL[outcome.category] ?? "these messages";
    return page(
        "You have been unsubscribed",
        `<p>You will no longer receive <strong>${what}</strong> from this school.</p>` +
            `<p>Essential messages about your child&rsquo;s care and enrolment will still be sent.</p>`,
    );
}
