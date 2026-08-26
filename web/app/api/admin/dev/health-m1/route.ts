import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { censusHealthGrainM1 } from "@/lib/health/migration/healthGrainM1";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * M1 / D-H1 — the READ-ONLY census the grain migration is required to produce first.
 *
 * The Director's condition was explicit: identify every affected tenant row, report exact counts by
 * organization and field, identify any ambiguous enrollment → child mapping, and fail closed on
 * ambiguity. This answers that question and writes NOTHING — the move itself belongs to a migration,
 * where it runs with the schema rather than from a request.
 *
 * Dev/certification only: 404 in production, `requireAdminOrOps`, org from the session, no
 * payload-controlled identifiers.
 */
export async function POST(request: NextRequest) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        body = {};
    }
    const action = typeof body.action === "string" ? body.action.trim() : "";

    try {
        if (action === "census") {
            return NextResponse.json({ ok: true, census: await censusHealthGrainM1(createAdminClient()) });
        }
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }

    // Fail closed. An unrecognised verb is not a no-op that might have moved data.
    return NextResponse.json({ error: "action must be census" }, { status: 400 });
}
