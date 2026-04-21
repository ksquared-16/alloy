import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { loadCleaningQuoteCatalogForOrg } from "@/lib/admin/loadCleaningQuoteCatalogForOrg";
import { getQuoteIntakeWorkflowOrThrow } from "@/lib/quoteIntake/workflows/opportunityCleaningQuoteV1";
import { resolveCleaningQuoteIntakeFields } from "@/lib/quoteIntake/resolveCleaningQuoteIntakeFields";

/**
 * GET /api/admin/quote-intake/catalog?workflow_key=opportunity_cleaning_quote_v1
 * Resolves option sets + cleaning pricing catalogs for the **current admin org**.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const workflowKey = new URL(request.url).searchParams.get("workflow_key")?.trim();
    if (!workflowKey) {
        return NextResponse.json({ error: "workflow_key is required" }, { status: 400 });
    }

    try {
        const workflow = getQuoteIntakeWorkflowOrThrow(workflowKey);
        if (workflow.vertical_slug !== "cleaning") {
            return NextResponse.json({ error: "Only cleaning workflows are supported in this route (v1)" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const catalog = await loadCleaningQuoteCatalogForOrg(supabase, ctx.orgId);
        if (!catalog) {
            return NextResponse.json({ error: "Cleaning vertical not found" }, { status: 500 });
        }

        const fields = resolveCleaningQuoteIntakeFields(workflow, catalog);

        return NextResponse.json({
            ok: true,
            workflow_key: workflow.workflow_key,
            workflow,
            vertical_id: catalog.vertical_id,
            fields,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "catalog failed";
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
