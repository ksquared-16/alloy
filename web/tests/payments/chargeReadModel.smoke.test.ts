import { beforeAll, describe, expect, it } from "vitest";
import {
  computeJobBalanceSnapshot,
  fetchNonVoidChargesForJob,
  getPaymentIdsForJob,
} from "@/lib/admin/jobPaymentBalances";
import type { ComputedPricingTotals } from "@/lib/pricing/jobPricingCore";
import { upsertPrimaryDraftServiceCharge } from "@/lib/pricing/upsertPrimaryDraftServiceCharge";
import {
  createSmokeSupabase,
  createTestJob,
  deleteTestJob,
  smokeCustomerId,
  smokeEnvConfigured,
  smokeOrgId,
} from "../pricing/jobPricing.smoke.helpers";
import {
  buildPaymentIntentEvent,
  fetchWithAdminCookie,
  getPaymentStatusIdByKey,
  insertMarkerPayment,
  listAllocationsForPayment,
  paymentsTask2ReadApiConfigured,
  paymentsTask2SmokeConfigured,
  postStripeWebhook,
  runWithPaymentsSmokeJob,
  smokeBackendBaseUrl,
} from "./paymentsTask2.smoke.helpers";

function totals10k(): ComputedPricingTotals {
  return {
    subtotal_cents: 10_000,
    discount_total_cents: 0,
    fee_total_cents: 0,
    adjustment_total_cents: 0,
    tax_total_cents: 0,
    total_cents: 10_000,
  };
}

function logPass(name: string, extra?: Record<string, unknown>) {
  console.log(`PASS charge-read-smoke: ${name}`, extra ? JSON.stringify(extra) : "");
}

describe.skipIf(!smokeEnvConfigured())("charge receivable read model — smoke (Supabase service role)", () => {
  it("C1: upsertPrimaryDraftServiceCharge creates a draft primary service charge", async () => {
    const supabase = createSmokeSupabase();
    const orgId = smokeOrgId();
    const customerId = smokeCustomerId();
    const jobId = await createTestJob(supabase, orgId, customerId);
    try {
      const up = await upsertPrimaryDraftServiceCharge({
        supabase,
        orgId,
        jobId,
        totals: totals10k(),
        source: "admin",
      });
      expect(up.ok, JSON.stringify(up)).toBe(true);
      if (!up.ok) return;
      expect(up.skipped).toBe(false);

      const charges = await fetchNonVoidChargesForJob(supabase, orgId, jobId);
      expect(charges.length).toBeGreaterThanOrEqual(1);
      const draft = charges.find((c) => String(c.status ?? "").toLowerCase() === "draft");
      expect(draft, "expected a draft charge").toBeTruthy();

      const snap = await computeJobBalanceSnapshot(supabase, orgId, jobId);
      expect(snap.receivable_source).toBe("charges");
      expect(snap.job_total_cents).toBe(10_000);
      expect(snap.paid_amount_cents).toBe(0);
      expect(snap.outstanding_balance_cents).toBe(10_000);
      expect(snap.open_charge_count).toBeGreaterThanOrEqual(1);

      logPass("C1 draft charge + snapshot", { job_id: jobId, charge_id: (up as { charge_id?: string }).charge_id });
    } finally {
      await deleteTestJob(supabase, jobId, orgId);
    }
  });

  it("C2: posted allocation with charge_id — balance and per-charge outstanding match charges", async () => {
    const supabase = createSmokeSupabase();
    const orgId = smokeOrgId();
    const customerId = smokeCustomerId();
    const jobId = await createTestJob(supabase, orgId, customerId);
    try {
      const up = await upsertPrimaryDraftServiceCharge({
        supabase,
        orgId,
        jobId,
        totals: totals10k(),
        source: "admin",
      });
      expect(up.ok && !up.skipped, JSON.stringify(up)).toBe(true);
      if (!up.ok || up.skipped) return;
      const chargeId = up.charge_id;

      const pendingId = await getPaymentStatusIdByKey(supabase, "pending");
      const paidStatusId = await getPaymentStatusIdByKey(supabase, "paid");
      expect(pendingId).toBeTruthy();
      expect(paidStatusId).toBeTruthy();

      const payId = await insertMarkerPayment(supabase, {
        orgId,
        jobId,
        customerId,
        pendingStatusId: pendingId!,
        amountCents: 2500,
        providerPaymentId: `pi_charge_read_${Math.random().toString(36).slice(2, 14)}`,
      });

      const now = new Date().toISOString();
      const { error: payUpErr } = await supabase
        .from("payments")
        .update({
          status: "posted",
          posted_at: now,
          paid_at: now,
          payment_status_id: paidStatusId!,
          status_key: "paid",
        })
        .eq("id", payId)
        .eq("org_id", orgId);
      expect(payUpErr?.message).toBeFalsy();

      const { error: insAllocErr } = await supabase.from("payment_allocations").insert({
        org_id: orgId,
        payment_id: payId,
        target_entity_type: "job",
        target_entity_id: jobId,
        allocated_amount_cents: 2500,
        status: "active",
        allocation_type: "payment_application",
        charge_id: chargeId,
      });
      expect(insAllocErr?.message).toBeFalsy();

      const postedAt = new Date().toISOString();
      await supabase
        .from("charges")
        .update({ status: "posted", posted_at: postedAt, updated_at: postedAt })
        .eq("id", chargeId)
        .eq("org_id", orgId);

      const snap = await computeJobBalanceSnapshot(supabase, orgId, jobId);
      expect(snap.receivable_source).toBe("charges");
      expect(snap.job_total_cents).toBe(10_000);
      expect(snap.paid_amount_cents).toBe(2500);
      expect(snap.outstanding_balance_cents).toBe(7500);

      const primaryRow = snap.charge_balance_rows?.find((r) => r.charge_id === chargeId);
      expect(primaryRow?.posted_allocated_cents).toBe(2500);
      expect(primaryRow?.outstanding_cents).toBe(7500);

      const pids = await getPaymentIdsForJob(supabase, orgId, jobId);
      expect(pids).toContain(payId);

      await supabase.from("payment_allocations").delete().eq("payment_id", payId);
      await supabase.from("payments").delete().eq("id", payId).eq("org_id", orgId);

      logPass("C2 charge-linked allocation math", { job_id: jobId, payment_id: payId });
    } finally {
      await deleteTestJob(supabase, jobId, orgId);
    }
  });
});

