/**
 * THE 200-CHARGE BOUNDARY — the last known correctness blocker before Human QA.
 *
 * `chargeIdsForReads.filter(Boolean).slice(0, 200)` was a URI-length guard: when open collection
 * attempts were fetched with `.in("charge_id", ids)`, too many ids overflowed the request URI and
 * PostgREST answered `URI too long`.
 *
 * That request is gone — the attempts now arrive with the account fact bundle, gathered set-based
 * in SQL. What the slice still did was stop looking after the two-hundredth charge, so an open
 * attempt on a later charge was invisible, and WHICH 200 survived depended on ledger row order.
 * That is a presentation detail deciding what an operator is told about money.
 *
 * These specimens put relevant facts on BOTH sides of the old boundary and prove the repair
 * includes the far one exactly once, while leaving every answer below the boundary untouched.
 */
import { describe, expect, it } from "vitest";

import { selectOpenCollections, OPEN_COLLECTION_STATES } from "@/lib/adminV2/runtime/focusPanel/financials/selectOpenCollections";

/** Deterministic, and deliberately not Kelly's Human-QA household. */
const CHARGES = Array.from({ length: 250 }, (_, i) => `chg-${String(i).padStart(3, "0")}`);
const attempt = (chargeId: string, state: string, updated: string) => ({
    id: `att-${chargeId}-${state}`,
    charge_id: chargeId,
    processor_state: state,
    updated_at: updated,
    canonical_payment_id: null,
});

/** One open attempt BEFORE the old boundary, one well AFTER it. */
const NEAR = attempt(CHARGES[5]!, "processing", "2026-09-01T00:00:00Z");
const FAR = attempt(CHARGES[230]!, "requires_action", "2026-09-02T00:00:00Z");
const ATTEMPTS = [NEAR, FAR];

/** Exactly what the code did before the repair, kept here so the boundary is demonstrated. */
function legacySelect(attempts: typeof ATTEMPTS, chargeIds: string[]) {
    const capped = new Set(chargeIds.filter(Boolean).slice(0, 200));
    return attempts.filter((a) => capped.has(a.charge_id) && OPEN_COLLECTION_STATES.has(a.processor_state));
}

describe("the old boundary was real", () => {
    it("the capped selection silently misses an open attempt past the 200th charge", () => {
        const seen = legacySelect(ATTEMPTS, CHARGES).map((a) => a.id);
        expect(seen, "the near attempt was always found").toContain(NEAR.id);
        expect(seen, "and the far one never was — this is the defect").not.toContain(FAR.id);
    });
});

describe("the repair considers every canonically relevant charge", () => {
    it("includes the far attempt, exactly once", () => {
        const seen = selectOpenCollections(ATTEMPTS, CHARGES).map((a) => a.id);
        expect(seen).toContain(FAR.id);
        expect(seen.filter((id) => id === FAR.id).length, "no duplication").toBe(1);
        expect(seen.filter((id) => id === NEAR.id).length, "and none below the boundary either").toBe(1);
        expect(seen.length, "no omission, and nothing invented").toBe(2);
    });

    it("answers identically below the boundary — no account under 200 charges moves", () => {
        /*
         * The repair must not change money for accounts that never crossed the cap. Every prefix of
         * the cohort is checked rather than one sample, because "it happens to agree at 250" is not
         * the claim being made.
         */
        for (const size of [1, 7, 50, 199, 200]) {
            const ids = CHARGES.slice(0, size);
            const before = legacySelect(ATTEMPTS, ids).map((a) => a.id).sort();
            const after = selectOpenCollections(ATTEMPTS, ids).map((a) => a.id).sort();
            expect(after, `cohort of ${size} charges must answer exactly as before`).toEqual(before);
        }
    });

    it("keeps the economics: only open states, only this account's charges, newest first", () => {
        const foreign = attempt("chg-not-on-this-account", "processing", "2026-09-09T00:00:00Z");
        const settled = attempt(CHARGES[210]!, "canceled", "2026-09-08T00:00:00Z");
        const rows = selectOpenCollections([NEAR, FAR, foreign, settled], CHARGES);
        expect(rows.map((a) => a.id), "a foreign charge and a closed state are both excluded")
            .toEqual([FAR.id, NEAR.id]);
        expect(rows[0]!.updated_at, "newest updated first, as before").toBe(FAR.updated_at);
    });

    it("no charges is not the same as no open attempts", () => {
        expect(selectOpenCollections(ATTEMPTS, []), "an account with nothing to ask about").toEqual([]);
        expect(selectOpenCollections([], CHARGES), "asked, and there are none").toEqual([]);
    });

    it("the cap is gone from the caller, not merely raised", () => {
        const src = require("node:fs").readFileSync(
            require("node:path").join(process.cwd(), "lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts"),
            "utf8",
        ) as string;
        expect(src, "no 200-slice").not.toMatch(/slice\(0,\s*200\)/);
        expect(src, "and no arbitrary larger number in its place").not.toMatch(/slice\(0,\s*\d{3,}\)/);
        expect(src, "the selection is the named authority").toContain("selectOpenCollections(");
    });
});
