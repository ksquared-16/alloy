import { describe, expect, it } from "vitest";

import {
    CHARGE_ADD_ACTION_KEY,
    CHARGE_POST_ACTION_KEY,
    CHARGE_REVERSE_ACTION_KEY,
    financialChargeActions,
} from "@/lib/adminV2/actions/definitions/financialChargeActions";
import { REGISTERED_ACTION_CAPABILITY_KEYS } from "@/lib/platform/commands/capabilityRegistry";

function action(key: string) {
    const found = financialChargeActions.find((a) => a.actionKey === key);
    if (!found) throw new Error(`no registered action ${key}`);
    return found;
}

describe("financial charge actions — the operator can complete the lifecycle", () => {
    /*
     * A DRAFT THAT CANNOT BE POSTED IS NOT A CHARGE, AND POSTED MONEY THAT CANNOT BE CORRECTED IS A
     * DEAD END. Add charge deliberately writes a draft, so without a reachable post the card's
     * central question — what is owed — could only ever answer zero; and immutability without a
     * correction path enforces a mistake rather than protecting a record.
     */
    it("registers add, post and reverse", () => {
        expect(financialChargeActions.map((a) => a.actionKey).sort()).toEqual(
            [CHARGE_ADD_ACTION_KEY, CHARGE_POST_ACTION_KEY, CHARGE_REVERSE_ACTION_KEY].sort(),
        );
        for (const key of [CHARGE_ADD_ACTION_KEY, CHARGE_POST_ACTION_KEY, CHARGE_REVERSE_ACTION_KEY]) {
            expect(REGISTERED_ACTION_CAPABILITY_KEYS as readonly string[]).toContain(key);
        }
    });

    /*
     * THE SUBJECT OF A POST IS THE CHARGE.
     *
     * Requiring a child entity refused exactly the case the `customer` billable source exists for: a
     * family with a registration fee and no enrolled child has no `customer_member_id` to send, so
     * their charge could be created and never made owed. Add charge still requires one — it has to
     * resolve what the charge hangs off.
     */
    it("does not gate posting or correcting on a child entity", () => {
        expect(action(CHARGE_ADD_ACTION_KEY).requiredContext.requiresEntityId).toBe(true);
        expect(action(CHARGE_POST_ACTION_KEY).requiredContext.requiresEntityId).toBe(false);
        expect(action(CHARGE_REVERSE_ACTION_KEY).requiredContext.requiresEntityId).toBe(false);
    });

    it("still requires the charge each one acts on", () => {
        for (const key of [CHARGE_POST_ACTION_KEY, CHARGE_REVERSE_ACTION_KEY]) {
            const result = action(key).validatePayload!({});
            expect(result.ok).toBe(false);
            expect(result.ok === false && result.blockers[0]?.code).toBe("missing_charge");
        }
    });

    it("refuses a correction kind the service does not implement", () => {
        const result = action(CHARGE_REVERSE_ACTION_KEY).validatePayload!({
            charge_id: "chg-1",
            kind: "delete",
        });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.blockers[0]?.code).toBe("invalid_correction_kind");
    });

    it("defaults a correction to a reversal, whose amount the service derives", () => {
        const result = action(CHARGE_REVERSE_ACTION_KEY).validatePayload!({ charge_id: "chg-1" });
        expect(result.ok).toBe(true);
    });
});