describe.skipIf(!paymentsTask2SmokeConfigured())(
  "charge read model — webhook posts draft charge + allocation charge_id",
  () => {
    let backend: string;
    let whSecret: string;
    beforeAll(() => {
      backend = smokeBackendBaseUrl();
      const s = process.env.STRIPE_WEBHOOK_SECRET?.trim();
      if (!s) throw new Error("STRIPE_WEBHOOK_SECRET missing");
      whSecret = s;
    });

    it("C3: after pricing draft charge, webhook success sets charge_id and posts charge", async () => {
      await runWithPaymentsSmokeJob(async ({ supabase, orgId, jobId, customerId, createdPaymentIds }) => {
        const up = await upsertPrimaryDraftServiceCharge({
          supabase,
          orgId,
          jobId,
          totals: totals10k(),
          source: "admin",
        });
        expect(up.ok && !up.skipped, JSON.stringify(up)).toBe(true);
        if (!up.ok || up.skipped) return;
        const chargeId = up.charge_id;

        const beforeCh = await supabase.from("charges").select("status").eq("id", chargeId).single();
        expect(String((beforeCh.data as { status?: string } | null)?.status ?? "").toLowerCase()).toBe("draft");

        const pendingId = await getPaymentStatusIdByKey(supabase, "pending");
        expect(pendingId).toBeTruthy();
        const amount = 1999;
        const pi = `pi_charge_webhook_${Math.random().toString(36).slice(2, 14)}`;
        const payId = await insertMarkerPayment(supabase, {
          orgId,
          jobId,
          customerId,
          pendingStatusId: pendingId!,
          amountCents: amount,
          providerPaymentId: pi,
        });
        createdPaymentIds.push(payId);

        const ev = buildPaymentIntentEvent("payment_intent.succeeded", pi, { payment_id: payId });
        expect((await postStripeWebhook(backend, whSecret, ev)).status).toBe(200);

        const afterCh = await supabase.from("charges").select("status").eq("id", chargeId).single();
        expect(["posted", "partially_paid", "paid"]).toContain(
          String((afterCh.data as { status?: string } | null)?.status ?? "").toLowerCase()
        );

        const allocs = await listAllocationsForPayment(supabase, payId);
        expect(allocs.some((a) => a.target_entity_type === "job" && a.target_entity_id === jobId)).toBe(true);

        const { data: allocWithCharge } = await supabase
          .from("payment_allocations")
          .select("charge_id")
          .eq("payment_id", payId)
          .eq("org_id", orgId)
          .maybeSingle();
        expect((allocWithCharge as { charge_id?: string } | null)?.charge_id).toBe(chargeId);

        const snap = await computeJobBalanceSnapshot(supabase, orgId, jobId);
        expect(snap.receivable_source).toBe("charges");
        expect(snap.job_total_cents).toBe(10_000);
        expect(snap.paid_amount_cents).toBe(amount);

        logPass("C3 webhook + charge_id + posted charge", { payment_id: payId, charge_id: chargeId });
      });
    });
  }
);

