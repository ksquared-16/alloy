/**
 * ACCOUNTING PERIODS — the write half, and the doctrine it must not contradict.
 *
 * ── THE DOCTRINE, READ FROM THE MIGRATION ─────────────────────────────────────────────────────
 *
 * `attribute_financial_journal_entry` is a BEFORE INSERT trigger and it is the only thing that
 * decides a journal entry's period. Its rules, in its own words:
 *
 *   no active calendar     → `period_attribution = 'no_calendar'`, no period, complete history
 *   no covering period     → refuse `accounting_period_unavailable`
 *   covering period CLOSED → DEFER to the earliest later OPEN period, stamping
 *                            `accounting_period_deferred` and the date it came from
 *   closed, none later     → refuse `accounting_period_closed`
 *
 * "A CLOSED PERIOD DEFERS; IT DOES NOT REFUSE. Refusing would make a REPORTING boundary able to
 * block an OPERATIONAL act: a family could not be charged, or a cheque could not be recorded,
 * because the books were closed."
 *
 * These lock that, because it is the rule most likely to be "fixed" by someone who assumes closed
 * means refused — and doing so would let a closed month stop a nursery billing its families.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calendarMonthPeriods, findPeriodForDate } from "@/lib/financials/accountingPeriod";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const MIGRATION = "../supabase/migrations/20260904180000_financial_periods_and_journal.sql";
const sql = () => readFileSync(join(ROOT, "..", "supabase/migrations/20260904180000_financial_periods_and_journal.sql"), "utf8");

describe("period identity and boundaries are canonical", () => {
    const periods = calendarMonthPeriods({ startYear: 2026, startMonth: 1 });

    it("twelve contiguous months with inclusive boundaries", () => {
        expect(periods.length).toBe(12);
        expect(periods[8]!.label).toBe("September 2026");
        expect(periods[8]!.starts_on).toBe("2026-09-01");
        expect(periods[8]!.ends_on).toBe("2026-09-30");
        for (let i = 1; i < periods.length; i++) {
            const prevEnd = Date.parse(`${periods[i - 1]!.ends_on}T00:00:00Z`);
            const thisStart = Date.parse(`${periods[i]!.starts_on}T00:00:00Z`);
            expect(thisStart - prevEnd, `${periods[i]!.period_key} abuts its predecessor`).toBe(86_400_000);
        }
    });

    it("a date resolves to exactly one period", () => {
        expect(findPeriodForDate(periods, "2026-09-30")?.label).toBe("September 2026");
        expect(findPeriodForDate(periods, "2026-10-01")?.label).toBe("October 2026");
        expect(findPeriodForDate(periods, "2027-01-01")).toBeNull();
    });

    it("the database forbids overlap and duplicate keys within a calendar", () => {
        const s = sql();
        expect(s).toContain("financial_accounting_periods_no_overlap");
        expect(s).toContain("EXCLUDE USING gist");
        expect(s).toContain("financial_accounting_periods_calendar_key_uq");
    });

    it("one active calendar per organisation", () => {
        expect(sql()).toContain("uq_financial_accounting_calendars_one_active_per_org");
    });
});

describe("a closed period defers; it does not refuse", () => {
    it("the trigger defers to the earliest later OPEN period", () => {
        const s = sql();
        const fn = s.slice(s.indexOf("attribute_financial_journal_entry()"));
        const body = fn.slice(0, fn.indexOf("CREATE TRIGGER"));
        expect(body).toContain("IF per.status = 'closed' THEN");
        expect(body, "it looks for a later open period").toMatch(/status = 'open'[\s\S]{0,120}starts_on > NEW\.effective_on/);
        expect(body, "and records that it moved").toContain("accounting_period_deferred");
        expect(body).toContain("accounting_period_deferred_from_date");
    });

    it("it refuses only when there is nowhere to defer to", () => {
        const s = sql();
        expect(s).toContain("accounting_period_closed: the period covering % is closed and no later open period exists");
    });

    it("no calendar is a complete history without a period, not a refusal", () => {
        const s = sql();
        expect(s).toContain("NEW.period_attribution := 'no_calendar'");
        expect(s).toContain("period_attribution = ANY (ARRAY['attributed'::text, 'no_calendar'::text])");
    });

    it("attribution is decided by the effective date, never by a billing period", () => {
        const s = sql();
        const fn = s.slice(s.indexOf("attribute_financial_journal_entry()"));
        const body = fn.slice(0, fn.indexOf("CREATE TRIGGER"));
        expect(body).toContain("NEW.effective_on BETWEEN p.starts_on AND p.ends_on");
        expect(body, "the commercial period has no say here").not.toMatch(/billing_period|billable_on|service_period/);
    });
});

describe("closing changes status and nothing else", () => {
    const svc = src("lib/financials/accounting/accountingCalendarService.ts");

    it("writes status, closed_at and closed_by — not boundaries", () => {
        const fn = svc.slice(svc.indexOf("export async function closeAccountingPeriod"));
        /* Scoped to the UPDATE payload: a type annotation naming a column is not a write to it. */
        const update = fn.slice(fn.indexOf(".update({"), fn.indexOf("})", fn.indexOf(".update({")));
        expect(update).toContain('status: "closed"');
        expect(update).toContain("closed_at");
        expect(update).toContain("closed_by");
        expect(update, "boundaries are the database's to freeze").not.toMatch(/starts_on|ends_on|period_key/);
    });

    it("re-attributes nothing already posted", () => {
        expect(svc, "no journal write anywhere in the service").not.toMatch(
            /from\("financial_journal_entries"\)[\s\S]{0,120}\.(update|insert|delete)/,
        );
    });

    it("closing an already-closed period is answered, not reported as success", () => {
        const fn = svc.slice(svc.indexOf("export async function closeAccountingPeriod"));
        expect(fn, "the update is guarded on it being open").toContain('.eq("status", "open")');
        expect(fn).toContain("accounting_period_not_open");
    });

    it("the database freezes boundaries once entries are attributed", () => {
        const s = sql();
        expect(s).toContain("enforce_accounting_period_boundaries_frozen");
        expect(s).toContain("boundaries are frozen; open a new period instead");
    });
});

