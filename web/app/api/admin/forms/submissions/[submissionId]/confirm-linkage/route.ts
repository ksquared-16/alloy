import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { dbGetSubmission, dbPatchSubmission } from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/** POST — operator confirms auto-linked CRM rows are correct (payload.meta only; no CRM mutation). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin" && ctx.role !== "ops") return jsonError("Forbidden", 403);

    const { submissionId: raw } = await params;
    const submissionId = parseUuidParam(raw, "submissionId");
    if (submissionId instanceof NextResponse) return submissionId;

    const supabase = createAdminClient();
    const { data: sub, error: sErr } = await dbGetSubmission(supabase, ctx.orgId, submissionId);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    if (!sub) return jsonError("Not found", 404);

    const row = sub as {
        status: string;
        payload: Record<string, unknown>;
        person_id: string | null;
        customer_id: string | null;
        customer_member_id: string | null;
        opportunity_id: string | null;
    };

    if (row.status !== "submitted") {
        return jsonError("Only submitted submissions can confirm linkage", 409);
    }

    const hasCrm = !!(row.person_id || row.customer_id || row.customer_member_id || row.opportunity_id);
    if (!hasCrm) {
        return jsonError("No CRM records are linked on this submission yet", 400);
    }

    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
    const prevMeta =
        payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta)
            ? { ...(payload.meta as Record<string, unknown>) }
            : {};

    if (prevMeta.intake_needs_review !== true) {
        return jsonError("This submission does not require intake linkage confirmation", 409);
    }

    const nextMeta: Record<string, unknown> = {
        ...prevMeta,
        intake_needs_review: false,
        intake_review_result: "confirmed",
        intake_reviewed_at: new Date().toISOString(),
        intake_reviewed_by: ctx.userId,
        intake_resolution_review: "review_confirmed",
    };

    const nextPayload = { ...payload, meta: nextMeta };

    const { data: updated, error: uErr } = await dbPatchSubmission(supabase, ctx.orgId, submissionId, {
        payload: nextPayload,
    });
    if (uErr) {
        if (uErr.code === "PGRST116" || uErr.message?.toLowerCase().includes("rows")) {
            return jsonError("Submission was modified concurrently", 409);
        }
        return NextResponse.json({ error: uErr.message }, { status: 400 });
    }

    return jsonData(updated);
}
