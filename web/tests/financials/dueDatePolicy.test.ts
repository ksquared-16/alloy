/**
 * WHEN IS PAYMENT EXPECTED — configured, not assumed.
 *
 * `billable_on_strategy` has always configured when a charge is ISSUED. `due_date` had no rule
 * anywhere: it was whatever the creating caller happened to put there, so an organisation could not
 * state its own terms and two creation paths could carry two unstated conventions.
 *
 * The thing these lock hardest is the ABSENCE case. An organisation that has configured nothing
 * must keep exactly today's behaviour — `null`, meaning "leave the due date alone" — because
 * inventing one would put a collections consequence on a decision nobody made.
 */
import { describe, expect, it } from "vitest";

import { resolveDueDate } from "@/lib/financials/policies/resolveDueDate";
import {
    DUE_DATE_STRATEGIES,
    FINANCIAL_POLICY_TYPES,
    POLICY_TYPE_REGISTRY,
} from "@/lib/financials/policies/financialPolicyTypes";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";

const policy = (value: Record<string, unknown>, over: Partial<FinancialPolicyRow> = {}): FinancialPolicyRow =>
    ({
        id: "p1",
        org_id: "org",
        policy_type: "due_date",
        scope_type: "org",
        location_id: null,
        service_id: null,
        rate_plan_id: null,
        label: "Due date",
        value,
        effective_start: "2026-01-01",
        effective_end: null,
        is_active: true,
        ...over,
    }) as unknown as FinancialPolicyRow;

const INPUTS = { invoiceDate: "2026-09-25", periodStart: "2026-10-01" };

describe("the strategies, and only the ones a date already supports", () => {
    it("is due on the invoice date", () => {
        const r = resolveDueDate([policy({ strategy: "on_invoice" })], INPUTS);
        expect(r.dueDate).toBe("2026-09-25");
        expect(r.reason).toBe("resolved");
    });

    it("is due N days after the invoice date", () => {
        expect(resolveDueDate([policy({ strategy: "days_after_invoice", offset_days: 10 })], INPUTS).dueDate)
            .toBe("2026-10-05");
    });

    it("is due on the first day of the billing period", () => {
        expect(resolveDueDate([policy({ strategy: "on_period_start" })], INPUTS).dueDate).toBe("2026-10-01");
    });

    it("is due N days after the period starts", () => {
        expect(resolveDueDate([policy({ strategy: "days_after_period_start", offset_days: 14 })], INPUTS).dueDate)
            .toBe("2026-10-15");
    });

    /*
     * "Due on the first day of the period" is offset ZERO, not a fifth strategy. This is why a
     * month-shaped "fixed day of the month" option was left out: it has no meaning for a weekly
     * organisation, while this expresses the same intent for every cadence.
     */
    it("expresses 'the first day of the period' as a zero offset, for any cadence", () => {
        const r = resolveDueDate([policy({ strategy: "days_after_period_start", offset_days: 0 })], {
            invoiceDate: "2026-09-18",
            periodStart: "2026-09-21", // a WEEKLY period — there is no 15th to be due on
        });
        expect(r.dueDate).toBe("2026-09-21");
    });
});

describe("THE GATE — an unconfigured organisation is unchanged", () => {
    /*
     * The single most important assertion in this file. Null means "leave the due date as it was".
     * Not today, not the invoice date. A default here would silently re-date every charge in every
     * tenant that never asked for one.
     */
    it("resolves nothing when no policy is configured", () => {
        const r = resolveDueDate([], INPUTS);
        expect(r.dueDate).toBeNull();
        expect(r.reason).toBe("no_policy");
    });

    it("resolves nothing when the policy is not yet effective", () => {
        const notYet = policy({ strategy: "on_invoice" }, { effective_start: "2027-01-01" });
        expect(resolveDueDate([notYet], INPUTS).dueDate).toBeNull();
    });

    it("resolves nothing when the inputs it needs are absent", () => {
        expect(resolveDueDate([policy({ strategy: "on_period_start" })], {
            invoiceDate: "2026-09-25",
            periodStart: null,
        })).toMatchObject({ dueDate: null, reason: "missing_input" });
    });

    /*
     * A strategy this build does not know is REPORTED. The database can permit a value the
     * application has not caught up with — the same drift `vacation_credit` documents having had —
     * and guessing would date a family's obligation off a string nobody here understands.
     */
    it("reports an unknown strategy instead of guessing a date", () => {
        const r = resolveDueDate([policy({ strategy: "whenever_feels_right" })], INPUTS);
        expect(r.dueDate).toBeNull();
        expect(r.reason).toBe("unknown_strategy");
        expect(r.strategy).toBe("whenever_feels_right");
    });

    /* A malformed offset must not propagate NaN into a date. */
    it("treats an unreadable offset as zero rather than producing an invalid date", () => {
        const r = resolveDueDate([policy({ strategy: "days_after_invoice", offset_days: "ten" })], INPUTS);
        expect(r.dueDate).toBe("2026-09-25");
    });
});

describe("the dates stay separate identities", () => {
    /*
     * Billing Period Oct 1–31, invoiced Sep 25, due Oct 1 is an ORDINARY arrangement. A model that
     * collapsed any two of these could not express it — and this is the arrangement the instruction
     * names explicitly.
     */
    it("supports an invoice date before the period it bills, with its own due date", () => {
        const r = resolveDueDate([policy({ strategy: "on_period_start" })], {
            invoiceDate: "2026-09-25",
            periodStart: "2026-10-01",
        });
        expect(r.dueDate).toBe("2026-10-01");
        expect(r.dueDate).not.toBe("2026-09-25");
    });

    it("lets the due date precede nothing it should not — invoice and due may coincide", () => {
        const r = resolveDueDate([policy({ strategy: "on_invoice" })], INPUTS);
        expect(r.dueDate).toBe(INPUTS.invoiceDate);
    });
});

describe("it is configuration, on the surface operators already use", () => {
    it("is a registered policy type with a rendered form", () => {
        expect(FINANCIAL_POLICY_TYPES).toContain("due_date");
        const def = POLICY_TYPE_REGISTRY.due_date;
        expect(def.label).toBe("Due date");
        // The policies chapter renders `fields` generically, so a definition IS the operator form.
        expect(def.fields.map((f) => f.key)).toEqual(["strategy", "offset_days"]);
    });

    /* Every offered strategy must be one the resolver can actually carry out. */
    it("offers no strategy the resolver cannot resolve", () => {
        for (const opt of DUE_DATE_STRATEGIES) {
            const r = resolveDueDate([policy({ strategy: opt.value, offset_days: 3 })], INPUTS);
            expect(r.reason, `${opt.value} resolves`).toBe("resolved");
            expect(r.dueDate, `${opt.value} produces a date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
    });

    /* The database must permit what the registry declares, or an operator can store an unsavable policy. */
    it("is permitted by the migration that owns the policy-type constraint", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const sql = readFileSync(
            join(process.cwd(), "..", "supabase/migrations/20260918120000_financial_due_date_policy.sql"),
            "utf8",
        );
        expect(sql).toContain("'due_date'::text");
        // The other twelve must survive the constraint replacement.
        for (const t of ["proration", "billing_cadence", "posting_review", "deposit", "vacation_credit"]) {
            expect(sql, `${t} still permitted`).toContain(`'${t}'::text`);
        }
    });
});