describe("the preview states the consequence, and invents no close blockers", () => {
    const svc = src("lib/financials/accounting/accountingCalendarService.ts");

    it("reports what stays and where later entries go", () => {
        const fn = svc.slice(svc.indexOf("export async function previewClosePeriod"));
        expect(fn).toContain("attributedEntries");
        expect(fn).toContain("defersTo");
    });

    it("warns when closing would turn deferral into refusal", () => {
        expect(svc).toContain("no_later_open_period");
        expect(svc).toMatch(/refused rather than deferred/);
    });

    it("does not make reconciliation, review or drafts a blocker", () => {
        /*
         * No platform doctrine makes any of these a close blocker, and inventing one here would be
         * a finance rule nobody asked for in the one place nobody would look. Drafts are not
         * journal entries and carry no attribution at all.
         */
        const fn = svc.slice(svc.indexOf("export async function previewClosePeriod"));
        expect(fn).not.toMatch(/reconcil|posting_review|draft/i);
    });
});

describe("the write authority is governed, and asks the existing grant", () => {
    const actions = src("app/api/admin/financials/accounting-calendar/route.ts");

    it("adopt and close are governed by the write route", () => {
        /*
         * These were registered actions and could not be invoked: the action runtime resolves
         * every invocation against a real record, and these acts are ORG-scoped. Mounted, it
         * answered "Unsupported entity_type". A registered action nothing can invoke reads as
         * governed capability and is not one, so it was removed rather than left in place.
         */
        expect(actions).toContain('op === "adopt"');
        expect(actions).toContain('op === "close"');
        expect(actions).toContain('op === "preview_close"');
    });

    it("uses the existing financial write grant, not a new role check", () => {
        expect(actions).toContain("assertFinancialsWriteAllowed");
        expect(actions, "no ad-hoc admission check").not.toMatch(/requireAdminOrOps|isAdmin\b/);
    });

    it("re-checks before closing, so a client cannot skip the preview", () => {
        const close = actions.slice(actions.indexOf('if (op === "close")'));
        expect(close.slice(0, 800)).toContain("previewClosePeriod");
        expect(close.slice(0, 800)).toContain("already_closed");
    });

    it("periods are materialised from the one generator, not authored twice", () => {
        const svc = src("lib/financials/accounting/accountingCalendarService.ts");
        expect(svc).toContain("calendarMonthPeriods");
        expect(svc, "no second period arithmetic").not.toMatch(/new Date\(Date\.UTC\([^)]*, 0\)\)/);
    });
});