describe.skipIf(!smokeEnvConfigured() || !paymentsTask2ReadApiConfigured())(
  "charge read model — GET job payments summary (Next route)",
  () => {
    it("C4: payment_summary matches charge-based snapshot", async () => {
      await runWithPaymentsSmokeJob(async ({ supabase, orgId, jobId, customerId, createdPaymentIds }) => {
        const up = await upsertPrimaryDraftServiceCharge({
          supabase,
          orgId,
          jobId,
          totals: totals10k(),
          source: "admin",
        });
        expect(up.ok && !up.skipped, JSON.stringify(up)).toBe(true);
        if (!up.ok || up.skipped) return;

        const pendingId = await getPaymentStatusIdByKey(supabase, "pending");
        const paidStatusId = await getPaymentStatusIdByKey(supabase, "paid");
        expect(pendingId).toBeTruthy();
        expect(paidStatusId).toBeTruthy();

        const payId = await insertMarkerPayment(supabase, {
          orgId,
          jobId,
          customerId,
          pendingStatusId: pendingId!,
          amountCents: 1000,
          providerPaymentId: null,
        });
        createdPaymentIds.push(payId);

        const now = new Date().toISOString();
        await supabase
          .from("payments")
          .update({
            status: "posted",
            posted_at: now,
            paid_at: now,
            payment_status_id: paidStatusId!,
            status_key: "paid",
          })
          .eq("id", payId)
          .eq("org_id", orgId);

        await supabase.from("payment_allocations").insert({
          org_id: orgId,
          payment_id: payId,
          target_entity_type: "job",
          target_entity_id: jobId,
          allocated_amount_cents: 1000,
          status: "active",
          allocation_type: "payment_application",
          charge_id: up.charge_id,
        });

        const postedAt = new Date().toISOString();
        await supabase
          .from("charges")
          .update({ status: "posted", posted_at: postedAt, updated_at: postedAt })
          .eq("id", up.charge_id)
          .eq("org_id", orgId);

        const snap = await computeJobBalanceSnapshot(supabase, orgId, jobId);
        const enc = encodeURIComponent(jobId);
        const { status, json } = await fetchWithAdminCookie(`/api/admin/jobs/${enc}/payments`);
        expect(status, "GET job payments").toBe(200);
        const body = json as {
          payment_summary?: {
            job_total_cents?: number | null;
            paid_amount_cents?: number;
            outstanding_balance_cents?: number | null;
          };
        };
        expect(body.payment_summary?.job_total_cents).toBe(snap.job_total_cents);
        expect(body.payment_summary?.paid_amount_cents).toBe(snap.paid_amount_cents);
        expect(body.payment_summary?.outstanding_balance_cents).toBe(snap.outstanding_balance_cents);

        logPass("C4 GET payments payment_summary parity", { job_id: jobId });
      });
    });
  }
);
