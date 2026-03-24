import { NextRequest, NextResponse } from "next/server";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const BACKEND_URL =
  process.env.BACKEND_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/**
 * POST /api/admin/payments/run
 * Proxy to backend POST /admin/payments/run.
 * All Stripe PaymentIntent logic runs in the Python backend (single runtime).
 * Body: { job_id: string, amount_cents?: number, idempotency_key?, payment_target?, schedule_id?, ad_hoc_charge_type?, use_new_card? }
 * Extra keys are forwarded for future backend/ledger use; core charge path remains job_id (+ optional amount_cents).
 */
export async function POST(request: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const ctx = await getAdminContext();
  if (!ctx.ok) return adminContextFailureResponse(ctx);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobId = body.job_id;
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!(await assertRowOrg(supabase, "jobs", jobId, ctx.orgId)).ok) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const t0 = Date.now();
  console.log("[PAYMENTS_RUN] start", {
    jobId: jobId.slice(0, 12),
    has_amount: typeof body.amount_cents === "number",
    payment_target: typeof body.payment_target === "string" ? body.payment_target : undefined,
    has_schedule: typeof body.schedule_id === "string",
    use_new_card: body.use_new_card === true,
    has_pm_id: typeof body.payment_method_id === "string",
    has_client_idempotency: typeof body.idempotency_key === "string" && String(body.idempotency_key).trim().length > 0,
  });

  const payload: Record<string, unknown> = { job_id: jobId };
  if (typeof body.amount_cents === "number") payload.amount_cents = body.amount_cents;
  if (typeof body.payment_target === "string" && body.payment_target.trim()) payload.payment_target = body.payment_target.trim();
  if (typeof body.schedule_id === "string" && body.schedule_id.trim()) payload.schedule_id = body.schedule_id.trim();
  if (typeof body.ad_hoc_charge_type === "string" && body.ad_hoc_charge_type.trim()) {
    payload.ad_hoc_charge_type = body.ad_hoc_charge_type.trim();
  }
  if (typeof body.use_new_card === "boolean") payload.use_new_card = body.use_new_card;
  if (typeof body.payment_method_id === "string" && body.payment_method_id.trim()) {
    payload.payment_method_id = body.payment_method_id.trim();
  }
  if (typeof body.save_payment_method === "boolean") payload.save_payment_method = body.save_payment_method;
  if (typeof body.idempotency_key === "string" && body.idempotency_key.trim()) {
    payload.idempotency_key = body.idempotency_key.trim();
  }

  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/admin/payments/run`;
  console.log("[PAYMENTS_RUN] env:", {
    VERCEL_ENV: process.env.VERCEL_ENV,
    BACKEND_API_BASE_URL: process.env.BACKEND_API_BASE_URL,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    backendUrl,
  });
  const res = await fetch(backendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  console.log("[PAYMENTS_RUN] backend response", {
    ms: Date.now() - t0,
    status: res.status,
    textTruncated: responseText.slice(0, 500),
  });
  const data = responseText ? (() => { try { return JSON.parse(responseText); } catch { return {}; } })() : {};
  return NextResponse.json(data, { status: res.status });
}
