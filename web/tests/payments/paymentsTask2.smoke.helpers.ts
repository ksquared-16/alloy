/**
 * Task 2 payments + payment_allocations smoke helpers.
 * Reuses pricing smoke env loading (dotenv + service role) from ../pricing/jobPricing.smoke.helpers.
 *
 * Read-model checks use the same @/lib/admin/jobPaymentBalances helpers as GET /api/admin/jobs/[id]/payments
 * (no admin cookie / Next server required for the default P5).
 */

import { createHmac } from "crypto";
import {
  batchAllocatedCentsForJob,
  batchPaymentAllocationRollups,
  computeJobBalanceSnapshot,
  getJobPricingTotalCents,
  getPaymentIdsForJob,
} from "@/lib/admin/jobPaymentBalances";
import {
  createSmokeSupabase,
  createTestJob,
  deleteTestJob,
  smokeCustomerId,
  smokeEnvConfigured,
  smokeOrgId,
} from "../pricing/jobPricing.smoke.helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

export { createSmokeSupabase, smokeOrgId, smokeCustomerId };

export const PAYMENTS_TASK2_SMOKE_MARKER = "payments_task2_v1";

/** Extends pricing smoke: Supabase + org + customer + Stripe webhook secret (synthetic signed events). */
export function paymentsTask2SmokeConfigured(): boolean {
  if (!smokeEnvConfigured()) return false;
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

/** Optional: PAYMENTS_TASK2_SMOKE_ADMIN_COOKIE + running Next — parity with cookie-protected routes only. */
export function paymentsTask2ReadApiConfigured(): boolean {
  return Boolean(process.env.PAYMENTS_TASK2_SMOKE_ADMIN_COOKIE?.trim());
}

export function smokeBackendBaseUrl(): string {
  const u =
    process.env.SMOKE_BACKEND_URL?.trim() ||
    process.env.BACKEND_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "http://127.0.0.1:8000";
  return u.replace(/\/$/, "");
}

export function smokeWebBaseUrl(): string {
  const u = process.env.SMOKE_WEB_BASE_URL?.trim() || "http://127.0.0.1:3000";
  return u.replace(/\/$/, "");
}

export function stripeWebhookSignatureHeader(body: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const signedPayload = `${t}.${body}`;
  const v1 = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

export async function postStripeWebhook(backendBase: string, secret: string, event: Record<string, unknown>): Promise<Response> {
  const body = JSON.stringify(event);
  const sig = stripeWebhookSignatureHeader(body, secret);
  return fetch(`${backendBase}/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": sig,
    },
    body,
  });
}

export function buildPaymentIntentEvent(
  eventType: string,
  piId: string,
  metadata: Record<string, string>,
  piStatus = "succeeded"
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: `evt_smoke_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    type: eventType,
    data: {
      object: {
        id: piId,
        object: "payment_intent",
        status: piStatus,
        metadata,
      },
    },
  };
  if (eventType === "payment_intent.payment_failed") {
    (base.data as { object: Record<string, unknown> }).object.last_payment_error = { message: "Your card was declined." };
  }
  return base;
}

export async function getPaymentStatusIdByKey(supabase: SupabaseClient, key: string): Promise<string | null> {
  const { data, error } = await supabase.from("payment_statuses").select("id").eq("key", key).limit(1).maybeSingle();
  if (error) throw new Error(`payment_statuses ${key}: ${error.message}`);
  return (data as { id?: string } | null)?.id ?? null;
}

export async function deletePaymentsAndAllocationsForJob(supabase: SupabaseClient, orgId: string, jobId: string): Promise<void> {
  const { data: byJob } = await supabase.from("payments").select("id").eq("org_id", orgId).eq("job_id", jobId);
  const { data: allocRows } = await supabase
    .from("payment_allocations")
    .select("payment_id")
    .eq("org_id", orgId)
    .eq("target_entity_type", "job")
    .eq("target_entity_id", jobId);

  const ids = new Set<string>();
  for (const r of byJob ?? []) {
    if (r && typeof (r as { id?: string }).id === "string") ids.add((r as { id: string }).id);
  }
  for (const r of allocRows ?? []) {
    if (r && typeof (r as { payment_id?: string }).payment_id === "string") ids.add((r as { payment_id: string }).payment_id);
  }

  for (const pid of ids) {
    await supabase.from("payment_allocations").delete().eq("payment_id", pid);
    await supabase.from("payments").delete().eq("id", pid).eq("org_id", orgId);
  }
}

export async function cleanupMarkerPaymentsForJob(supabase: SupabaseClient, orgId: string, jobId: string): Promise<void> {
  const { data: rows } = await supabase
    .from("payments")
    .select("id, metadata")
    .eq("org_id", orgId)
    .eq("job_id", jobId);

  for (const row of rows ?? []) {
    const meta = (row as { id: string; metadata?: { task2_smoke?: string } }).metadata;
    if (meta?.task2_smoke === PAYMENTS_TASK2_SMOKE_MARKER) {
      const id = (row as { id: string }).id;
      await supabase.from("payment_allocations").delete().eq("payment_id", id);
      await supabase.from("payments").delete().eq("id", id).eq("org_id", orgId);
    }
  }
}

export async function insertMarkerPayment(
  supabase: SupabaseClient,
  args: {
    orgId: string;
    jobId: string;
    customerId: string;
    pendingStatusId: string;
    amountCents: number;
    providerPaymentId: string | null;
  }
): Promise<string> {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const row: Record<string, unknown> = {
    job_id: args.jobId,
    customer_id: args.customerId,
    org_id: args.orgId,
    amount_cents: args.amountCents,
    currency: "USD",
    payment_status_id: args.pendingStatusId,
    provider: "stripe",
    processor: "stripe",
    status: "pending",
    direction: "inbound",
    received_at: now,
    payment_method: "card",
    status_key: "pending",
    metadata: { task2_smoke: PAYMENTS_TASK2_SMOKE_MARKER },
  };
  if (args.providerPaymentId) {
    row.provider_payment_id = args.providerPaymentId;
    row.processor_transaction_id = args.providerPaymentId;
  }

  const { data, error } = await supabase.from("payments").insert(row).select("id").single();
  if (error || !data) throw new Error(`insertMarkerPayment: ${error?.message ?? "no row"}`);
  return (data as { id: string }).id;
}

export async function fetchPaymentRow(supabase: SupabaseClient, paymentId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (error) throw new Error(`fetchPaymentRow: ${error.message}`);
  return data as Record<string, unknown> | null;
}

export async function listAllocationsForPayment(
  supabase: SupabaseClient,
  paymentId: string
): Promise<{ target_entity_type: string; target_entity_id: string; allocated_amount_cents: number }[]> {
  const { data, error } = await supabase
    .from("payment_allocations")
    .select("target_entity_type, target_entity_id, allocated_amount_cents")
    .eq("payment_id", paymentId);
  if (error) throw new Error(`listAllocationsForPayment: ${error.message}`);
  return (data ?? []) as { target_entity_type: string; target_entity_id: string; allocated_amount_cents: number }[];
}

/** Same columns as web/app/api/admin/jobs/[id]/payments/route.ts */
const JOB_PAYMENTS_SELECT =
  "id, created_at, amount_cents, status, received_at, posted_at, processor, processor_transaction_id, paid_at, provider_payment_id, payment_status_id, status_key, org_id";

/**
 * Core read-model state for a job: matches GET /api/admin/jobs/[id]/payments data sources
 * (getPaymentIdsForJob + payments query + batchPaymentAllocationRollups + batchAllocatedCentsForJob + computeJobBalanceSnapshot).
 * Does not fetch status-definition labels (UI-only).
 */
export async function loadJobPaymentsReadModelCore(supabase: SupabaseClient, orgId: string, jobId: string) {
  const paymentIds = await getPaymentIdsForJob(supabase, orgId, jobId);
  let rows: Record<string, unknown>[] = [];
  if (paymentIds.length > 0) {
    const { data, error } = await supabase
      .from("payments")
      .select(JOB_PAYMENTS_SELECT)
      .eq("org_id", orgId)
      .in("id", paymentIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`loadJobPaymentsReadModelCore payments: ${error.message}`);
    rows = (data ?? []) as Record<string, unknown>[];
  }

  const amountById = new Map<string, number>();
  for (const r of rows) {
    const id = r.id as string;
    const raw = (r as { amount_cents?: unknown }).amount_cents;
    const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
    amountById.set(id, Number.isFinite(n) ? Math.round(n) : 0);
  }

  const [rollups, toJobAlloc, snap, jobTotalFallback] = await Promise.all([
    batchPaymentAllocationRollups(supabase, orgId, paymentIds, amountById),
    batchAllocatedCentsForJob(supabase, orgId, jobId, paymentIds),
    computeJobBalanceSnapshot(supabase, orgId, jobId),
    getJobPricingTotalCents(supabase, orgId, jobId),
  ]);

  const jobTotalCents = snap.job_total_cents ?? jobTotalFallback;
  const jobOriginalSafe = jobTotalCents != null && jobTotalCents > 0 ? jobTotalCents : null;
  const basisForBalance = jobOriginalSafe ?? 0;
  const paidCents = snap.paid_amount_cents;
  const jobBalanceCents =
    snap.outstanding_balance_cents != null
      ? snap.outstanding_balance_cents
      : Math.max(0, basisForBalance - paidCents);

  return {
    paymentIds,
    rows,
    rollups,
    toJobAlloc,
    snap,
    /** Same numeric contract as payment-collect-context `job` block (without schedule branch). */
    collectContextParity: {
      job_total_cents: jobTotalCents,
      paid_cents: paidCents,
      pending_payment_amount_cents: snap.pending_payment_amount_cents,
      balance_cents: jobBalanceCents,
    },
  };
}

export async function runWithPaymentsSmokeJob<T>(
  fn: (ctx: {
    supabase: SupabaseClient;
    orgId: string;
    jobId: string;
    customerId: string;
    /** Track for logging; optional deletes for admin-created rows */
    createdPaymentIds: string[];
  }) => Promise<T>
): Promise<T> {
  const supabase = createSmokeSupabase();
  const orgId = smokeOrgId();
  const customerId = smokeCustomerId();
  const jobId = await createTestJob(supabase, orgId, customerId);
  const createdPaymentIds: string[] = [];
  try {
    return await fn({ supabase, orgId, jobId, customerId, createdPaymentIds });
  } finally {
    await cleanupMarkerPaymentsForJob(supabase, orgId, jobId);
    for (const pid of createdPaymentIds) {
      await supabase.from("payment_allocations").delete().eq("payment_id", pid);
      await supabase.from("payments").delete().eq("id", pid).eq("org_id", orgId);
    }
    await deletePaymentsAndAllocationsForJob(supabase, orgId, jobId);
    await deleteTestJob(supabase, jobId, orgId);
  }
}

export async function adminPaymentsRun(
  backendBase: string,
  jobId: string,
  amountCents: number,
  idempotencyKey: string
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(`${backendBase}/admin/payments/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: jobId, amount_cents: amountCents, idempotency_key: idempotencyKey }),
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  return { ok: res.ok, status: res.status, json };
}

export async function fetchWithAdminCookie(path: string): Promise<{ status: number; json: unknown }> {
  const cookie = process.env.PAYMENTS_TASK2_SMOKE_ADMIN_COOKIE?.trim();
  if (!cookie) throw new Error("PAYMENTS_TASK2_SMOKE_ADMIN_COOKIE not set");
  const base = smokeWebBaseUrl();
  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    headers: { Cookie: cookie },
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, json };
}
