import { describe, expect, it } from "vitest";
import {
  computeJobTotals,
  discountableBaseCentsFromLineRows,
  type JobLineItemRow,
} from "@/lib/pricing/jobPricingCore";
import {
  assertLineItemsConsistent,
  applyPricingInit,
  applyPricingOverride,
  fetchJobPricingColumns,
  fetchLineItems,
  runWithTestJob,
  smokeEnvConfigured,
} from "./jobPricing.smoke.helpers";

/** Minimal row shape for pure math tests (same fields computeJobTotals reads). */
function row(p: Partial<JobLineItemRow> & Pick<JobLineItemRow, "line_type" | "amount_cents" | "metadata">): JobLineItemRow {
  return {
    org_id: "00000000-0000-4000-8000-000000000001",
    job_id: "00000000-0000-4000-8000-000000000002",
    sort_order: 0,
    label: "x",
    quantity: 1,
    unit_amount_cents: p.amount_cents,
    currency_code: "USD",
    ...p,
  } as JobLineItemRow;
}

describe("job pricing — discount scope (pure: computeJobTotals + discountableBase)", () => {
  it("discountableBase excludes lines with is_discountable false", () => {
    const lines: JobLineItemRow[] = [
      row({
        line_type: "service",
        amount_cents: 10_000,
        metadata: { is_discountable: true },
      }),
      row({
        line_type: "fee",
        amount_cents: 5_000,
        metadata: { is_discountable: false },
      }),
    ];
    expect(discountableBaseCentsFromLineRows(lines)).toBe(10_000);
  });

  it("computeJobTotals aggregates explicit discount line; does not infer discount", () => {
    const lines: JobLineItemRow[] = [
      row({
        line_type: "service",
        amount_cents: 10_000,
        metadata: { is_discountable: true },
      }),
      row({
        line_type: "fee",
        amount_cents: 5_000,
        metadata: { is_discountable: false },
      }),
      row({
        line_type: "discount",
        amount_cents: -2_000,
        metadata: { is_discountable: false },
      }),
    ];
    const t = computeJobTotals(lines);
    expect(t.subtotal_cents).toBe(10_000);
    expect(t.discount_total_cents).toBe(2_000);
    expect(t.fee_total_cents).toBe(5_000);
    expect(t.total_cents).toBe(13_000);
  });
});

