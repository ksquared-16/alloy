import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE RULES THAT MUST BE THE DATABASE'S, NOT THE SERVICE'S.
 *
 * Thread 5's census found no accounting period anywhere in the schema and no posted financial
 * history for childcare money at all — while `post_payment_to_ledger`, the one function whose name
 * promised a journal, was proved live to do nothing but stamp a timestamp.
 *
 * These cases pin the parts of the answer that a service cannot own. Period non-overlap and journal
 * append-only-ness both fail the same way if they live in application code: two concurrent writers
 * each read a clean state and each write.
 */
const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20260904180000_financial_periods_and_journal.sql",
);

describe("financial periods and journal migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("refuses overlapping periods with an exclusion constraint, not a check", () => {
        // A read-then-write cannot state this: two concurrent period authors each see no overlap.
        expect(sql).toContain("CONSTRAINT financial_accounting_periods_no_overlap");
        expect(sql).toContain("EXCLUDE USING gist (calendar_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)");
        // Inclusive boundaries, matching what the table documents and the resolver assumes.
        expect(sql).toContain("'[]'");
    });

    it("scopes non-overlap to the CALENDAR, so monthly billing can coexist with 4/4/5 reporting", () => {
        // Scoping to org_id would forbid a second calendar covering the same days, which is exactly
        // the arrangement a 4/4/5 reporting calendar plus monthly billing needs.
        const constraint = sql.slice(sql.indexOf("financial_accounting_periods_no_overlap"));
        expect(constraint.slice(0, 200)).toContain("calendar_id WITH =");
        expect(constraint.slice(0, 200)).not.toContain("org_id WITH =");
    });

    it("makes accounting-period attribution deterministic by allowing one active calendar per org", () => {
        expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_accounting_calendars_one_active_per_org");
        expect(sql).toContain("ON public.financial_accounting_calendars (org_id)");
        expect(sql).toContain("WHERE is_active");
    });

    it("attributes the period in a BEFORE INSERT trigger, so any writer is attributed the same way", () => {
        expect(sql).toContain("CREATE OR REPLACE FUNCTION public.attribute_financial_journal_entry()");
        expect(sql).toContain("BEFORE INSERT ON public.financial_journal_entries");
    });

    it("defers a closed period rather than refusing the money", () => {
        // A REPORTING boundary must not be able to block an OPERATIONAL act. The deferral is
        // recorded on the row so nobody has to infer why an entry effective in one period reports
        // in the next.
        expect(sql).toContain("AND p.status = 'open'");
        expect(sql).toContain("AND p.starts_on > NEW.effective_on");
        expect(sql).toContain("'accounting_period_deferred', true");
        // With nothing to defer to, it refuses rather than guessing.
        expect(sql).toContain("accounting_period_closed: the period covering % is closed and no later open period exists");
        expect(sql).toContain("accounting_period_unavailable: no period on the active calendar covers %");
    });

    it("keeps posted history append-only", () => {
        expect(sql).toContain("CREATE OR REPLACE FUNCTION public.enforce_financial_journal_append_only()");
        expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.financial_journal_entries");
        expect(sql).toContain("cannot be deleted; posted history is append-only");
        expect(sql).toContain("cannot be updated; record a corrective entry instead");
    });

    it("freezes the boundaries of a period that has already reported", () => {
        // Re-dating a period rewrites what a closed period said. Historical rows are never silently
        // reassigned; the frozen `accounting_period_key` on each entry is the other half of this.
        expect(sql).toContain("CREATE OR REPLACE FUNCTION public.enforce_accounting_period_boundaries_frozen()");
        expect(sql).toContain("its boundaries are frozen; open a new period instead");
    });

    it("separates the event's amount from what it does to the obligation", () => {
        // One signed `amount` column invites a consumer to sum it and get a second, wrong balance.
        expect(sql).toContain("obligation_delta_cents bigint NOT NULL");
        expect(sql).toContain("CONSTRAINT financial_journal_entries_amount_chk CHECK (amount_cents > 0)");
        expect(sql).toContain("payment_received 0 (received is not applied)");
    });

    it("makes attribution all-or-nothing", () => {
        expect(sql).toContain("CONSTRAINT financial_journal_entries_attribution_shape_chk");
        expect(sql).toContain("period_attribution = 'no_calendar'");
    });

    it("makes a retried consequence harmless with a unique idempotency key", () => {
        expect(sql).toContain("CONSTRAINT financial_journal_entries_org_idempotency_uq UNIQUE (org_id, idempotency_key)");
    });

    it("stops post_payment_to_ledger advertising a consequence it does not have", () => {
        // Proved live before it was renamed: posting a childcare payment moved ledger_transactions,
        // gl_journal_entries and gl_journal_lines from 0 rows to 0 rows while stamping the column.
        expect(sql).toContain("CREATE OR REPLACE FUNCTION public.stamp_payment_posted_to_ledger_at(payment_id uuid)");
        expect(sql).toContain("DROP FUNCTION IF EXISTS public.post_payment_to_ledger(uuid)");
        expect(sql).toContain("A STATUS STAMP, not a journal posting");
        // The job/Stripe trigger chain keeps firing on the same events, with the same effect.
        expect(sql).toContain("perform public.stamp_payment_posted_to_ledger_at(new.id);");
    });

    it("says on the table itself that the journal is not a balance authority", () => {
        expect(sql).toContain("NOT a balance authority");
        expect(sql).toContain("Sum obligation_delta_cents for a period movement; never for a balance.");
    });
});
