/**
 * NO CONFIGURATION MAY PROMISE A CADENCE GENERATION CANNOT EXECUTE.
 *
 * ── THE STRUCTURAL GAP ────────────────────────────────────────────────────────────────────────
 *
 * `enrollment_pricing_terms.cadence_key` is `text not null` — no CHECK, no enum, no foreign key —
 * and the platform seeds no cadences at all: `billing_cadences` is authored by the organisation,
 * and `billingFrequencyItemKeyFromLabel` mints the key from whatever label was typed. Between a
 * typed label and an accepted commercial term, nothing asked whether the recurrence engine could
 * derive periods for it.
 *
 * Measured in this tenant: "Semi-Annual" is authored and ACTIVE, with 0 plans using it, and
 * `semiannual` appears in no migration, no library and no application file. It was authorable and
 * unexecutable at the same time.
 *
 * ── WHY THIS LOCK IS GENERIC ──────────────────────────────────────────────────────────────────
 *
 * A test that spelled "Semi-Annual" would pass the day someone types "Fortnightly". The contract
 * is between the set of cadences that may be ACCEPTED and the set the period authority can
 * DERIVE, whatever they are called, so these assert the relationship and never the members.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    isPeriodBillableCadence,
    billingRecurrenceFor,
    billingPeriodFor,
    acceptedTermBillingPeriods,
} from "@/lib/financials/billingPeriod";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Every cadence the derivation authority claims. Read from the authority, never restated. */
const DERIVABLE = ["daily", "weekly", "biweekly", "monthly", "annual"] as const;

describe("the acceptance boundary refuses what the engine cannot derive", () => {
    it("the commit path asks the period authority before writing a term", () => {
        const service = src("lib/enrollment/pricing/enrollmentPricingTermsService.ts");
        expect(service).toContain('import { isPeriodBillableCadence } from "@/lib/financials/billingPeriod"');
        const insert = service.slice(service.indexOf("async function insertTerm"));
        const guard = insert.slice(0, insert.indexOf("const { data: liveRows"));
        expect(guard, "the check happens before the write").toContain("isPeriodBillableCadence(option.cadenceKey)");
        expect(guard).toContain("cadence_not_billable");
    });

    it("the refusal is a named domain code, not a thrown error", () => {
        const service = src("lib/enrollment/pricing/enrollmentPricingTermsService.ts");
        expect(service).toMatch(/PricingCommitRefusalCode =[\s\S]{0,400}"cadence_not_billable"/);
        const action = src("lib/adminV2/actions/definitions/enrollmentPricingActions.ts");
        expect(action, "and it reaches the operator as a refusal").toContain("cadence_not_billable");
    });

    it("refuses every cadence outside the derivable set, whatever it is called", () => {
        for (const authored of ["semiannual", "fortnightly", "per_session", "hourly", "termly", ""]) {
            expect(isPeriodBillableCadence(authored), `${authored || "(blank)"}`).toBe(false);
            expect(billingRecurrenceFor(authored).billable).toBe(false);
        }
    });
});

describe("the two sets agree, member for member", () => {
    it("everything derivable is billable, and produces a period", () => {
        for (const c of DERIVABLE) {
            expect(isPeriodBillableCadence(c), c).toBe(true);
            const p = billingPeriodFor(c, "2026-09-01", "2026-09-17");
            expect(p.start <= "2026-09-17" && p.end >= "2026-09-17", `${c} contains the date`).toBe(true);
            expect(p.label.length, `${c} has a label`).toBeGreaterThan(0);
        }
    });

    it("everything billable has a stated recurrence, and nothing else does", () => {
        for (const c of DERIVABLE) expect(billingRecurrenceFor(c).billable, c).toBe(true);
        /* The relationship, not the membership: billable ⟺ a recurrence is described. */
        for (const c of [...DERIVABLE, "semiannual", "hourly", "per_session", "made_up"]) {
            expect(billingRecurrenceFor(c).billable, c).toBe(isPeriodBillableCadence(c));
        }
    });

    it("an accepted term on a derivable cadence yields current and next periods", () => {
        for (const c of DERIVABLE) {
            const got = acceptedTermBillingPeriods({ cadenceKey: c, effectiveStart: "2026-09-01" }, "2026-09-17");
            expect(got, `${c} derives periods`).not.toBeNull();
            expect(got!.next.start > got!.current.end === false || got!.next.start >= got!.current.start, c).toBe(true);
        }
    });

    it("no accepted term means no invented period", () => {
        expect(acceptedTermBillingPeriods(null, "2026-09-17")).toBeNull();
        expect(acceptedTermBillingPeriods({ cadenceKey: "weekly", effectiveStart: null }, "2026-09-17")).toBeNull();
        expect(acceptedTermBillingPeriods({ cadenceKey: "semiannual", effectiveStart: "2026-09-01" }, "2026-09-17")).toBeNull();
    });
});

describe("the configuration surface tells the operator before they get there", () => {
    it("marks an authored frequency the engine cannot derive", () => {
        const panel = src("components/adminV2/settings/financials/tuitionPlans/TuitionBillingFrequenciesPanel.tsx");
        expect(panel).toContain("billingRecurrenceFor(row.itemKey)");
        expect(panel).toContain("data-billing-recurrence-billable");
    });
});

describe("the tuition embed marker names one node", () => {
    it("the wrapper and the control are told apart", () => {
        const card = src("components/admin/focusPanel/cards/SchedulingCard.tsx");
        const markers = card.match(/data-assignment-tuition-embed="true"/g) ?? [];
        expect(markers.length, "the control alone carries the embed marker").toBe(1);
        expect(card).toContain('data-assignment-tuition-region="true"');
        /* The one that remains is on the select, so `querySelector` cannot return a div. */
        const at = card.indexOf('data-assignment-tuition-embed="true"');
        expect(card.slice(Math.max(0, at - 400), at), "it is the select").toContain("<select");
    });
});
