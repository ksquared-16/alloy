/**
 * THE COLLECTIBILITY TOTAL COUNTS OBLIGATIONS, NOT THE THINGS THAT HAPPEN TO THEM.
 *
 * Found in Core Financials QA on hosted staging. The account side reported $93.00 owed and the
 * collections side reported $173.00 collectible for the same household in the same period. Both are
 * canonical authorities, so one of them was going to ask a family for money it did not owe.
 *
 * The cause was a double count that only became visible when a reduction was REVERSED. The
 * collectibility total looped over every posted row and asked `resolveFamilyCollectible` about it.
 * Reduction rows are posted rows, and they are already counted inside the net of the charge they
 * reduce — so they were counted twice. It looked harmless because it was silent: a credit is
 * negative, the resolver refuses a non-tuition charge worth nothing or less, and the caller's catch
 * turned that refusal into a zero. Credits therefore vanished from the total.
 *
 * Reversing a credit appends a POSITIVE `adjustment` row. That reads to the resolver as an ordinary
 * obligation, so it contributed in full — the money went out of the total on the way down and came
 * back in twice on the way up, overstating collectibility by exactly the reversed credits.
 *
 * The fix is to exclude offset rows by what they ARE, instead of relying on a refusal to hide them.
 */
import { describe, expect, it } from "vitest";
import { isCollectibleOffsetRow } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

const row = (categoryKey: string, correctsChargeId: string | null = null) =>
    ({ categoryKey, correctsChargeId }) as Parameters<typeof isCollectibleOffsetRow>[0];

describe("collectibility counts obligations, not offsets", () => {
    it("counts an ordinary obligation", () => {
        expect(isCollectibleOffsetRow(row("fee"))).toBe(false);
        expect(isCollectibleOffsetRow(row("tuition"))).toBe(false);
        expect(isCollectibleOffsetRow(row("late_pickup"))).toBe(false);
        expect(isCollectibleOffsetRow(row("consumable_fee"))).toBe(false);
        expect(isCollectibleOffsetRow(row("one_time"))).toBe(false);
    });

    it("excludes a manual credit, which is already inside its obligation's net", () => {
        expect(isCollectibleOffsetRow(row("credit"))).toBe(true);
        expect(isCollectibleOffsetRow(row("discount"))).toBe(true);
    });

    /*
     * THE ROW THAT CAUSED THE DEFECT. A reversed credit is positive, so nothing refuses it and
     * nothing hid it. If this one ever returns false again the overstatement comes straight back.
     */
    it("excludes the POSITIVE adjustment a reversed credit appends", () => {
        expect(isCollectibleOffsetRow(row("adjustment"))).toBe(true);
    });

    it("excludes a charge correction, whatever its category says", () => {
        expect(isCollectibleOffsetRow(row("fee", "the-charge-it-corrects"))).toBe(true);
        expect(isCollectibleOffsetRow(row("tuition", "the-charge-it-corrects"))).toBe(true);
    });

    it("excludes subsidy offsets, which Thread 9 counts through the claim instead", () => {
        expect(isCollectibleOffsetRow(row("subsidy_offset"))).toBe(true);
    });

    /**
     * THE ARITHMETIC THE DEFECT GOT WRONG, stated as the scenario that found it.
     *
     * September held: Materials $18 and Registration $75 unpaid, a Late pickup $25 that was
     * reversed, and a Field-trip credit cycle of -$40, +$40, -$40, +$40 that nets to nothing.
     * $93.00 is owed. Summing only the obligations reaches it; summing every posted row and letting
     * the negatives be refused reached $173.00.
     */
    it("reaches the account side's own answer on the scenario that exposed it", () => {
        const september = [
            { categoryKey: "consumable_fee", correctsChargeId: null, cents: 1800 },
            { categoryKey: "fee", correctsChargeId: null, cents: 7500 },
            { categoryKey: "late_pickup", correctsChargeId: null, cents: 0 }, // reversed to nil
            { categoryKey: "credit", correctsChargeId: null, cents: -4000 },
            { categoryKey: "credit", correctsChargeId: null, cents: -4000 },
            { categoryKey: "adjustment", correctsChargeId: null, cents: 4000 },
            { categoryKey: "adjustment", correctsChargeId: null, cents: 4000 },
            { categoryKey: "late_pickup", correctsChargeId: "the-late-pickup", cents: -2500 },
        ];

        const collectible = september
            .filter((r) => !isCollectibleOffsetRow(r))
            .reduce((sum, r) => sum + r.cents, 0);
        expect(collectible).toBe(9300);

        // The old behaviour, kept as the thing that must not come back: negatives refused and
        // dropped, positives counted in full.
        const beforeTheFix = september
            .filter((r) => r.cents > 0)
            .reduce((sum, r) => sum + r.cents, 0);
        expect(beforeTheFix).toBe(17300);
        expect(beforeTheFix).not.toBe(collectible);
    });
});
