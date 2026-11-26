import { NextResponse, type NextRequest } from "next/server";

import {
    ensureFixture,
    fixtureStatus,
    runLiveVerification,
} from "@/lib/dev/developerPlatformQa";

/**
 * The QA walkthrough's own back end. Dev-only, like the page it serves.
 *
 * It exists so the operator never administers the fixture by hand and never
 * retypes a curl command to establish a fact a machine can establish. Three
 * actions, no arguments a caller could use to reach anything else: read the
 * fixture's state, rebuild it, or run the live verification against this
 * server's own origin.
 *
 * The base URL for verification is derived from the incoming request rather than
 * accepted from the body: a caller-supplied target would turn a QA helper into a
 * request forwarder.
 */
export const dynamic = "force-dynamic";

function guard() {
    return process.env.NODE_ENV === "production";
}

export async function GET() {
    if (guard()) return new NextResponse(null, { status: 404 });
    return NextResponse.json({ fixture: await fixtureStatus() });
}

export async function POST(request: NextRequest) {
    if (guard()) return new NextResponse(null, { status: 404 });

    let action = "";
    try {
        action = String(((await request.json()) as { action?: unknown })?.action ?? "");
    } catch {
        action = "";
    }

    if (action === "ensure_fixture") {
        return NextResponse.json({ fixture: await ensureFixture() });
    }
    if (action === "verify") {
        const origin = request.nextUrl.origin;
        return NextResponse.json(await runLiveVerification(origin));
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
