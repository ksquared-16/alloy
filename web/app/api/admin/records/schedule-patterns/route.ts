import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { listSchedulePatterns } from "@/lib/childcareOperational/schedulePatternService";

/**
 * Schedule choices available AT A SITE — read-only.
 *
 * Schedule patterns are site-scoped, so "full day" existing somewhere in the organisation says
 * nothing about whether this child can be given it here. Direct Enroll blocks when a schedule type
 * resolves to no active pattern at the chosen site, and offering an option that would then be
 * refused is how a surface teaches operators to distrust it — so the picker asks the same question
 * the server will.
 *
 * Returns the `schedule_type_key` as the value because that is what `enrollment.direct` resolves
 * against, via the shared `resolveSchedulePatternForScheduleType`.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const siteLocationId = (request.nextUrl.searchParams.get("site_location_id") ?? "").trim();
    // No site means no answer — not every pattern in the organisation.
    if (!siteLocationId) return NextResponse.json({ ok: true, patterns: [] });

    const supabase = createAdminClient();
    try {
        const patterns = await listSchedulePatterns(supabase, ctx.orgId, {
            siteLocationId,
            isActive: true,
        });

        const seen = new Set<string>();
        const out: { key: string; label: string }[] = [];
        for (const p of patterns) {
            const row = p as { schedule_type_key?: string | null; key?: string | null; label?: string | null };
            const key = (row.schedule_type_key ?? row.key ?? "").trim();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push({ key, label: (row.label ?? "").trim() || key.replace(/_/g, " ") });
        }

        return NextResponse.json({ ok: true, patterns: out });
    } catch (e) {
        console.error("[records-schedule-patterns]", e);
        return NextResponse.json(
            {
                ok: false,
                error: "LOAD_FAILED",
                message: e instanceof Error ? e.message : "Could not load schedules",
            },
            { status: 500 }
        );
    }
}
