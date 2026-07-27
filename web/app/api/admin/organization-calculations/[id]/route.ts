import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    getOrganizationCalculation,
    updateOrganizationCalculationDraft,
} from "@/lib/organizationCalculations/persist";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/admin/organization-calculations/[id] */
export async function GET(_req: NextRequest, { params }: RouteParams) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const { id } = await params;

    try {
        const supabase = createAdminClient();
        const loaded = await getOrganizationCalculation(supabase, ctx.orgId, id);
        if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(loaded);
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load organization calculation" },
            { status: 500 },
        );
    }
}

/** PATCH /api/admin/organization-calculations/[id] — update draft AST/metadata. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }
    const { id } = await params;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!isRecord(body)) return NextResponse.json({ error: "Expected object body" }, { status: 400 });

    try {
        const supabase = createAdminClient();
        const updated = await updateOrganizationCalculationDraft(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            id,
            name: typeof body.name === "string" ? body.name : undefined,
            description: body.description === undefined ? undefined : (body.description as string | null),
            expressionAst: body.expression_ast,
            consumerBindings:
                isRecord(body.consumer_bindings) ?
                    (body.consumer_bindings as { runtime_surface?: boolean })
                :   undefined,
        });
        return NextResponse.json(updated);
    } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to update organization calculation";
        const status =
            message.includes("not found") ? 404
            : message.startsWith("Invalid expression") || message.startsWith("Cannot edit") ? 400
            : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
