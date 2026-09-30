/**
 * THE ACCOUNT GRAIN MUST REACH ITS AUTHORITY.
 *
 * The Financials account card is customer-grain: a receipt, a held deposit and available prepaid
 * belong to the HOUSEHOLD, not to any one child. It has always dispatched `customer`. The action
 * runtime's entity vocabulary did not contain that grain, and `checkContext` refuses an unknown
 * type with `unsupported_entity_type` BEFORE the action runs — so on deployed staging every
 * held-money act reached a 400 instead of its authority. Nothing could create a hold, apply held
 * money, release it, or deliberately apply available prepaid, and the whole lifecycle W4 built
 * and W6-B productized was unreachable in production while every unit test stayed green.
 *
 * Measured on deployed staging (build f3fd86b4b), same receipt and same payload:
 *   deposit.hold / customer                     -> 400 unsupported_entity_type
 *   deposit.hold / child|person|opportunity|ocm -> 200 eligible: true
 *   payment.apply_to_charge / customer          -> 400 unsupported_entity_type
 *   payment.apply_to_charge / child             -> 400 missing_charge   (past the gate)
 *
 * The entity is ATTRIBUTION, not routing — `payment_id`, `hold_id` and `charge_id` in the payload
 * decide what the money does — which is why the same call previewed identically under four grains
 * and failed under the one the product actually uses.
 */
import { describe, expect, it } from "vitest";
import {
    ACTION_ENTITY_TYPES,
    isActionEntityType,
    normalizeActionEntityType,
} from "@/lib/adminV2/actions/actionTypes";
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import { runRegisteredAction } from "@/lib/adminV2/actions/actionExecutor";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Every act the Financials account card raises against an account. */
const ACCOUNT_GRAIN_ACTIONS = [
    "deposit.hold",
    "deposit.release",
    "payment.apply_to_charge",
    "payment.reverse_application",
    "payment.record",
    "payment.refund",
    "payment.collect_card",
] as const;

/*
 * The entity gate runs before validatePayload and before any handler, so nothing here reaches a
 * database. A stub is enough, and using one keeps the test about the gate rather than about a
 * fake's fidelity.
 */
const supabase = {} as unknown as SupabaseClient;
const ctx = { orgId: "org-1", userId: "user-1" };

const ENTITY_GATE = "unsupported_entity_type";
const blockerCodes = (r: Awaited<ReturnType<typeof runRegisteredAction>>) =>
    r.ok ? [] : (r.blockers ?? []).map((b) => b.code);

describe("the account grain is part of the action vocabulary", () => {
    it("names customer, and the union derives from the same list", () => {
        expect(ACTION_ENTITY_TYPES).toContain("customer");
        expect(isActionEntityType("customer")).toBe(true);
        expect(normalizeActionEntityType("customers")).toBe("customer");
    });

    it("still refuses a grain nobody declared, so the guard has not simply been removed", () => {
        expect(isActionEntityType("household")).toBe(false);
        expect(isActionEntityType("")).toBe(false);
    });
});

describe("every act the account card dispatches declares the grain it is dispatched at", () => {
    for (const key of ACCOUNT_GRAIN_ACTIONS) {
        it(`${key} accepts customer`, () => {
            const action = getRegisteredAction(key);
            expect(action, `${key} is not registered`).toBeTruthy();
            expect(action?.supportedEntityTypes).toContain("customer");
        });
    }
});

describe("the executor admits the account grain", () => {
    for (const key of ACCOUNT_GRAIN_ACTIONS) {
        it(`${key} gets past the entity gate as customer`, async () => {
            const result = await runRegisteredAction(
                supabase,
                ctx,
                { actionKey: key, entityType: "customer", entityId: "cust-1", payload: {} },
                "preview",
            );
            /*
             * The payload is deliberately empty, so a refusal here is expected — but it must be
             * the ACTION's refusal about its own inputs, never the runtime refusing the grain.
             */
            expect(blockerCodes(result)).not.toContain(ENTITY_GATE);
        });
    }

    /*
     * THE CONTROL. Without this, "not refused" would also pass if the gate were deleted. `job` is
     * a real grain in the vocabulary that no financial action declares, so it must still be
     * refused by exactly the code the account grain must not produce.
     */
    it("still refuses a declared grain the financial actions do not support", async () => {
        const result = await runRegisteredAction(
            supabase,
            ctx,
            { actionKey: "deposit.hold", entityType: "job", entityId: "job-1", payload: {} },
            "preview",
        );
        expect(result.ok).toBe(false);
        expect(blockerCodes(result)).toContain(ENTITY_GATE);
    });
});
