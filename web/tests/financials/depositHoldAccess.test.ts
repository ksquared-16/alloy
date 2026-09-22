/**
 * WHO MAY DECIDE WHAT A FAMILY'S MONEY CAN BE SPENT ON.
 *
 * Holding money changes what an operator may settle an obligation with, without changing what is
 * owed — the act `fin.adjust` was minted to separate from ordinary billing. These prove the gate is
 * real on both halves, and that W4 did not quietly mint a `fin.deposit`.
 */
import { describe, expect, it } from "vitest";

import {
    DEPOSIT_HOLD_ACTION_KEY,
    DEPOSIT_RELEASE_ACTION_KEY,
    depositHoldActions,
} from "@/lib/adminV2/actions/definitions/depositHoldActions";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    financialAuthority,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";

const ACTOR = "user-1";

function action(key: string) {
    const found = depositHoldActions.find((a) => a.actionKey === key);
    if (!found) throw new Error(`no registered action ${key}`);
    return found;
}

function supabaseWith(keys: string[]) {
    return createOperationalEnrollmentMockSupabase(
        createOperationalEnrollmentMockStore({ ...financialAuthority(keys, ACTOR) }),
    ) as never;
}

const ctx = { orgId: ORG_ID, userId: ACTOR } as never;
const invocation = { actionKey: "", entityType: "opportunity", entityId: "" } as never;

const PAYLOADS: Record<string, Record<string, unknown>> = {
    [DEPOSIT_HOLD_ACTION_KEY]: { payment_id: "pay-1", amount_cents: 30_000 },
    [DEPOSIT_RELEASE_ACTION_KEY]: { hold_id: "hold-1", amount_cents: 10_000 },
};

const CASES = [
    [DEPOSIT_HOLD_ACTION_KEY, "Holding"],
    [DEPOSIT_RELEASE_ACTION_KEY, "Releasing"],
] as const;

describe("held deposits require fin.adjust", () => {
    it.each(CASES)("%s is ineligible and refuses execution for a read-only financial role", async (key) => {
        const supabase = supabaseWith(["fin.read"]);

        const eligibility = await action(key).resolveEligibility({ supabase, ctx, invocation, payload: PAYLOADS[key] } as never);
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.blockers[0]?.code).toBe("deposit_permission_required");

        const executed = await action(key).execute({ supabase, ctx, invocation, payload: PAYLOADS[key] } as never);
        expect(executed.ok, "hiding a control is not authorization").toBe(false);
        if (executed.ok) return;
        expect(executed.status).toBe(403);
        expect(executed.error).toContain("fin.adjust");
    });

    /**
     * BILLING IS NOT THE SAME AUTHORITY, which is the entire reason `fin.adjust` exists — otherwise
     * everyone who can bill can also decide what a family owes, or here, what their money may buy.
     */
    it.each(CASES)("%s is refused to an operator holding only fin.write", async (key) => {
        const eligibility = await action(key).resolveEligibility({
            supabase: supabaseWith(["fin.read", "fin.write"]), ctx, invocation, payload: PAYLOADS[key],
        } as never);
        expect(eligibility.eligible).toBe(false);
    });

    it.each(CASES)("%s IS offered to an operator holding fin.adjust", async (key) => {
        const eligibility = await action(key).resolveEligibility({
            supabase: supabaseWith(["fin.read", "fin.adjust"]), ctx, invocation, payload: PAYLOADS[key],
        } as never);
        expect(eligibility.eligible).toBe(true);
    });

    it.each(CASES)("%s refuses an unidentified caller", async (key) => {
        const executed = await action(key).execute({
            supabase: supabaseWith(["fin.read", "fin.adjust"]),
            ctx: { orgId: ORG_ID, userId: null } as never,
            invocation,
            payload: PAYLOADS[key],
        } as never);
        expect(executed.ok).toBe(false);
        if (executed.ok) return;
        expect(executed.status).toBe(403);
    });

    /* There is deliberately no `fin.deposit`; the approved architecture decided this. */
    it("mints no deposit-specific permission", () => {
        for (const a of depositHoldActions) {
            const serialized = JSON.stringify(a.description) + a.actionKey;
            expect(serialized).not.toContain("fin.deposit");
        }
        expect(depositHoldActions.map((a) => a.actionKey).sort())
            .toEqual(["deposit.hold", "deposit.release"]);
    });

    it("refuses a payload with no amount or no subject", () => {
        expect(action(DEPOSIT_HOLD_ACTION_KEY).validatePayload?.({ payment_id: "pay-1" } as never)?.ok).toBe(false);
        expect(action(DEPOSIT_HOLD_ACTION_KEY).validatePayload?.({ amount_cents: 100 } as never)?.ok).toBe(false);
        expect(action(DEPOSIT_RELEASE_ACTION_KEY).validatePayload?.({ amount_cents: 100 } as never)?.ok).toBe(false);
        expect(action(DEPOSIT_HOLD_ACTION_KEY).validatePayload?.({ payment_id: "pay-1", amount_cents: -5 } as never)?.ok).toBe(false);
    });

    /* The preview must tell an operator the two things a hold is NOT. */
    it("previews a hold as changing nothing about what is owed", async () => {
        const preview = await action(DEPOSIT_HOLD_ACTION_KEY).buildPreview?.({
            supabase: supabaseWith(["fin.read", "fin.adjust"]), ctx, invocation,
            payload: { payment_id: "pay-1", amount_cents: 30_000, refundable: true },
        } as never);
        const changes = (preview?.changes ?? []).join(" ");
        expect(changes).toMatch(/does NOT change what the family owes/i);
        expect(changes).toMatch(/moves no money/i);
    });

    it("previews a non-refundable hold as non-refundable", async () => {
        const preview = await action(DEPOSIT_HOLD_ACTION_KEY).buildPreview?.({
            supabase: supabaseWith(["fin.read", "fin.adjust"]), ctx, invocation,
            payload: { payment_id: "pay-1", amount_cents: 30_000, refundable: false },
        } as never);
        expect((preview?.changes ?? []).join(" ")).toMatch(/NON-REFUNDABLE/i);
    });

    it("previews a release as not a refund and not an application", async () => {
        const preview = await action(DEPOSIT_RELEASE_ACTION_KEY).buildPreview?.({
            supabase: supabaseWith(["fin.read", "fin.adjust"]), ctx, invocation, payload: PAYLOADS[DEPOSIT_RELEASE_ACTION_KEY],
        } as never);
        const changes = (preview?.changes ?? []).join(" ");
        expect(changes).toMatch(/NOT a refund/i);
        expect(changes).toMatch(/what was originally held stays on the record/i);
    });
});