describe.skipIf(!smokeEnvConfigured())("job pricing — integration (real Supabase + initialize/override)", () => {
  it("TEST 1: booking without discount — one service line, no discount, total matches", async () => {
    await runWithTestJob(async ({ supabase, orgId, jobId }) => {
      const r = await applyPricingInit(supabase, {
        orgId,
        jobId,
        quoteData: {
          grossFirstVisitCents: 25_000,
          netFirstVisitCents: null,
          recurringCents: null,
          quoteOutput: null,
          frequencyLabel: null,
        },
        addons: [],
        discount: { enabled: false },
        source: "book-v2",
        skipIfActiveLines: false,
        replaceExisting: false,
        actorUserId: null,
      });
      expect(r.ok).toBe(true);

      const lines = await fetchLineItems(supabase, jobId, orgId);
      const active = lines.filter((l) => l.is_active);
      assertLineItemsConsistent(active, { activeOnly: false });

      expect(active.filter((l) => l.line_type === "service")).toHaveLength(1);
      expect(active.filter((l) => l.line_type === "discount")).toHaveLength(0);
      expect(active[0].amount_cents).toBe(25_000);

      const job = await fetchJobPricingColumns(supabase, jobId, orgId);
      expect(job?.total_cents).toBe(25_000);
      expect(job?.subtotal_cents).toBe(25_000);
    });
  });

  it("TEST 2: booking with discount — negative discount line, total and cap", async () => {
    await runWithTestJob(async ({ supabase, orgId, jobId }) => {
      const r = await applyPricingInit(supabase, {
        orgId,
        jobId,
        quoteData: {
          grossFirstVisitCents: 20_000,
          netFirstVisitCents: null,
          quoteOutput: null,
          frequencyLabel: null,
        },
        addons: [],
        discount: {
          enabled: true,
          amount_cents: 5_000,
          discount_code: "SMOKE",
          discount_code_id: null,
          discount_program_id: null,
        },
        source: "book-v2",
        skipIfActiveLines: false,
        replaceExisting: false,
        actorUserId: null,
      });
      expect(r.ok).toBe(true);

      const active = (await fetchLineItems(supabase, jobId, orgId)).filter((l) => l.is_active);
      assertLineItemsConsistent(active);
      const disc = active.filter((l) => l.line_type === "discount");
      expect(disc).toHaveLength(1);
      expect(disc[0].amount_cents).toBeLessThan(0);
      expect(disc[0].unit_amount_cents).toBeLessThan(0);

      const job = await fetchJobPricingColumns(supabase, jobId, orgId);
      expect(job?.discount_total_cents).toBe(5_000);
      expect(job?.total_cents).toBe(15_000);
    });
  });

  it("TEST 3: add-ons + discount percent — addon line, discount on full discountable base", async () => {
    await runWithTestJob(async ({ supabase, orgId, jobId }) => {
      const gross = 30_000;
      const addonCents = 5_000;
      const r = await applyPricingInit(supabase, {
        orgId,
        jobId,
        quoteData: {
          grossFirstVisitCents: gross,
          netFirstVisitCents: null,
          quoteOutput: null,
          frequencyLabel: null,
        },
        addons: [{ name: "Oven", priceCents: addonCents }],
        discount: {
          enabled: true,
          percent: 10,
          discount_code: "PCT10",
        },
        source: "book-v2",
        skipIfActiveLines: false,
        replaceExisting: false,
        actorUserId: null,
      });
      expect(r.ok).toBe(true);

      const active = (await fetchLineItems(supabase, jobId, orgId)).filter((l) => l.is_active);
      assertLineItemsConsistent(active);
      expect(active.some((l) => l.line_type === "addon")).toBe(true);

      const service = active.find((l) => l.line_type === "service");
      const addon = active.find((l) => l.line_type === "addon");
      const disc = active.find((l) => l.line_type === "discount");
      expect(service?.amount_cents).toBe(gross - addonCents);
      expect(addon?.amount_cents).toBe(addonCents);

      const base = (service?.amount_cents ?? 0) + (addon?.amount_cents ?? 0);
      expect(base).toBe(gross);
      const expectedDisc = Math.round((base * 10) / 100);
      expect(Math.abs(disc?.amount_cents ?? 0)).toBe(expectedDisc);

      const job = await fetchJobPricingColumns(supabase, jobId, orgId);
      expect(job?.total_cents).toBe(base - expectedDisc);
    });
  });

  it("TEST 4: admin-style initialize — line items, totals, pricing_status locked", async () => {
    await runWithTestJob(async ({ supabase, orgId, jobId }) => {
      const r = await applyPricingInit(supabase, {
        orgId,
        jobId,
        quoteData: {
          grossFirstVisitCents: 18_000,
          netFirstVisitCents: null,
          quoteOutput: null,
          frequencyLabel: null,
        },
        addons: [],
        discount: { enabled: false },
        source: "admin",
        skipIfActiveLines: false,
        replaceExisting: false,
        actorUserId: "00000000-0000-4000-8000-0000000000aa",
      });
      expect(r.ok).toBe(true);

      const active = (await fetchLineItems(supabase, jobId, orgId)).filter((l) => l.is_active);
      expect(active.length).toBeGreaterThanOrEqual(1);
      assertLineItemsConsistent(active);

      const job = await fetchJobPricingColumns(supabase, jobId, orgId);
      expect(job?.pricing_status).toBe("locked");
      expect(job?.total_cents).toBe(18_000);
    });
  });

  it("TEST 5: admin override — prior lines inactive, new lines active, one discount, totals", async () => {
    await runWithTestJob(async ({ supabase, orgId, jobId }) => {
      const first = await applyPricingInit(supabase, {
        orgId,
        jobId,
        quoteData: { grossFirstVisitCents: 10_000, netFirstVisitCents: null, quoteOutput: null, frequencyLabel: null },
        addons: [],
        discount: { enabled: false },
        source: "book-v2",
        skipIfActiveLines: false,
        replaceExisting: false,
        actorUserId: null,
      });
      expect(first.ok).toBe(true);

      const over = await applyPricingOverride(supabase, {
        orgId,
        jobId,
        changes: [
          {
            line_type: "service",
            label: "Service (override)",
            amount_cents: 9_999,
            unit_amount_cents: 9_999,
            quantity: 1,
            sort_order: 0,
            is_discountable: true,
          },
          {
            line_type: "discount",
            label: "Discount (override)",
            amount_cents: -999,
            unit_amount_cents: -999,
            quantity: 1,
            sort_order: 1,
            is_discountable: false,
            pricing_source_line: "discount_program",
            source_entity_type: "discount_program",
            source_entity_id: null,
          },
        ],
        reason: "smoke_test_override",
        actorUserId: null,
      });
      expect(over.ok).toBe(true);

      const all = await fetchLineItems(supabase, jobId, orgId);
      const inactive = all.filter((l) => !l.is_active);
      const active = all.filter((l) => l.is_active);
      expect(inactive.length).toBeGreaterThan(0);
      expect(active.length).toBe(2);
      assertLineItemsConsistent(active);

      const job = await fetchJobPricingColumns(supabase, jobId, orgId);
      expect(job?.subtotal_cents).toBe(9_999);
      expect(job?.discount_total_cents).toBe(999);
      expect(job?.total_cents).toBe(9_000);
      expect(job?.pricing_status).toBe("overridden");
    });
  });

  it("TEST 6: discount amount does not exceed discountable base (fixed cents)", async () => {
    await runWithTestJob(async ({ supabase, orgId, jobId }) => {
      const r = await applyPricingInit(supabase, {
        orgId,
        jobId,
        quoteData: {
          grossFirstVisitCents: 5_000,
          netFirstVisitCents: null,
          quoteOutput: null,
          frequencyLabel: null,
        },
        addons: [],
        discount: {
          enabled: true,
          amount_cents: 99_999,
          discount_code: "BIG",
        },
        source: "book-v2",
        skipIfActiveLines: false,
        replaceExisting: false,
        actorUserId: null,
      });
      expect(r.ok).toBe(true);

      const active = (await fetchLineItems(supabase, jobId, orgId)).filter((l) => l.is_active);
      const disc = active.find((l) => l.line_type === "discount");
      expect(Math.abs(disc?.amount_cents ?? 0)).toBeLessThanOrEqual(5_000);

      const job = await fetchJobPricingColumns(supabase, jobId, orgId);
      expect(job?.total_cents).toBe(0);
    });
  });
});
