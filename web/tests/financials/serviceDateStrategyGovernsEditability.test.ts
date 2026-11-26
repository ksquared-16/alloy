/**
 * SERVICE DATE — THE STRATEGY DECIDES WHO AUTHORS IT, AND THE CONTROL FOLLOWS.
 *
 * Mounted on deployed staging, two templates behaved differently: Field trip offered an editable,
 * required Service Date; the period-billed waived enrolment fee showed a static value. That looked
 * like an inconsistency of control shape. Traced instead of redesigned, it is the canonical rule:
 * `occurs_on_strategy` has exactly three values and exactly ONE of them takes the date from the
 * operator. So this is an INTENTIONAL DOMAIN RULE, not accidental UI disabling, and the control is
 * bound to it here rather than made uniform.
 *
 * The resolver is exercised for real; only the control's gate is read from source, because no
 * render harness exists in this suite.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveChargeFromTemplate } from "@/lib/financials/chargeLifecycle/resolveChargeFromTemplate";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";

const template = (occurs: string): ChargeTemplateRow =>
    ({
        id: "t1", org_id: "o1", service_id: null, template_key: "k", label: "L", description: null,
        charge_category: "fee", trigger_type: "manual", trigger_key: null,
        amount_strategy: "fixed", amount_cents: 4_000, currency_code: "USD",
        occurs_on_strategy: occurs, billable_on_strategy: "immediate", billable_offset_days: null,
        default_gl_mapping_key: null, default_responsibility_key: null,
        review_required: false, is_active: true, source_key: "s", metadata: {},
        created_by: null, updated_by: null, created_at: "2026-01-01", updated_at: "2026-01-01",
        effective_start: "2026-01-01", effective_end: null,
    }) as unknown as ChargeTemplateRow;

const ctx = (over: Record<string, unknown> = {}) =>
    ({ today: "2026-10-20", scopeKey: "sc", ...over }) as never;

describe("exactly one strategy takes the date from the operator", () => {
    it("event_date uses the operator's date, verbatim", () => {
        const intent = resolveChargeFromTemplate(template("event_date"), ctx({ eventDate: "2026-10-03" }));
        expect(intent.occursOn, "the operator authored this one").toBe("2026-10-03");
        expect(intent.eligible).toBe(true);
    });

    it("event_date REFUSES rather than inventing a date when the operator gave none", () => {
        const intent = resolveChargeFromTemplate(template("event_date"), ctx({ eventDate: null }));
        expect(intent.eligible).toBe(false);
        expect(intent.reason).toBe("missing_event_date");
    });

    it("now is the system's date — the operator does not author it", () => {
        const intent = resolveChargeFromTemplate(template("now"), ctx({ eventDate: "2026-01-01" }));
        expect(intent.occursOn, "the operator's date is IGNORED here, deliberately").toBe("2026-10-20");
    });

    it("service_period_start comes from the placement, not from the operator", () => {
        const intent = resolveChargeFromTemplate(
            template("service_period_start"),
            ctx({ servicePeriodStart: "2026-10-01", eventDate: "2026-01-01" }),
        );
        expect(intent.occursOn).toBe("2026-10-01");
    });

    it("and refuses when the placement cannot supply it", () => {
        const intent = resolveChargeFromTemplate(template("service_period_start"), ctx({ servicePeriodStart: null }));
        expect(intent.eligible).toBe(false);
        expect(intent.reason).toBe("missing_service_period");
    });
});

/*
 * ── W7-F011 SUPERSEDES THE CONTROL GATE, NOT THE STRATEGIES ─────────────────────────────────────
 *
 * The Director ruled that in Add Charge the service date is THE operator-controlled date for every
 * charge type, with billing period, invoice date and due date derived from it. The strategies above
 * are unchanged — generation, consumption and enrollment fees still date `now` charges today and
 * period charges from the placement, and `eventDate` is still ignored outside `event_date`.
 * What changed is one explicit, narrow input: `operatorServiceDate`, which only the manual
 * Add Charge path sets.
 */
describe("W7-F011 — Add Charge's operator service date governs every strategy", () => {
    for (const occurs of ["now", "event_date", "service_period_start"]) {
        it(`${occurs}: the operator's service date is the occurrence date`, () => {
            const intent = resolveChargeFromTemplate(
                template(occurs),
                ctx({ operatorServiceDate: "2026-11-04", servicePeriodStart: "2026-10-01", eventDate: null }),
            );
            expect(intent.eligible).toBe(true);
            expect(intent.occursOn).toBe("2026-11-04");
        });
    }

    it("a malformed operator date is refused, never coerced", () => {
        const intent = resolveChargeFromTemplate(template("now"), ctx({ operatorServiceDate: "11/04/2026" }));
        expect(intent.eligible).toBe(false);
        expect(intent.reason).toBe("invalid_service_date");
    });
});

describe("the control: Service date editable, the other three dates read-only, one row", () => {
    const src = readFileSync(path.join(process.cwd(), "components/operationalCards/AddChargeCommand.tsx"), "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const row = src.slice(src.indexOf('data-addcharge-dates="row"'), src.indexOf("data-addcharge-posting-rule"));

    it("offers the date control whenever the command is live, whatever the template's strategy", () => {
        expect(row).toMatch(/<DateCell label="Service date" required>\s*\{controls \? \(/);
        expect(src).not.toMatch(/t\.occursOn === "event_date" \?/);
    });

    it("places the four dates in one row, in order", () => {
        const order = ["Service date", "Billing period", "Invoice date", "Due date"].map((l) => row.indexOf(`label="${l}"`));
        expect(order.every((n) => n >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it("billing period, invoice date and due date are read-only stated values", () => {
        for (const label of ["Billing period", "Invoice date", "Due date"]) {
            const cell = row.slice(row.indexOf(`label="${label}"`)).split("</DateCell>")[0]!;
            expect(cell, label).toMatch(/readOnly/);
            expect(cell, label).not.toMatch(/<input|AlloyDateInput|AlloySelect/);
        }
    });

    it("the host sends the operator's date as service_date to preview AND commit", () => {
        const host = readFileSync(path.join(process.cwd(), "components/admin/focusPanel/cards/FinancialsCard.tsx"), "utf8");
        expect(host.match(/service_date: chargeEventDate/g)?.length).toBe(2);
    });
});
