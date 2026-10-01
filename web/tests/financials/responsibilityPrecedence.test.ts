/**
 * EXPLICIT OVERRIDE > STANDING ARRANGEMENT > UNALLOCATED.
 *
 * Bound deterministically rather than mounted, and the honest reason is recorded here: no
 * disposable fixture on deployed staging has a second responsible party, so a mounted multi-party
 * override cannot be expressed without inventing a household topology — which the Director
 * explicitly forbade. What CAN be bound, and is, is the precedence branch itself: the command must
 * send the operator's own shares when they chose some, and the standing arrangement otherwise.
 *
 * This is the branch whose other half shipped broken: `standingShares` was always empty because the
 * route dropped the party id, so the fallback silently never ran. A guard on the branch alone would
 * not have caught that — see standingArrangementIsInheritable, which binds the producer/consumer
 * contract that actually failed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const CODE = readFileSync(
    path.join(process.cwd(), "components/admin/focusPanel/cards/FinancialsCard.tsx"),
    "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the command chooses the operator's answer over the account's", () => {
    it("treats an override as explicit only when the operator opened Charge To AND named shares", () => {
        /*
         * Both halves matter. `chargeToChanging` alone would make merely opening the editor an
         * override; `chargeShares.length` alone would let a stale selection outrank the standing
         * arrangement the operator never departed from.
         */
        expect(/const applying = chargeToChanging && chargeShares\.length > 0;/.test(CODE)).toBe(true);
    });

    it("sends the operator's shares when applying, and the standing ones otherwise", () => {
        expect(/const shares = applying\s*\?\s*chargeShares/.test(CODE), "override wins").toBe(true);
        expect(/:\s*standingShares;/.test(CODE), "and the standing arrangement is the fallback").toBe(true);
    });

    it("writes nothing at all when neither exists — unallocated is a real third state", () => {
        /*
         * The charge is still created; it simply carries no allocation, which is the truthful
         * answer for a household that has configured none. The guard is that the writer is not
         * called with an empty share set.
         */
        expect(/if \(applying \|\| standingShares\.length > 0\)/.test(CODE)).toBe(true);
    });

    it("keys the write on the charge, so the arrangement it creates is charge-scoped", () => {
        const call = CODE.slice(CODE.indexOf('run("billing.configure_responsibility"'));
        expect(call.slice(0, 400)).toMatch(/charge_id: chargeId/);
    });
});