describe("accounting is not billing", () => {
    it("the billing authority knows nothing of accounting periods", () => {
        const bp = src("lib/financials/billingPeriod.ts");
        expect(bp).not.toMatch(/financial_accounting_periods|accounting_period_id/);
    });

    it("the accounting authority knows nothing of billing cadence", () => {
        const ap = src("lib/financials/accountingPeriod.ts");
        expect(ap).not.toMatch(/cadenceKey|billingPeriodFor|BillingCadence/);
    });

    it("closing touches neither responsibility nor reductions", () => {
        const svc = src("lib/financials/accounting/accountingCalendarService.ts");
        expect(svc).not.toMatch(/responsibility|arrangement|reduction|discount/i);
    });
});

describe("the operator surface offers the lifecycle the authority supports, and no more", () => {
    const panel = src("components/adminV2/settings/financials/accounting/AccountingPostingPanels.tsx");
    const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

    it("offers adoption where the absence is reported", () => {
        const absent = panel.slice(panel.indexOf('data-testid="accounting-calendar-absent"'));
        expect(absent.slice(0, 1800)).toContain('data-testid="accounting-calendar-adopt"');
        expect(absent.slice(0, 1800)).toContain('op: "adopt"');
    });

    it("closes through preview then confirm", () => {
        expect(panel).toContain('data-testid="accounting-close-preview"');
        expect(panel).toContain('data-testid="accounting-close-confirm"');
        /* The row's testid is a template literal, so an indexOf on a quoted attribute finds nothing. */
        const at = panel.indexOf("accounting-period-close-");
        expect(at, "the row close control exists").toBeGreaterThan(-1);
        expect(panel.slice(at, at + 1200), "the row previews first").toContain('op: "preview_close"');
    });

    it("renders the action's own words, not a second opinion about accounting health", () => {
        expect(panel).toContain("closing.summary");
        expect(panel).toContain("closing.changes.map");
    });

    it("re-reads persisted truth rather than editing the row", () => {
        expect(panel).toContain("setNonce((n) => n + 1)");
        expect(panel, "the effect re-runs on the nonce").toContain("}, [nonce]);");
        expect(strip(panel), "no local status rewrite").not.toMatch(/setPeriods\([\s\S]{0,80}status: "closed"/);
    });

    it("offers no reopen, because no reopen authority exists", () => {
        expect(strip(panel)).not.toMatch(/reopen/i);
        expect(strip(src("app/api/admin/financials/accounting-calendar/route.ts"))).not.toMatch(/reopen/i);
        expect(strip(src("lib/financials/accounting/accountingCalendarService.ts"))).not.toMatch(/reopen/i);
    });

    it("writes no table from the browser", () => {
        expect(panel, "the browser writes no table").not.toMatch(
            /from\("financial_accounting_(periods|calendars)"\)/,
        );
        expect(panel).toContain("/api/admin/financials/accounting-calendar");
    });
});

describe("a deferral is visible, not swallowed", () => {
    const detail = src("lib/financials/workspace/resolveChargeDetail.ts");
    const ui = src("app/adminV2/financials/FinancialsChargeDetail.tsx");

    it("the resolver reads the trigger's own stamp", () => {
        expect(detail).toContain("accounting_period_deferred === true");
        expect(detail).toContain("accounting_period_deferred_from_date");
    });

    it("the original effective date survives as the deferred-from date", () => {
        /* The entry keeps `effective_on`; the stamp names the date whose period was closed. */
        const block = detail.slice(detail.indexOf("meta.accounting_period_deferred === true"));
        expect(block.slice(0, 300)).toContain("journal?.effective_on");
    });

    it("an ordinary posting carries no deferral", () => {
        expect(detail).toContain("let accountingDeferredFrom: string | null = null;");
    });

    it("the surface distinguishes the two", () => {
        expect(ui).toContain('testId="accounting-deferred-from"');
        expect(ui).toContain("that period was closed");
        expect(ui, "and only when there was one").toContain("detail.accountingDeferredFrom ?");
    });

    it("the charge detail and the journal name one period", () => {
        /* The detail does not compute a period; it reads the one the entry was attributed to. */
        expect(detail).toContain('.from("financial_journal_entries")');
        expect(detail).toContain("accounting_period_id");
        expect(detail, "no local attribution").not.toMatch(/findPeriodForDate|calendarMonthPeriods/);
    });
});

describe("the two periods are derived independently", () => {
    /*
     * A PLANTED DEFECT THAT ESCAPED. Replacing the charge detail's billing period with the
     * accounting period passed every lock above: they all asserted that accounting attribution
     * was read correctly, and none asserted that the COMMERCIAL period was still derived by the
     * commercial authority. A charge effective in closed September would then have reported its
     * billing period as October — the exact conflation this whole thread exists to prevent.
     */
    const detail = src("lib/financials/workspace/resolveChargeDetail.ts");

    it("the billing period comes from the billing authority", () => {
        expect(detail).toContain("placeInBillingPeriod(charge");
        expect(detail).toContain('from "@/lib/financials/billingPeriod"');
    });

    it("and never from the accounting period", () => {
        const at = detail.indexOf("const billing = ");
        expect(at, "the billing period is derived").toBeGreaterThan(-1);
        const line = detail.slice(at, detail.indexOf("\n", at));
        expect(line, "not borrowed from accounting").not.toMatch(/accountingPeriod|accounting_period/);
    });

    it("the accounting period is never derived from the charge's own dates", () => {
        /* It is READ from the entry the database attributed, never recomputed here. */
        const at = detail.indexOf("let accountingPeriod");
        const block = detail.slice(at, detail.indexOf("templateLabel", at) > at ? detail.indexOf("glAccount", at) : detail.length);
        expect(block).not.toMatch(/placeInBillingPeriod|billingPeriodFor/);
    });
});

describe("the charge finds its own journal entry", () => {
    const detail = src("lib/financials/workspace/resolveChargeDetail.ts");

    it("queries the columns the journal actually has", () => {
        /*
         * THE DEFECT. This filtered `.eq("charge_id", chargeId)` and
         * `financial_journal_entries` HAS NO `charge_id` COLUMN — the charge is identified by
         * `source_type = 'charge'` and `source_id`. PostgREST answers an unknown column with an
         * error, a bare `catch {}` swallowed it, and every charge in the system reported "Not
         * posted to a period yet". Measured: charge 18e860f9, status `posted`,
         * accountingPeriod null.
         */
        const block = detail.slice(detail.indexOf('.from("financial_journal_entries")'));
        const query = block.slice(0, block.indexOf("maybeSingle()"));
        expect(query).toContain('.eq("source_type", "charge")');
        expect(query).toContain('.eq("source_id", chargeId)');
        expect(query, "no column that does not exist").not.toContain('.eq("charge_id"');
    });

    it("the writer stamps that identity", () => {
        const journal = src("lib/financials/financialJournalService.ts");
        const fn = journal.slice(journal.indexOf("export function chargePostedEntry"));
        expect(fn.slice(0, 900)).toContain('sourceType: "charge"');
        expect(fn.slice(0, 900)).toContain("sourceId: params.chargeId");
    });

    it("a failed read is not reported as 'not posted'", () => {
        expect(detail).toContain("accountingReadError");
        expect(detail, "the error reaches the caller").toMatch(/accounting attribution could not be read/);
        const block = detail.slice(detail.indexOf("let accountingPeriod"));
        expect(block.slice(0, block.indexOf("let glAccount")), "no bare catch").not.toMatch(/\} catch \{\s*\n\s*accountingPeriod = null;/);
    });
});
