/**
 * CONFIGURATION AND DERIVATION ARE TWO LEVELS JOINED BY A STRING, AND THE JOIN IS NOT VALIDATED.
 *
 * ── THE TWO LEVELS ────────────────────────────────────────────────────────────────────────────
 *
 * LEVEL 1, CONFIGURATION: an organisation authors billing frequencies in the `billing_cadences`
 * option set. `billingFrequencyItemKeyFromLabel` mints the key from whatever label was typed —
 * "Fortnightly" becomes `fortnightly` — and nothing checks it against anything.
 *
 * LEVEL 2, DERIVATION: `billingPeriodFor` turns an accepted term's cadence key plus the agreement
 * anchor into period INSTANCES. It knows five cadences. Nobody authors "Sep 15–21"; it is derived.
 *
 * ── WHAT HAPPENS AT THE SEAM ──────────────────────────────────────────────────────────────────
 *
 * The money is safe: `previewTuitionGeneration` and `generateTuitionCharges` both gate on
 * `isPeriodBillableCadence` and refuse rather than invent an interval nobody agreed to. What was
 * missing is that the CONFIGURATION surface never said so. An operator could author a frequency,
 * attach it to a plan, have an assignment accept it, and meet silence: no billing period on the
 * assignment and a generation run that refused in an outcome nobody was watching.
 *
 * ── WHAT IS LOCKED ────────────────────────────────────────────────────────────────────────────
 *
 * That the configuration screen reports the DERIVATION AUTHORITY'S answer rather than the
 * operator's own words; that the refusal path stays a refusal; and that period instances are never
 * authored as configuration.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    billingRecurrenceFor,
    billingPeriodFor,
    isPeriodBillableCadence,
} from "@/lib/financials/billingPeriod";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const PANEL = "components/adminV2/settings/financials/tuitionPlans/TuitionBillingFrequenciesPanel.tsx";

describe("a configured frequency states the recurrence the platform will derive", () => {
    it("describes each cadence the period authority can actually bill", () => {
        expect(billingRecurrenceFor("weekly")).toEqual({
            billable: true,
            recurrence: "Every 7 days from the agreement anchor",
        });
        expect(billingRecurrenceFor("biweekly").recurrence).toBe("Every 14 days from the agreement anchor");
        expect(billingRecurrenceFor("daily").recurrence).toBe("Every day from the agreement anchor");
        expect(billingRecurrenceFor("monthly").recurrence).toBe("Each calendar month");
        expect(billingRecurrenceFor("annual").recurrence).toBe("Each year from the agreement anchor");
    });

    it("says plainly when an authored frequency derives no periods", () => {
        /* The exact case an operator can create: a label typed into New Frequency. */
        for (const authored of ["fortnightly", "per_session", "hourly", "", "  "]) {
            const rec = billingRecurrenceFor(authored);
            expect(rec.billable, `${authored || "(blank)"} is not a derivable cadence`).toBe(false);
            expect(rec.recurrence).toMatch(/No recurring periods/);
        }
    });

    it("agrees with the derivation it describes — the stride is not restated by hand", () => {
        /*
         * A description that drifts from `billingPeriodFor` would be worse than none. Derive the
         * periods and check the described stride against the interval that actually comes out.
         */
        const anchor = "2026-09-01";
        const span = (cadence: "weekly" | "biweekly" | "daily") => {
            const p = billingPeriodFor(cadence, anchor, "2026-09-17");
            return (Date.parse(`${p.end}T00:00:00Z`) - Date.parse(`${p.start}T00:00:00Z`)) / 86_400_000 + 1;
        };
        /* The multi-day strides state their number, so drift is catchable by comparing it. */
        for (const [cadence, days] of [["weekly", 7], ["biweekly", 14]] as const) {
            expect(span(cadence), `${cadence} derives ${days}-day periods`).toBe(days);
            expect(billingRecurrenceFor(cadence).recurrence).toContain(String(days));
        }
        /* Daily says "Every day" rather than "Every 1 days", so its stride is checked directly. */
        expect(span("daily")).toBe(1);
        expect(billingRecurrenceFor("daily").recurrence).toBe("Every day from the agreement anchor");
    });

    it("every billable cadence has a description, and only those", () => {
        for (const c of ["daily", "weekly", "biweekly", "monthly", "annual"]) {
            expect(isPeriodBillableCadence(c)).toBe(true);
            expect(billingRecurrenceFor(c).billable).toBe(true);
        }
    });
});

describe("the configuration surface reports the authority, not the operator's own words", () => {
    it("renders the derived recurrence instead of the echoed label", () => {
        const panel = src(PANEL);
        expect(panel).toContain('import { billingRecurrenceFor } from "@/lib/financials/billingPeriod"');
        expect(panel).toContain("billingRecurrenceFor(row.itemKey)");
        expect(panel, "the column is named for what it states").toContain(">Recurrence<");
        /*
         * `cadenceLabel` is the description the operator typed, or failing that the name they
         * typed — echoed beside the Description column that already held it.
         */
        expect(panel, "the echo is gone").not.toContain("row.cadenceLabel");
    });

    it("marks a frequency that cannot drive recurring billing", () => {
        const panel = src(PANEL);
        expect(panel).toContain("data-billing-recurrence-billable");
        expect(panel, "an undeliverable frequency is not styled as ordinary").toContain("text-alloy-ember");
    });

    it("names the two other period systems without owning them", () => {
        const panel = src(PANEL);
        expect(panel, "periods are derived, not authored here").toMatch(/derived from each assignment/);
        expect(panel, "and the accounting calendar is elsewhere").toMatch(/accounting calendar is\s+configured separately/);
    });

    it("authors no period instances", () => {
        /* Nobody types "Sep 15–21" into configuration. */
        const panel = src(PANEL);
        expect(panel).not.toMatch(/billingPeriodFor|billingPeriodsBetween|assignmentBillingPeriods/);
    });
});

describe("generation still refuses a cadence it cannot bill", () => {
    it("keeps the refusal in both the preview and the run", () => {
        for (const f of [
            "lib/financials/tuitionGeneration/previewTuitionGeneration.ts",
            "lib/financials/tuitionGeneration/generateTuitionCharges.ts",
        ]) {
            const code = src(f);
            expect(code, `${f} gates on the cadence`).toContain("isPeriodBillableCadence(cadenceKey)");
            expect(code, `${f} bills nothing when it cannot`).toMatch(/periodsBilled: \[\]/);
        }
    });
});
