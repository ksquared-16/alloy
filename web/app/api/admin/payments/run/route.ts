import { NextRequest, NextResponse } from "next/server";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdmin } from "@/lib/adminAuth";
import { emitEvent } from "@/lib/emitEvent";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const BACKEND_URL =
  process.env.BACKEND_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/**
 * Service credential for the payment executor. SERVER-ONLY — deliberately not
 * NEXT_PUBLIC_, so it is never bundled into browser JavaScript.
 */
const PAYMENT_EXECUTOR_SECRET = process.env.PAYMENT_EXECUTOR_SECRET ?? "";
const PAYMENT_EXECUTOR_HEADER = "X-ALLOY-PAYMENT-EXECUTOR-SECRET";

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
  const ctx = await getAdminContextCached();
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

  /**
   * Phase 0 containment. The executor is now an authenticated internal service
   * endpoint, so this proxy supplies:
   *   - trusted organization context, resolved from the SESSION (never the body)
   *   - a stable idempotency key
   *   - the dedicated server-only service credential
   *
   * `amount_cents` is deliberately NOT forwarded. The executor resolves the
   * payable amount from server-side records and rejects a caller-supplied
   * amount outright. A client-stated amount travels as `expected_amount_cents`,
   * an optimistic consistency check that can only cause a rejection — it can
   * never widen financial authority.
   */
  const payload: Record<string, unknown> = { job_id: jobId, org_id: ctx.orgId };
  if (typeof body.amount_cents === "number") payload.expected_amount_cents = body.amount_cents;
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
  /**
   * Idempotency is mandatory at the executor. Previously it was optional, so a
   * retry created a NEW PaymentIntent. When the client does not supply a key we
   * derive a stable one from (org, job, amount intent) rather than letting the
   * request through unkeyed.
   */
  const clientKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim() ? body.idempotency_key.trim() : null;
  payload.idempotency_key =
    clientKey ?? `alloy:${ctx.orgId}:${jobId}:${typeof body.amount_cents === "number" ? body.amount_cents : "canonical"}`;

  if (!PAYMENT_EXECUTOR_SECRET) {
    // Fail closed, and say so plainly: a misconfigured deployment must not fall
    // back to calling an unauthenticated executor.
    console.error("[PAYMENTS_RUN] PAYMENT_EXECUTOR_SECRET is not configured");
    return NextResponse.json(
      { error: "Payments are not configured on this deployment", code: "PAYMENT_EXECUTOR_UNCONFIGURED" },
      { status: 503 }
    );
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
    headers: {
      "Content-Type": "application/json",
      [PAYMENT_EXECUTOR_HEADER]: PAYMENT_EXECUTOR_SECRET,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  console.log("[PAYMENTS_RUN] backend response", {
    ms: Date.now() - t0,
    status: res.status,
    textTruncated: responseText.slice(0, 500),
  });
  const data = responseText ? (() => { try { return JSON.parse(responseText); } catch { return {}; } })() : {};
  /**
   * Durable payment rows are written in the Python backend; this proxy is the UI boundary
   * that observes final succeeded/failed responses and mirrors them into workflow_events.
   */
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    if (res.ok && d.ok === true && d.status === "succeeded" && typeof d.payment_id === "string") {
      try {
        await emitEvent({
          org_id: ctx.orgId,
          event_type: "payment_succeeded",
          entity_type: "payments",
          entity_id: d.payment_id,
          payload: {
            job_id: jobId,
            amount_cents: d.amount_cents,
            provider_payment_id: d.provider_payment_id,
            actor_user_id: ctx.userId,
            source: "admin_payments_run",
          },
        });
      } catch (e) {
        console.warn("[PAYMENTS_RUN] emitEvent payment_succeeded", e instanceof Error ? e.message : e);
      }
    }
    if (res.status === 400 && d.ok === false && typeof d.payment_id === "string" && d.requires_action !== true) {
      try {
        await emitEvent({
          org_id: ctx.orgId,
          event_type: "payment_failed",
          entity_type: "payments",
          entity_id: d.payment_id,
          payload: {
            job_id: jobId,
            error: d.error,
            status: d.status,
            actor_user_id: ctx.userId,
            source: "admin_payments_run",
          },
        });
      } catch (e) {
        console.warn("[PAYMENTS_RUN] emitEvent payment_failed", e instanceof Error ? e.message : e);
      }
    }
  }
  return NextResponse.json(data, { status: res.status });
}
