import { NextRequest, NextResponse } from "next/server";
import { emitEvent } from "@/lib/emitEvent";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { executeWorkflowRun } from "@/lib/workflowRun";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: unknown): s is string {
    return typeof s === "string" && UUID_REGEX.test(s);
}

/** Unrendered workflow placeholders must not be treated as vendor UUIDs. */
function vendorUuidFromMetadata(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s || /\{\{/.test(s)) return null;
    return isUuid(s) ? s : null;
}

/**
 * POST /api/action-links/consume-accept-job
 * Body: { token: string } — same raw `action_links.token` as in /action/[token] URL.
 * Resolves vendor: metadata.vendor_id (UUID) else jobs.assigned_vendor_id for entity job.
 * Assigns job, marks link consumed. Single-use.
 */
export async function POST(request: NextRequest) {
    let body: { token?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
    }

    const token = body.token != null ? String(body.token).trim() : null;
    if (!token) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: row, error: fetchErr } = await supabase
        .from("action_links")
        .select("id, action_type, entity_type, entity_id, expires_at, consumed_at, metadata, org_id")
        .eq("token", token)
        .single();

    if (fetchErr || !row) {
        return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }

    const r = row as {
        id: string;
        action_type: string;
        entity_type: string;
        entity_id: string | null;
        expires_at: string;
        consumed_at: string | null;
        metadata: unknown;
        org_id?: string | null;
    };

    if (r.consumed_at) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 410 });
    }
    if (new Date(r.expires_at) <= new Date()) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 410 });
    }
    if (r.action_type !== "vendor_accept_job" || r.entity_type !== "job") {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
    }
    if (!r.entity_id || typeof r.entity_id !== "string") {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
    }

    const metadata = r.metadata != null && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {};
    const jobId = r.entity_id;

    let vendorId: string | null = vendorUuidFromMetadata(metadata.vendor_id);
    if (!vendorId) {
        const { data: jobRow } = await supabase
            .from("jobs")
            .select("assigned_vendor_id")
            .eq("id", jobId)
            .maybeSingle();
        const av = (jobRow as { assigned_vendor_id?: string | null } | null)?.assigned_vendor_id;
        if (av != null && isUuid(String(av).trim())) {
            vendorId = String(av).trim();
        }
    }
    if (!vendorId) {
        return NextResponse.json({ ok: false, reason: "missing_vendor_id" }, { status: 400 });
    }
    const { data: updatedJob, error: updateErr } = await supabase
        .from("jobs")
        .update({ assigned_vendor_id: vendorId })
        .eq("id", jobId)
        .is("assigned_vendor_id", null)
        .select("id, assigned_vendor_id")
        .maybeSingle();

    if (updateErr) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 500 });
    }

    const accepted = !!updatedJob;
    const acceptResult = accepted ? "accepted" : "already_assigned";
    const mergedMetadata = { ...metadata, accept_result: acceptResult };
    const now = new Date().toISOString();

    const { error: consumeErr } = await supabase
        .from("action_links")
        .update({
            consumed_at: now,
            metadata: mergedMetadata,
        })
        .eq("id", r.id);

    if (consumeErr) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 500 });
    }

    let assignedVendorId: string;
    if (updatedJob) {
        assignedVendorId = (updatedJob as { assigned_vendor_id: string }).assigned_vendor_id;
    } else {
        const { data: jobRow } = await supabase
            .from("jobs")
            .select("assigned_vendor_id")
            .eq("id", jobId)
            .single();
        assignedVendorId = (jobRow as { assigned_vendor_id: string } | null)?.assigned_vendor_id ?? vendorId;
    }

    const actionLinkResult = {
        accept_result: acceptResult as "accepted" | "already_assigned",
        job_id: jobId,
        assigned_vendor_id: assignedVendorId,
    };

    /** Same pattern as POST /api/action/[token]/consume: canonical workflow_events + workflow_runs for SMS / follow-ups. */
    if (accepted) {
        const orgId = r.org_id ?? process.env.ALLOY_PUBLIC_ORG_ID ?? null;
        const [{ data: jobFull }, { data: vendorFull }] = await Promise.all([
            supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
            supabase.from("vendors").select("*").eq("id", assignedVendorId).maybeSingle(),
        ]);
        const occurredAt = now;
        const eventPayload: Record<string, unknown> = {
            event_type: "action_link_consumed",
            occurred_at: occurredAt,
            org_id: orgId,
            action_type: "vendor_accept_job",
            entity_type: "job",
            entity_id: jobId,
            vendor_id: assignedVendorId,
            job: jobFull ?? null,
            vendor: vendorFull ?? null,
        };

        let eventId: string | null = null;
        try {
            eventId = await emitEvent({
                org_id: orgId,
                event_type: "action_link_consumed",
                entity_type: "job",
                entity_id: jobId,
                action_type: "vendor_accept_job",
                occurred_at: occurredAt,
                payload: eventPayload,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[CONSUME_ACCEPT_JOB] emitEvent failed", msg);
            return NextResponse.json(
                { ok: false, reason: "event_emit_failed", message: msg, action_link_result: actionLinkResult },
                { status: 500 }
            );
        }

        let wq = supabase
            .from("workflows")
            .select("id")
            .eq("enabled", true)
            .eq("event_type", "action_link_consumed")
            .eq("entity_type", "job");
        if (orgId) wq = wq.or(`org_id.eq.${orgId},org_id.is.null`);
        const { data: wfs } = await wq;

        for (const wf of wfs ?? []) {
            try {
                await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
                    event_id: eventId,
                    org_id: orgId,
                });
            } catch (err) {
                console.error(
                    "[CONSUME_ACCEPT_JOB] executeWorkflowRun failed",
                    (err as Error).message,
                    "workflow_id=",
                    (wf as { id: string }).id
                );
            }
        }
    }

    return NextResponse.json({
        ok: true,
        action_link_result: actionLinkResult,
    });
}
