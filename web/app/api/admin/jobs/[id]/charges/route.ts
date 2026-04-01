import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

const ALLOWED_TYPES = new Set(["adjustment", "fee"]);

function normalizeDateOnly(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * POST: create a manual receivable charge on the job (adjustment or fee).
 * Posted immediately so balances and payment UX reflect it without a separate post step.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        /* ignore */
    }

    const chargeTypeRaw = typeof body.charge_type === "string" ? body.charge_type.trim().toLowerCase() : "";
    if (!ALLOWED_TYPES.has(chargeTypeRaw)) {
        return NextResponse.json({ error: "charge_type must be adjustment or fee" }, { status: 400 });
    }

    let amountCents: number;
    if (typeof body.amount_cents === "number" && Number.isFinite(body.amount_cents)) {
        amountCents = Math.round(body.amount_cents);
    } else if (typeof body.amount_dollars === "string" && body.amount_dollars.trim()) {
        const n = Number.parseFloat(body.amount_dollars.trim());
        if (!Number.isFinite(n)) {
            return NextResponse.json({ error: "Invalid amount_dollars" }, { status: 400 });
        }
        amountCents = Math.round(n * 100);
    } else {
        return NextResponse.json({ error: "amount_cents or amount_dollars is required" }, { status: 400 });
    }

    if (amountCents === 0) {
        return NextResponse.json({ error: "amount must be non-zero (use negative cents for a credit adjustment)" }, { status: 400 });
    }

    const description =
        typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 500) : null;
    const serviceDate = normalizeDateOnly(body.service_date);
    const dueDate = normalizeDateOnly(body.due_date) ?? serviceDate;

    const supabase = createAdminClient();
    const { data: job, error: jobErr } = await supabase.from("jobs").select("id, org_id").eq("id", jobId).maybeSingle();
    if (jobErr || !job || (job as { org_id: string }).org_id !== ctx.orgId) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { data: inserted, error: insErr } = await supabase
        .from("charges")
        .insert({
            org_id: ctx.orgId,
            job_id: jobId,
            schedule_id: null,
            subscription_id: null,
            source_charge_id: null,
            charge_type: chargeTypeRaw,
            status: "posted",
            currency_code: "USD",
            amount_cents: amountCents,
            service_date: serviceDate,
            due_date: dueDate,
            posted_at: now,
            voided_at: null,
            description,
            metadata: { source: "admin_manual", created_by_user_id: ctx.userId ?? null },
        })
        .select("id, job_id, charge_type, amount_cents, status, description, service_date, due_date, posted_at")
        .single();

    if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    return NextResponse.json(inserted);
}
