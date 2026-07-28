import { NextRequest, NextResponse } from "next/server";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    createOrganizationEquivalencyDraft,
    ensureDefaultCategoryEquivalency,
    ensureDefaultFteWeighting,
    ensureDefaultUnweightedWeighting,
    ensureDefaultWeeklyHoursEquivalency,
    listOrganizationEquivalencies,
    publishOrganizationEquivalency,
} from "@/lib/organizationWeightings/persist";
import type { EquivalencySessionBasis, EquivalencyStrategyId } from "@/lib/organizationWeightings/types";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

const SCHEMES: EquivalencyStrategyId[] = [
    "unweighted",
    "days_per_week",
    "category",
    "session_or_day",
    "weekly_hours",
];

/** GET /api/admin/organization-weightings — lists Equivalency Definitions (compat path). */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    try {
        const supabase = createAdminClient();
        await ensureDefaultUnweightedWeighting(supabase, { orgId: ctx.orgId, userId: ctx.userId });
        await ensureDefaultFteWeighting(supabase, { orgId: ctx.orgId, userId: ctx.userId });
        await ensureDefaultCategoryEquivalency(supabase, { orgId: ctx.orgId, userId: ctx.userId });
        await ensureDefaultWeeklyHoursEquivalency(supabase, { orgId: ctx.orgId, userId: ctx.userId });
        const equivalencies = await listOrganizationEquivalencies(supabase, ctx.orgId);
        return NextResponse.json({
            equivalencies,
            /** @deprecated Prefer `equivalencies` */
            weightings: equivalencies,
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to list equivalency definitions" },
            { status: 500 },
        );
    }
}

/** POST /api/admin/organization-weightings — create Equivalency Definition draft. */
export async function POST(req: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!isRecord(body)) return NextResponse.json({ error: "Expected object body" }, { status: 400 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const schemeRaw = typeof body.scheme === "string" ? body.scheme : typeof body.strategy === "string" ? body.strategy : "session_or_day";
    if (!SCHEMES.includes(schemeRaw as EquivalencyStrategyId)) {
        return NextResponse.json({ error: "Unknown equivalency strategy" }, { status: 400 });
    }
    const scheme = schemeRaw as EquivalencyStrategyId;
    const sessionBasis = (
        body.session_basis === "attendance_type" || body.session_basis === "days_per_week" ?
            body.session_basis
        :   null
    ) as EquivalencySessionBasis | null;

    try {
        const supabase = createAdminClient();
        let equivalency = await createOrganizationEquivalencyDraft(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            name,
            description: typeof body.description === "string" ? body.description : null,
            scheme,
            factors: isRecord(body.factors) ? (body.factors as Record<string, number>) : undefined,
            fullTimeDays: typeof body.full_time_days === "number" ? body.full_time_days : undefined,
            fullTimeHours: typeof body.full_time_hours === "number" ? body.full_time_hours : undefined,
            sessionBasis,
            unmatchedPolicy:
                body.unmatched_policy === "unavailable" || body.unmatched_policy === "zero" || body.unmatched_policy === "proportional" ?
                    body.unmatched_policy
                :   undefined,
        });
        if (body.publish === true) {
            equivalency = await publishOrganizationEquivalency(supabase, {
                orgId: ctx.orgId,
                userId: ctx.userId,
                id: equivalency.id,
            });
        }
        return NextResponse.json(
            {
                equivalency,
                /** @deprecated Prefer `equivalency` */
                weighting: equivalency,
            },
            { status: 201 },
        );
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Create failed" },
            { status: 500 },
        );
    }
}
