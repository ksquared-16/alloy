import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { ensureScheduledWorkConsumersRegistered } from "@/lib/scheduledWork/scheduledWorkConsumers";
import { runScheduledWorkWake } from "@/lib/scheduledWork/scheduledWorkRuntime";

export const dynamic = "force-dynamic";

/**
 * THE ONE GENERIC WAKE. The external clock calls this and nothing else.
 *
 * It carries ZERO domain logic: it does not know what billing, aging or autopay
 * are, and it never calls their endpoints. It claims due work and dispatches to
 * registered handlers. Infrastructure that knew which domain to wake would put
 * business cadence in a cron expression, where nobody would think to look for it.
 *
 * ── AUTH IS A MACHINE TOKEN ──
 *
 * `x-cron-token` against `INTERNAL_CRON_TOKEN`, the same mechanism
 * `communication-scheduled-sends/process-due` already uses — one convention for
 * machine callers rather than a second one invented here. There is no session
 * path: this runs as the system across organizations, and an operator-scoped
 * session could only ever do part of the job, which would be worse than refusing.
 *
 * Absent or misconfigured token means 401. A wake endpoint that defaulted open
 * because the environment was missing a variable would be an unauthenticated way
 * to drive every scheduled consequence in the platform.
 */
/**
 * Two accepted machine credentials, and nothing else.
 *
 * `Authorization: Bearer $CRON_SECRET` is what Vercel Cron sends. `x-cron-token`
 * against `INTERNAL_CRON_TOKEN` is the convention this estate already uses for
 * machine callers (`communication-scheduled-sends/process-due`), kept so a
 * deterministic test or an operator recovery can drive a wake without the
 * hosting platform. A missing or empty secret NEVER authorizes: an environment
 * that forgot to set one would otherwise leave every scheduled consequence in the
 * platform drivable by anyone who found the URL.
 */
function isAuthorizedClock(request: NextRequest): boolean {
    const bearerExpected = (process.env.CRON_SECRET ?? "").trim();
    const bearer = (request.headers.get("authorization") ?? "").trim();
    if (bearerExpected && bearer === `Bearer ${bearerExpected}`) return true;

    const tokenExpected = (process.env.INTERNAL_CRON_TOKEN ?? "").trim();
    const token = (request.headers.get("x-cron-token") ?? "").trim();
    return Boolean(tokenExpected && token && token === tokenExpected);
}

async function wake(): Promise<NextResponse> {
    ensureScheduledWorkConsumersRegistered();
    try {
        const result = await runScheduledWorkWake(createAdminClient(), {});
        return NextResponse.json({ ok: true, ...result });
    } catch (err) {
        const message = err instanceof Error ? err.message : "wake failed";
        return NextResponse.json({ ok: false, error: "WAKE_FAILED", message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!isAuthorizedClock(request)) {
        return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    return wake();
}

/**
 * THE EXTERNAL CLOCK'S ENTRY POINT.
 *
 * Vercel Cron issues a GET carrying `Authorization: Bearer $CRON_SECRET`, so the
 * clock arrives here rather than at POST. Both methods run the same wake through
 * the same runtime — the verb is the hosting platform's convention, not a second
 * behaviour, and giving the scheduler two code paths would mean certifying two.
 *
 * Unauthenticated GET is NOT a liveness endpoint that quietly returns ok. An
 * unauthenticated caller learns only that something is here; it drives nothing.
 */
export async function GET(request: NextRequest) {
    if (!isAuthorizedClock(request)) {
        return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    return wake();
}
