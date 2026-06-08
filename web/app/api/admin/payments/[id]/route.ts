import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import {
    paymentRowFieldsForStatusKeyChange,
    resolvePaymentStatusIdByKey,
} from "@/lib/admin/paymentStatusSync";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertPaymentDrawerReadable, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";

/** PATCH: update status_key, paid_at, notes. Editable fields only. */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: { status_key?: string | null; paid_at?: string | null; notes?: string | null };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.status_key !== undefined) updates.status_key = body.status_key === "" ? null : body.status_key;
    if (body.paid_at !== undefined) updates.paid_at = body.paid_at === "" || body.paid_at == null ? null : body.paid_at;
    if (body.notes !== undefined) updates.notes = body.notes === "" ? null : body.notes;
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ ok: true });
    }
    updates.updated_at = new Date().toISOString();

    const supabase = createAdminClient();

    const { data: prevRow, error: prevErr } = await supabase
        .from("payments")
        .select("status_key, status, paid_at, posted_at, failed_at, voided_at, payment_status_id, job_id, customer_id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (prevErr || !prevRow) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);
    if (!(await assertPaymentDrawerReadable(supabase, ctx.orgId, dim, id))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const oldStatusKey = (prevRow as { status_key?: string | null }).status_key ?? null;

    if (updates.status_key !== undefined) {
        const chk = await assertAllowedStatusKey(supabase, ctx.orgId, "payments", updates.status_key as string | null);
        if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: 400 });
        const newSk = updates.status_key as string | null;
        let paymentStatusId = await resolvePaymentStatusIdByKey(supabase, newSk);
        if (newSk && !paymentStatusId) {
            console.warn("[payments/PATCH] no payment_statuses row for status_key; keeping previous payment_status_id", {
                paymentId: id,
                status_key: newSk,
            });
            paymentStatusId = (prevRow as { payment_status_id?: string | null }).payment_status_id ?? null;
        }
        const sync = paymentRowFieldsForStatusKeyChange(
            newSk,
            newSk ? paymentStatusId : null,
            prevRow as { status?: string | null; paid_at?: string | null; posted_at?: string | null; failed_at?: string | null; voided_at?: string | null }
        );
        Object.assign(updates, sync);
    }

    if (body.paid_at !== undefined) {
        updates.paid_at = body.paid_at === "" || body.paid_at == null ? null : body.paid_at;
    }

    const { data, error } = await supabase
        .from("payments")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select("id, status_key, status, paid_at, notes, updated_at, payment_status_id")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (updates.status_key !== undefined) {
        const newStatusKey = (data as { status_key?: string | null } | null)?.status_key ?? null;
        try {
            const meta: Record<string, unknown> = {};
            const pr = prevRow as { job_id?: string | null; customer_id?: string | null };
            if (pr.job_id) meta.job_id = pr.job_id;
            if (pr.customer_id) meta.customer_id = pr.customer_id;
            await emitStatusChangedEvent({
                supabase,
                orgId: ctx.orgId,
                entityType: "payments",
                entityId: id,
                oldStatusKey,
                newStatusKey,
                metadata: Object.keys(meta).length > 0 ? meta : undefined,
            });
        } catch (e) {
            console.warn("[payments/PATCH] emitStatusChangedEvent:", e);
        }
    }

    return NextResponse.json(data ?? { ok: true });
}
