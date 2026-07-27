import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { provingMinPhysicalLicensedAst } from "@/lib/organizationCalculations/ast";
import {
    createOrganizationCalculationDraft,
    listOrganizationCalculations,
} from "@/lib/organizationCalculations/persist";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/** GET /api/admin/organization-calculations — list org calculations. */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    try {
        const supabase = createAdminClient();
        const calculations = await listOrganizationCalculations(supabase, ctx.orgId);
        return NextResponse.json({ calculations });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to list organization calculations" },
            { status: 500 },
        );
    }
}

/**
 * POST /api/admin/organization-calculations — create draft.
 * Body may omit expression_ast to seed the proving min(physical, licensed) AST.
 */
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

    const expressionAst = body.expression_ast ?? provingMinPhysicalLicensedAst();
    const consumerBindings =
        isRecord(body.consumer_bindings) ? (body.consumer_bindings as { runtime_surface?: boolean }) : { runtime_surface: true };

    try {
        const supabase = createAdminClient();
        const created = await createOrganizationCalculationDraft(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            name,
            description: typeof body.description === "string" ? body.description : null,
            expressionAst,
            consumerBindings,
            key: typeof body.key === "string" ? body.key : undefined,
        });
        return NextResponse.json(created, { status: 201 });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to create organization calculation";
        const status = message.startsWith("Invalid expression") ? 400 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
