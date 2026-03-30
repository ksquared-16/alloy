import { beforeAll, describe, expect, it } from "vitest";
import { computeJobBalanceSnapshot } from "@/lib/admin/jobPaymentBalances";
import {
  adminPaymentsRun,
  buildPaymentIntentEvent,
  fetchPaymentRow,
  fetchWithAdminCookie,
  getPaymentStatusIdByKey,
  insertMarkerPayment,
  listAllocationsForPayment,
  loadJobPaymentsReadModelCore,
  paymentsTask2ReadApiConfigured,
  paymentsTask2SmokeConfigured,
  postStripeWebhook,
  runWithPaymentsSmokeJob,
  smokeBackendBaseUrl,
} from "./paymentsTask2.smoke.helpers";

function logPass(name: string, extra?: Record<string, unknown>) {
  console.log(`PASS payments-smoke: ${name}`, extra ? JSON.stringify(extra) : "");
}

describe.skipIf(!paymentsTask2SmokeConfigured())("payments task 2 — smoke (allocations + webhooks + balance)", () => {
  let backend: string;
  let whSecret: string;
  beforeAll(() => {
    backend = smokeBackendBaseUrl();
    const s = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!s) throw new Error("STRIPE_WEBHOOK_SECRET missing (required when payments smoke is enabled)");
    whSecret = s;
  });

  it("TEST P1: webhook success idempotency — posted + single job allocation, replay safe", async () => {
    await runWithPaymentsSmokeJob(async ({ supabase, orgId, jobId, customerId, createdPaymentIds }) => {
      const pendingId = await getPaymentStatusIdByKey(supabase, "pending");
      const paidId = await getPaymentStatusIdByKey(supabase, "paid");
      expect(pendingId, "payment_status pending").toBeTruthy();
      expect(paidId, "payment_status paid").toBeTruthy();

      const pi = `pi_smoke_idem_${Math.random().toString(36).slice(2, 14)}`;
      const amount = 2100;
      const payId = await insertMarkerPayment(supabase, {
        orgId,
        jobId,
        customerId,
        pendingStatusId: pendingId!,
        amountCents: amount,
        providerPaymentId: pi,
      });
      createdPaymentIds.push(payId);
      console.log("[payments-smoke] created payment_id", payId);

      const ev1 = buildPaymentIntentEvent("payment_intent.succeeded", pi, { payment_id: payId });
      const r1 = await postStripeWebhook(backend, whSecret, ev1);
      expect(r1.status, "webhook 1").toBe(200);

      const row1 = await fetchPaymentRow(supabase, payId);
      expect(row1?.status).toBe("posted");

      const ev2 = buildPaymentIntentEvent("payment_intent.succeeded", pi, { payment_id: payId });
      const r2 = await postStripeWebhook(backend, whSecret, ev2);
      expect(r2.status, "webhook 2").toBe(200);

      const allocs = await listAllocationsForPayment(supabase, payId);
      const jobAllocs = allocs.filter((a) => a.target_entity_type === "job" && a.target_entity_id === jobId);
      expect(jobAllocs).toHaveLength(1);
      expect(jobAllocs[0].allocated_amount_cents).toBe(amount);

      logPass("P1 webhook idempotency", { payment_id: payId, pi });
    });
  });

  it("TEST P2: payment_failed webhook — failed status; paid job total unchanged", async () => {
    await runWithPaymentsSmokeJob(async ({ supabase, orgId, jobId, customerId, createdPaymentIds }) => {
      const before = await computeJobBalanceSnapshot(supabase, orgId, jobId);
      const pendingId = await getPaymentStatusIdByKey(supabase, "pending");
      expect(pendingId).toBeTruthy();

      const pi = `pi_smoke_fail_${Math.random().toString(36).slice(2, 14)}`;
      const payId = await insertMarkerPayment(supabase, {
        orgId,
        jobId,
        customerId,
        pendingStatusId: pendingId!,
        amountCents: 2200,
        providerPaymentId: pi,
      });
      createdPaymentIds.push(payId);
      console.log("[payments-smoke] created payment_id", payId);

      const ev = buildPaymentIntentEvent("payment_intent.payment_failed", pi, { payment_id: payId }, "requires_payment_method");
      const res = await postStripeWebhook(backend, whSecret, ev);
      expect(res.status).toBe(200);

      const row = await fetchPaymentRow(supabase, payId);
      expect(row?.status).toBe("failed");
      expect(row?.failed_at).toBeTruthy();

      const after = await computeJobBalanceSnapshot(supabase, orgId, jobId);
      expect(after.paid_amount_cents).toBe(before.paid_amount_cents);

      logPass("P2 failed payment no paid delta", { payment_id: payId, paid_before: before.paid_amount_cents });
    });
  });

  it("TEST P3: metadata fallback — wrong provider_payment_id, succeeded reconciles", async () => {
    await runWithPaymentsSmokeJob(async ({ supabase, orgId, jobId, customerId, createdPaymentIds }) => {
      const pendingId = await getPaymentStatusIdByKey(supabase, "pending");
      expect(pendingId).toBeTruthy();

      const wrongPi = `pi_smoke_wrong_${Math.random().toString(36).slice(2, 14)}`;
      const rightPi = `pi_smoke_right_${Math.random().toString(36).slice(2, 14)}`;
      const amount = 2300;
      const payId = await insertMarkerPayment(supabase, {
        orgId,
        jobId,
        customerId,
        pendingStatusId: pendingId!,
        amountCents: amount,
        providerPaymentId: wrongPi,
      });
      createdPaymentIds.push(payId);
      console.log("[payments-smoke] created payment_id", payId);

      const ev = buildPaymentIntentEvent("payment_intent.succeeded", rightPi, { payment_id: payId });
      const res = await postStripeWebhook(backend, whSecret, ev);
      expect(res.status).toBe(200);

      const row = await fetchPaymentRow(supabase, payId);
      expect(row?.status).toBe("posted");
      expect(row?.provider_payment_id).toBe(rightPi);

      const allocs = await listAllocationsForPayment(supabase, payId);
      expect(allocs.some((a) => a.target_entity_type === "job" && Number(a.allocated_amount_cents) === amount)).toBe(true);

      logPass("P3 metadata fallback", { payment_id: payId, rightPi });
    });
  });

  it.skipIf(process.env.PAYMENTS_TASK2_SKIP_ADMIN_E2E === "1")(
    "TEST P4: admin happy path — POST /admin/payments/run → posted + allocation (needs card on smoke customer)",
    async () => {
    await runWithPaymentsSmokeJob(async ({ supabase, orgId, jobId, customerId, createdPaymentIds }) => {
      const idem = `vitest_payments_task2_${Math.random().toString(36).slice(2)}`;
      const { ok, status, json } = await adminPaymentsRun(backend, jobId, 50, idem);
      expect(ok && json?.ok === true, `admin run failed (${status}): ${JSON.stringify(json)} — set PAYMENTS_TASK2_SKIP_ADMIN_E2E=1 to skip, or fix stripe_customer_id + default PM on JOB_PRICING_SMOKE_CUSTOMER_ID`).toBe(
        true
      );

      const payId = String(json!.payment_id ?? "");
      expect(payId.length).toBeGreaterThan(10);
      createdPaymentIds.push(payId);
      console.log("[payments-smoke] admin payment_id", payId, "provider_payment_id", json?.provider_payment_id);

      const row = await fetchPaymentRow(supabase, payId);
      expect(row?.status).toBe("posted");
      expect(row?.posted_at).toBeTruthy();
      expect(row?.paid_at).toBeTruthy();

      const allocs = await listAllocationsForPayment(supabase, payId);
      const jobAllocs = allocs.filter((a) => a.target_entity_type === "job" && a.target_entity_id === jobId);
      expect(jobAllocs.length).toBeGreaterThanOrEqual(1);
      expect(Number(jobAllocs[0].allocated_amount_cents)).toBeGreaterThanOrEqual(50);

      logPass("P4 admin happy path", { payment_id: payId, provider_payment_id: json?.provider_payment_id });
    });
  },
  );

  it("TEST P5: read model — service role + shared helpers (no admin cookie)", async () => {
    await runWithPaymentsSmokeJob(async ({ supabase, orgId, jobId, customerId, createdPaymentIds }) => {
      const pendingId = await getPaymentStatusIdByKey(supabase, "pending");
      expect(pendingId).toBeTruthy();
      const pi = `pi_smoke_read_${Math.random().toString(36).slice(2, 14)}`;
      const amount = 1999;
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
      const wr = await postStripeWebhook(backend, whSecret, ev);
      expect(wr.status).toBe(200);

      const core = await loadJobPaymentsReadModelCore(supabase, orgId, jobId);
      console.log("[payments-smoke] P5 payment_id", payId, "read-model", {
        paid_amount_cents: core.snap.paid_amount_cents,
        pending_payment_amount_cents: core.snap.pending_payment_amount_cents,
        outstanding_balance_cents: core.snap.outstanding_balance_cents,
      });

      expect(core.paymentIds, "getPaymentIdsForJob includes posted payment").toContain(payId);
      expect(core.snap.paid_amount_cents).toBe(amount);
      expect(core.snap.pending_payment_amount_cents).toBe(0);

      const allocJob = core.toJobAlloc.get(payId) ?? 0;
      expect(allocJob).toBe(amount);
      const rollup = core.rollups.get(payId);
      expect(rollup?.allocation_state).toBe("fully_allocated");
      expect(rollup?.unallocated_amount_cents).toBe(0);

      const prow = core.rows.find((r) => r.id === payId);
      expect(String(prow?.status ?? "").toLowerCase()).toBe("posted");

      const cc = core.collectContextParity;
      expect(cc.paid_cents).toBe(core.snap.paid_amount_cents);
      expect(cc.pending_payment_amount_cents).toBe(core.snap.pending_payment_amount_cents);
      const expectedBalance =
        core.snap.outstanding_balance_cents != null
          ? core.snap.outstanding_balance_cents
          : Math.max(0, (cc.job_total_cents ?? 0) - core.snap.paid_amount_cents);
      expect(cc.balance_cents).toBe(expectedBalance);

      logPass("P5 read model (helpers)", { payment_id: payId, paid_amount_cents: core.snap.paid_amount_cents });
    });
  });

  describe.skipIf(!paymentsTask2ReadApiConfigured())("optional: Next route parity (cookie + dev server)", () => {
    it("TEST P5b: GET job payments / collect-context / admin payments list vs same snapshot", async () => {
      await runWithPaymentsSmokeJob(async ({ supabase, orgId, jobId, customerId, createdPaymentIds }) => {
        const pendingId = await getPaymentStatusIdByKey(supabase, "pending");
        expect(pendingId).toBeTruthy();
        const pi = `pi_smoke_read_next_${Math.random().toString(36).slice(2, 14)}`;
        const amount = 1888;
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

        const snap = (await loadJobPaymentsReadModelCore(supabase, orgId, jobId)).snap;
        const enc = encodeURIComponent(jobId);

        const { status: st1, json: j1 } = await fetchWithAdminCookie(`/api/admin/jobs/${enc}/payments`);
        expect(st1, "GET job payments").toBe(200);
        expect((j1 as { payment_summary?: { paid_amount_cents?: number } })?.payment_summary?.paid_amount_cents).toBe(
          snap.paid_amount_cents
        );

        const { status: st2, json: j2 } = await fetchWithAdminCookie(`/api/admin/jobs/${enc}/payment-collect-context`);
        expect(st2, "GET payment-collect-context").toBe(200);
        expect((j2 as { job?: { paid_cents?: number } })?.job?.paid_cents).toBe(snap.paid_amount_cents);

        const { status: st3, json: j3 } = await fetchWithAdminCookie(`/api/admin/payments?job_id=${enc}&limit=100`);
        expect(st3, "GET admin payments").toBe(200);
        const payments = (j3 as { payments?: { id?: string; status?: string }[] })?.payments;
        expect(payments?.some((p) => p.id === payId)).toBe(true);

        logPass("P5b Next route parity", { payment_id: payId });
      });
    });
  });
});
