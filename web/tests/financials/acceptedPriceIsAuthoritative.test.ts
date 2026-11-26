/**
 * WHAT A FAMILY ACCEPTED IS WHAT A FAMILY IS BILLED.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────────
 *
 * `resolveAmount` returned the charge template's own `amount_cents` whenever `amount_strategy` was
 * `fixed`, and the accepted price arrived as `resolvedAmountCents` — a rate hint a fixed template is
 * entitled to ignore. On the certification tenant the tuition template is fixed at $400.00, so an
 * accepted **$185.00/week** and an accepted **$1,450.00/month** were both billed as **$400.00**, on
 * every generated obligation, silently.
 *
 * `consumptionService` already states the doctrine for the catalog — an accepted term means the
 * catalog lookup "is SKIPPED ENTIRELY — not consulted and overridden, skipped" — because "an
 * accepted term may be an OVERRIDE, deliberately not the recommendation, so re-resolving would bill
 * a rate nobody agreed to". The template was the one layer that had not been told.
 *
 * ── WHY A SEPARATE FIELD AND NOT A BIGGER NUMBER ──────────────────────────────────────────────
 *
 * A number cannot carry its own authority. `acceptedAmountCents` IS the authority: present means a
 * commercial contract already decided this. That is why the locks below test the FIELD rather than
 * the value — passing $185 as a rate hint must still lose to a fixed template, because a rate hint
 * is not an agreement.
 */
import { describe, expect, it } from "vitest";

import { resolveChargeFromTemplate } from "@/lib/financials/chargeLifecycle/resolveChargeFromTemplate";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";

/** The certification tenant's tuition template, verbatim: fixed, $400.00, active from 2026-01-01. */
const FIXED_TUITION = {
    id: "tpl-1",
    org_id: "org-1",
    template_key: "tuition",
    label: "Monthly tuition",
    service_id: null,
    charge_category: "tuition",
    amount_strategy: "fixed",
    amount_cents: 40_000,
    currency_code: "USD",
    occurs_on_strategy: "service_period_start",
    billable_on_strategy: "immediate",
    billable_offset_days: null,
    default_gl_mapping_key: "4000",
    default_responsibility_key: "household",
    review_required: false,
    is_active: true,
    effective_start: "2026-01-01",
    effective_end: null,
} as unknown as ChargeTemplateRow;

const RATE_DERIVED = { ...FIXED_TUITION, amount_strategy: "rate_derived", amount_cents: null } as ChargeTemplateRow;

const CTX = { today: "2026-09-18", servicePeriodStart: "2026-09-01", scopeKey: "agr-1" };

describe("THE GATE — an accepted term outranks a fixed template", () => {
    /* The weekly specimen, at the amount the operator accepted on the panel. */
    it("bills the accepted $185.00 weekly, not the template's $400.00", () => {
        const intent = resolveChargeFromTemplate(FIXED_TUITION, { ...CTX, acceptedAmountCents: 18_500 });
        expect(intent.eligible).toBe(true);
        expect(intent.amountCents).toBe(18_500);
    });

    /* The monthly specimen. */
    it("bills the accepted $1,450.00 monthly, not the template's $400.00", () => {
        const intent = resolveChargeFromTemplate(FIXED_TUITION, { ...CTX, acceptedAmountCents: 145_000 });
        expect(intent.amountCents).toBe(145_000);
    });

    /* And it is not a tie-break on size: a SMALLER accepted amount wins just as completely. */
    it("wins whether the agreed price is higher or lower than the template's", () => {
        for (const cents of [1, 18_500, 39_999, 40_001, 999_999]) {
            expect(resolveChargeFromTemplate(FIXED_TUITION, { ...CTX, acceptedAmountCents: cents }).amountCents).toBe(cents);
        }
    });

    /*
     * THE TEMPLATE KEEPS EVERYTHING THAT IS ACTUALLY ITS JOB. This is the half that says the repair
     * is a precedence rule and not a bypass: category, GL mapping, responsibility and the dates all
     * still come from configuration.
     */
    it("takes only the amount — category, GL, responsibility and dates stay the template's", () => {
        const intent = resolveChargeFromTemplate(FIXED_TUITION, { ...CTX, acceptedAmountCents: 18_500 });
        expect(intent.chargeCategory).toBe("tuition");
        expect(intent.glMappingKey).toBe("4000");
        expect(intent.responsibilityKey).toBe("household");
        expect(intent.occursOn).toBe("2026-09-01");
        expect(intent.amountStrategy, "the strategy is still reported honestly").toBe("fixed");
    });
});

describe("THE GATE — nothing else changes", () => {
    /*
     * A template legitimately used for a registration fee, a field trip or a manual Add has no
     * accepted commercial term behind it, and must keep pricing itself exactly as before.
     */
    it("keeps the fixed template's own amount where no term was accepted", () => {
        expect(resolveChargeFromTemplate(FIXED_TUITION, CTX).amountCents).toBe(40_000);
        expect(resolveChargeFromTemplate(FIXED_TUITION, { ...CTX, acceptedAmountCents: null }).amountCents).toBe(40_000);
    });

    /*
     * A RATE HINT IS NOT AN AGREEMENT. `resolvedAmountCents` carries a catalog-derived number and
     * must still lose to a fixed template — otherwise the repair would have been "make the number
     * win", which is the authority conflict in the other direction.
     */
    it("still lets a fixed template beat a mere rate hint", () => {
        expect(resolveChargeFromTemplate(FIXED_TUITION, { ...CTX, resolvedAmountCents: 18_500 }).amountCents).toBe(40_000);
    });

    it("leaves rate_derived reading its rate", () => {
        expect(resolveChargeFromTemplate(RATE_DERIVED, { ...CTX, resolvedAmountCents: 18_500 }).amountCents).toBe(18_500);
    });

    /* And an accepted term outranks a rate_derived rate too — same rule, no special case. */
    it("outranks a rate_derived rate as well", () => {
        const intent = resolveChargeFromTemplate(RATE_DERIVED, { ...CTX, resolvedAmountCents: 999, acceptedAmountCents: 18_500 });
        expect(intent.amountCents).toBe(18_500);
    });
});
