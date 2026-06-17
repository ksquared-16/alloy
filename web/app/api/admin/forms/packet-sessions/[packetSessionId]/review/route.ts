import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { emitEvent } from "@/lib/emitEvent";
import { resolveOpportunityIdFromSessionSnapshotFields } from "@/lib/forms/workflow/opportunityEnrollmentPacketProjections";
import { ensureGeneratedPdfsForApprovedPacketSession } from "@/lib/forms/packets/ensureGeneratedPdfsForApprovedPacketSession";
import { applyEnrollmentPacketBusinessProcessIntegration } from "@/lib/forms/packets/applyEnrollmentPacketBusinessProcessIntegration";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REVIEW_NEXT = new Set(["approved", "rejected", "needs_correction"]);

function normalizeOperatorReviewStatus(raw: unknown): string | null {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    return s.length > 0 ? s : null;
}

/** Completed sessions in this set may receive an operator decision (matches drawer “pending review” UX). */
function isOperatorReviewAwaiting(cur: string | null): boolean {
    return cur == null || cur === "needs_review" || cur === "needs_correction";
}

/** PATCH — operator review gate for a completed packet session (no CRM mutation). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ packetSessionId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { packetSessionId } = await params;
    if (!UUID_RE.test(String(packetSessionId ?? "").trim())) {
        return NextResponse.json({ error: "Invalid packet session id" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const next = typeof body.operator_review_status === "string" ? body.operator_review_status.trim().toLowerCase() : "";
    if (!REVIEW_NEXT.has(next)) {
        return NextResponse.json(
            { error: "operator_review_status must be approved, rejected, or needs_correction" },
            { status: 400 }
        );
    }

    const notesRaw = typeof body.operator_review_notes === "string" ? body.operator_review_notes.trim() : "";
    const notes = notesRaw.slice(0, 4000) || null;

    const supabase = createAdminClient();
    const { data: sess, error: sErr } = await supabase
        .from("form_packet_sessions")
        .select("id, org_id, status, operator_review_status, crm_snapshot, launch_context, packet_definition_id")
        .eq("id", packetSessionId)
        .maybeSingle();

    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    if (!sess) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const orgId = String((sess as { org_id: string }).org_id);
    if (!(await assertRowOrg(supabase, "form_packet_sessions", packetSessionId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const status = String((sess as { status?: string }).status ?? "");
    if (status !== "completed") {
        return NextResponse.json({ error: "Review is only available for completed packet sessions" }, { status: 409 });
    }

    const cur = normalizeOperatorReviewStatus((sess as { operator_review_status?: unknown }).operator_review_status);
    if (!isOperatorReviewAwaiting(cur)) {
        return NextResponse.json(
            { error: "Packet is not awaiting operator review (already decided or not in review queue)." },
            { status: 409 }
        );
    }

    const reviewerId =
        typeof ctx.userId === "string" && UUID_RE.test(ctx.userId.trim()) ? ctx.userId.trim() : null;

    const now = new Date().toISOString();
    const { data: updated, error: uErr } = await supabase
        .from("form_packet_sessions")
        .update({
            operator_review_status: next,
            operator_review_notes: notes,
            operator_reviewed_at: now,
            operator_reviewed_by_user_id: reviewerId,
            updated_at: now,
        })
        .eq("id", packetSessionId)
        .eq("org_id", orgId)
        .select("id")
        .maybeSingle();

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    if (!updated?.id) {
        return NextResponse.json(
            { error: "Update did not apply (session missing, wrong org, or row could not be updated)." },
            { status: 409 }
        );
    }

    if (next === "approved") {
        const pdfRes = await ensureGeneratedPdfsForApprovedPacketSession(supabase, orgId, packetSessionId);
        if (pdfRes.errors.length > 0) {
            console.error("[packet review] approval PDF backfill:", pdfRes.errors);
        }
    }

    const snap = (sess as { crm_snapshot?: unknown }).crm_snapshot;
    const lc = (sess as { launch_context?: unknown }).launch_context;
    const opportunityId = resolveOpportunityIdFromSessionSnapshotFields(snap, lc);
    if (opportunityId) {
        try {
            const bpKind =
                next === "approved" ? "review_approved"
                : next === "needs_correction" ? "review_needs_correction"
                : "review_rejected";
            await applyEnrollmentPacketBusinessProcessIntegration({
                supabase,
                orgId,
                packetSessionId,
                kind: bpKind,
                actorUserId: reviewerId,
            });
        } catch (e) {
            console.error("[packet review] BP integration failed:", e instanceof Error ? e.message : e);
        }

        try {
            await emitEvent({
                org_id: orgId,
                event_type: "opportunity_enrollment_packet_review_decision",
                entity_type: "opportunities",
                entity_id: opportunityId,
                payload: {
                    org_id: orgId,
                    opportunity_id: opportunityId,
                    packet_session_id: packetSessionId,
                    packet_definition_id: (sess as { packet_definition_id?: string }).packet_definition_id ?? null,
                    operator_review_status: next,
                    operator_review_notes: notes,
                    decided_by_user_id: reviewerId,
                    summary: `Packet review: ${next.replace(/_/g, " ")}`,
                },
            });
        } catch (e) {
            console.error("[packet review] workflow event emit failed:", e instanceof Error ? e.message : e);
        }
    }

    return NextResponse.json({ ok: true, operator_review_status: next });
}
