/**
 * WHO MAY FINISH RECORDING MONEY THAT ALREADY MOVED.
 *
 * Recognition carries `fin.write` — the same authority that authorised the collection — because it
 * decides nothing new. These cases prove the gate is real rather than a hidden menu item, and that
 * W3 did not quietly mint a permission of its own.
 */
import { describe, expect, it } from "vitest";

import {
    PAYMENT_RECOGNIZE_ACTION_KEY,
    paymentRecognitionActions,
} from "@/lib/adminV2/actions/definitions/paymentRecognitionActions";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    financialAuthority,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";

const ACTOR = "user-1";
const action = paymentRecognitionActions.find((a) => a.actionKey === PAYMENT_RECOGNIZE_ACTION_KEY)!;

function supabaseWith(keys: string[]) {
    return createOperationalEnrollmentMockSupabase(
        createOperationalEnrollmentMockStore({ ...financialAuthority(keys, ACTOR) }),
    ) as never;
}

const ctx = { orgId: ORG_ID, userId: ACTOR } as never;
const invocation = { actionKey: PAYMENT_RECOGNIZE_ACTION_KEY, entityType: "opportunity", entityId: "" } as never;
const payload = { collection_attempt_id: "att-1" };

describe("recognizing a payment requires fin.write", () => {
    it("is ineligible and refuses execution for a read-only financial role", async () => {
        const supabase = supabaseWith(["fin.read"]);

        const eligibility = await action.resolveEligibility({ supabase, ctx, invocation, payload } as never);
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.blockers[0]?.code).toBe("payment_recognize_permission_required");

        const executed = await action.execute({ supabase, ctx, invocation, payload } as never);
        expect(executed.ok, "hiding a control is not authorization").toBe(false);
        if (executed.ok) return;
        expect(executed.status).toBe(403);
        expect(executed.error).toContain("fin.write");
    });

    it("IS offered to an operator holding fin.write", async () => {
        const eligibility = await action.resolveEligibility({
            supabase: supabaseWith(["fin.read", "fin.write"]), ctx, invocation, payload,
        } as never);
        expect(eligibility.eligible).toBe(true);
    });

    it("refuses an unidentified caller", async () => {
        const executed = await action.execute({
            supabase: supabaseWith(["fin.read", "fin.write"]),
            ctx: { orgId: ORG_ID, userId: null } as never,
            invocation,
            payload,
        } as never);
        expect(executed.ok).toBe(false);
        if (executed.ok) return;
        expect(executed.status).toBe(403);
    });

    /**
     * RECOGNITION IS NOT AN ADJUSTMENT AND NOT A PROVIDER DECISION.
     *
     * An operator who may adjust balances but may not collect has no business completing a
     * collection; one who may configure the provider decides where money settles, not whether a
     * particular payment is recorded. Both are refused, which is what proves W3 reused `fin.write`
     * rather than widening something.
     */
    it.each([["fin.adjust"], ["fin.provider"]])("holding only %s does not permit recognition", async (key) => {
        const eligibility = await action.resolveEligibility({
            supabase: supabaseWith(["fin.read", key]), ctx, invocation, payload,
        } as never);
        expect(eligibility.eligible).toBe(false);
    });

    it("requires a collection to act on", () => {
        expect(action.validatePayload?.({} as never)?.ok).toBe(false);
        expect(action.validatePayload?.({ collection_attempt_id: "att-1" } as never)?.ok).toBe(true);
    });
});
