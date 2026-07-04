import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { composeCommercialExport } from "@/lib/commercial/execution/export";
import { buildCommercialExecutionPreview } from "@/lib/commercial/execution/preview/buildPreview";
import { parseCommercialContext, parseFundingPlan, parseHorizon } from "@/lib/commercial/execution/preview/parsePreviewRequest";

/**
 * Commercial Execution Simulator — PREVIEW ONLY (Phase 8).
 *
 * Makes the Simulator the first consumer of Commercial Execution: reads the real
 * Commercial Export (frozen V1), runs evaluate() → attribute()? → expand()?, and
 * returns a consumer-neutral CommercialResolution preview. Creates NO financial
 * truth — no obligations, draft charges, invoices, ledger, or writes.
 *
 * This is ADDITIVE and independent of the Substrate-A consumption simulator
 * (`/api/admin/financial/consumption/simulate`), which is unchanged. Expected
 * deltas between the two: docs/platform/core/commercial-execution-simulator-deltas.md.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const contextResult = parseCommercialContext(body);
    if (!contextResult.ok) return NextResponse.json({ error: contextResult.error, code: "invalid_input" }, { status: 400 });
    const horizonResult = parseHorizon(body);
    if (!horizonResult.ok) return NextResponse.json({ error: horizonResult.error, code: "invalid_input" }, { status: 400 });
    const planResult = parseFundingPlan(body);
    if (!planResult.ok) return NextResponse.json({ error: planResult.error, code: "invalid_input" }, { status: 400 });

    const context = contextResult.value;
    const supabase = createAdminClient();
    try {
        const { export: exp, validation } = await composeCommercialExport({ supabase, orgId: ctx.orgId, asOf: context.asOf });
        const preview = buildCommercialExecutionPreview(exp, validation, context, {
            plan: planResult.value ?? undefined,
            horizon: horizonResult.value ?? undefined,
        });
        return NextResponse.json(preview, { status: 200 });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Preview failed";
        return NextResponse.json({ error: message, code: "preview_failed" }, { status: 500 });
    }
}
