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

describe("the control is editable exactly where the operator authors the date", () => {
    const src = readFileSync(path.join(process.cwd(), "components/operationalCards/AddChargeCommand.tsx"), "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

    it("offers the date control only for event_date", () => {
        expect(/controls && t\.occursOn === "event_date" \?/.test(src)).toBe(true);
    });

    it("marks it required exactly there too", () => {
        expect(/label="Service date" required=\{t\.occursOn === "event_date"\}/.test(src)).toBe(true);
    });

    it("and states the derived value otherwise, rather than an empty or disabled control", () => {
        const field = src.slice(src.indexOf('label="Service date"'));
        expect(field.slice(0, 900)).toMatch(/<Value>\{specimen\.serviceDate\}<\/Value>/);
    });
});
