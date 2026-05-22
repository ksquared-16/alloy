import { NextResponse } from "next/server";

import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";

/**
 * GET `/api/admin/ai/workflow-assist/capabilities` — lightweight client hint for Workflow Assist mutation UX.
 *
 * **Does not widen permissions:** mirrors the same compatibility `role` used by `requireAdmin` on propose/apply
 * (`admin` vs `ops`). Portal users who are not org-context eligible receive the same failure shape as other admin routes.
 */
export async function GET() {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    return NextResponse.json({
        ok: true,
        can_propose_and_apply_workflow_assist: ctx.role === "admin",
    });
}
