import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: unknown): s is string {
    return typeof s === "string" && UUID_REGEX.test(s);
}

/**
 * POST /api/action-links/consume-accept-job
 * Body: { token: string }
 * Validates action link (vendor_accept_job, entity_type job, metadata.vendor_id),
 * atomically assigns job to vendor, marks link consumed. Single-use.
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
        .select("id, action_type, entity_type, entity_id, expires_at, consumed_at, metadata")
        .eq("token", token)
        .single();

    if (fetchErr || !row) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });
    }

    const r = row as {
        id: string;
        action_type: string;
        entity_type: string;
        entity_id: string | null;
        expires_at: string;
        consumed_at: string | null;
        metadata: unknown;
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
    const vendorId = metadata.vendor_id;
    if (!isUuid(vendorId)) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
    }

    const jobId = r.entity_id;
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

    return NextResponse.json({
        ok: true,
        action_link_result: actionLinkResult,
    });
}
