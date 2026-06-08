import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { processDueCommunicationScheduledSends } from "@/lib/communications/communicationScheduledSendsService";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

function isCronAuthorized(request: NextRequest): boolean {
    const envTok = (process.env.INTERNAL_CRON_TOKEN ?? "").trim();
    if (!envTok) return false;
    const headerTok = (request.headers.get("x-cron-token") ?? "").trim();
    if (!headerTok || headerTok.length !== envTok.length) return false;
    try {
        return timingSafeEqual(Buffer.from(headerTok, "utf8"), Buffer.from(envTok, "utf8"));
    } catch {
        return false;
    }
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * POST `/api/admin/communication-scheduled-sends/process-due` — claim due rows and enqueue via the shared communications send helper (canonical path).
 *
 * **Auth:** `x-cron-token` matching `INTERNAL_CRON_TOKEN` (all orgs), **or** admin/ops session (**org-scoped** claim only).
 */
export async function POST(request: NextRequest) {
    let body: unknown = {};
    try {
        if (request.headers.get("content-type")?.includes("application/json")) {
            body = await request.json();
        }
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const limit = isRecord(body) && typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : 25;

    const cronOk = isCronAuthorized(request);
    let orgIdFilter: string | null = null;

    if (cronOk) {
        orgIdFilter = null;
    } else {
        const forbidden = await requireAdminOrOps();
        if (forbidden) return forbidden;
        const ctx = await getAdminContextCached();
        if (!ctx.ok) return adminContextFailureResponse(ctx);
        orgIdFilter = ctx.orgId;
    }

    const supabase = createAdminClient();
    const processed = await processDueCommunicationScheduledSends({
        supabase,
        limit,
        now: new Date(),
        orgIdFilter,
    });

    if (!processed.ok) {
        return NextResponse.json({ ok: false, error: processed.error, message: processed.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ...processed.result });
}
