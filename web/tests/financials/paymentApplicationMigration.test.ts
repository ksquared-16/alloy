import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE PAYMENT GUARANTEES THAT ONLY A DATABASE CAN MAKE.
 *
 * Every rule asserted here is one a service check cannot hold on its own, because the failure it
 * prevents is two requests racing: two applications of one payment to one charge, two refunds each
 * believing the full amount is available, two records of one provider event. The census
 * (certification/financials/payments-spine-census.sql, tha_be923375ea3595) found the deployed
 * database carrying NO unique index on either money table beyond the two primary keys — so nothing
 * stood between a retried request and a second reduction of a family's balance.
 *
 * This file reads the migration text. It proves the rules were WRITTEN. That they HOLD against real
 * Postgres is proved by `certification/financials/payment-application.cert.sh`, and the distinction
 * matters: `20260902140000` shipped a trigger and an index that disagreed about whose money they
 * governed, and only live certification caught it.
 */
const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20260903190000_payment_application_childcare_spine.sql",
);

describe("payment application migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("gives payments the generic billable-source dimension P3.1 gave every other money table", () => {
        // Without it there is no way to say "this is childcare money", so every childcare guarantee
        // would have to be written against ALL payments and would regress job billing.
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS billable_source_type text");
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS billable_source_id uuid");
        expect(sql).toContain("payments_billable_source_type_chk");
        // Existing job rows are carried onto the dimension, exactly as P3.1 carried charges.
        expect(sql).toContain("SET billable_source_type = 'job', billable_source_id = job_id");
    });

    it("does NOT touch job_id — the census proved it has been nullable since 20260329210000", () => {
        // Thread 1's readout said `payments.job_id is NOT NULL`. It is not, on the deployed primary.
        // A migration "fixing" it would have been a no-op dressed as the fix for the whole thread.
        expect(sql).not.toContain("ALTER COLUMN job_id");
    });

    it("makes a retried record and a replayed provider event harmless, with indexes not checks", () => {
        expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_org_idempotency_key");
        expect(sql).toContain("ON public.payments (org_id, idempotency_key)");
        expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_org_processor_transaction");
        expect(sql).toContain("ON public.payments (org_id, processor, processor_transaction_id)");
    });

    it("bounds an application to ONE ACTIVE row per (payment, charge)", () => {
        // This is "the balance moves exactly once". A retried apply must not write a second active
        // row; a service lookup lets both concurrent applies through and this does not.
        expect(sql).toContain(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_allocations_one_active_per_payment_charge",
        );
        expect(sql).toContain("ON public.payment_allocations (payment_id, charge_id)");
        // Reversed rows are outside the predicate, so a corrected re-application is still possible.
        expect(sql).toContain("WHERE charge_id IS NOT NULL AND status = 'active'");
    });

    it("refuses to over-spend either side, and locks before it sums", () => {
        expect(sql).toContain("public.enforce_payment_allocation_bounds()");
        expect(sql).toContain("would over-apply payment");
        expect(sql).toContain("would over-pay charge");
        // Without the locks two concurrent applications each read the old total and both pass.
        expect(sql).toContain("FROM public.payments p\n     WHERE p.id = NEW.payment_id\n     FOR UPDATE");
        expect(sql).toContain("FROM public.charges c\n     WHERE c.id = NEW.charge_id\n     FOR UPDATE");
    });

    it("counts only ACTIVE applications on POSTED payments — the same predicate the balance uses", () => {
        // A guard that disagreed with the balance read about which rows are money would refuse
        // applications the balance thinks are fine, or admit ones it does not.
        expect(sql).toContain("AND a.status = 'active'\n       AND p.status = 'posted'");
    });

    it("refuses to apply money to an obligation that is not owed", () => {
        expect(sql).toContain("cannot receive a payment; post it first");
        expect(sql).toContain("carries a non-positive amount and cannot receive a payment");
    });

    it("makes a refund a NEW row with lineage, never an edit of the receipt", () => {
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS refunds_payment_id uuid");
        expect(sql).toContain("payments_refunds_payment_id_fkey");
        // A refund is outbound; an inbound receipt refunds nothing.
        expect(sql).toContain("refunds_payment_id IS NULL OR direction = 'outbound'");
    });

    it("bounds refunds by arithmetic rather than by count, and refuses to refund a refund", () => {
        // Partial refunds are legitimate and repeatable — this is where the rule differs from charge
        // reversal, which is bounded at exactly one.
        expect(sql).toContain("public.enforce_payment_refund_bounds()");
        expect(sql).toContain("would exceed the % cents received");
        expect(sql).toContain("is itself a refund and cannot be refunded");
        expect(sql).toContain("WHERE p.id = NEW.refunds_payment_id\n     FOR UPDATE");
    });

    it("makes posted childcare money append-only, and scopes that to childcare only", () => {
        expect(sql).toContain("public.enforce_childcare_payment_immutability()");
        expect(sql).toContain(
            "childcare_sources text[] := ARRAY['enrollment_agreement'::text, 'customer'::text]",
        );
        expect(sql).toContain("DELETE not allowed; record a refund via refunds_payment_id");
        // Money that arrived does not become money that never arrived.
        expect(sql).toContain("cannot revert to %");
        // An application is reversed, never deleted — deleting one erases that money was applied.
        expect(sql).toContain("public.enforce_payment_allocation_no_delete()");
    });

    it("leaves job billing alone — its PATCH route edits live rows and must keep working", () => {
        // The immutability trigger is the place a careless rule would break the job vertical: the
        // job payments PATCH route updates status_key / paid_at / notes on live payments.
        const fn = sql.slice(
            sql.indexOf("CREATE OR REPLACE FUNCTION public.enforce_childcare_payment_immutability"),
            sql.indexOf("DROP TRIGGER IF EXISTS trg_enforce_childcare_payment_immutability"),
        );
        expect(fn).toContain("OLD.billable_source_type = ANY (childcare_sources)");
        expect(fn).not.toContain("OLD.billable_source_type IS NULL");
    });

    it("extends the childcare write role gate to the tables that RECEIVE the money", () => {
        // `20260902130000` gated charges / ledger_transactions / gl_journal_lines and stopped there,
        // so the money arriving was less protected than the money owed.
        expect(sql).toContain("payments_childcare_write_rolegate");
        expect(sql).toContain("payment_allocations_childcare_write_rolegate");
        expect(sql).toContain("AS RESTRICTIVE FOR ALL TO authenticated");
        expect(sql).toContain(
            "public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text])",
        );
    });

    it("resolves an application's childcare-ness through its PAYMENT, not a duplicated column", () => {
        // `payment_allocations` has no billable_source_type, and giving it one would be a second
        // answer to a question the payment already answers.
        const gate = sql.slice(sql.indexOf("CREATE POLICY payment_allocations_childcare_write_rolegate"));
        expect(gate).toContain("FROM public.payments p");
        expect(gate).toContain("WHERE p.id = payment_allocations.payment_id");
    });

    it("creates no second payments table, no second ledger and no second balance rule", () => {
        expect(sql).not.toMatch(/CREATE TABLE[^;]*childcare_payments/i);
        expect(sql).not.toMatch(/CREATE TABLE[^;]*payment_ledger/i);
        expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS "?public"?\.\s*"?payments"?/i);
        expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS "?public"?\.\s*"?payment_allocations"?/i);
    });
});
