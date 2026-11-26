/**
 * WHO MAY PUT A FAMILY'S CARD ON FILE — and who may not.
 *
 * The mirror image of W1's access proof, and deliberately a DIFFERENT answer. Connecting a provider
 * takes `fin.provider` because it chooses where an organisation's money settles. Adding one family's
 * card is ordinary front-desk work, so it takes `fin.write` — the key `ops` already holds.
 *
 * Both halves matter. Eligibility decides whether a control is OFFERED; execute decides whether the
 * act HAPPENS. A panel that hid the button and an executor that accepted the call anyway would be a
 * product with no authorization at all.
 *
 * The cross-tenant case is here too, because "not permitted" and "not yours" are different refusals
 * and only one of them is about the caller's role.
 */
import { describe, expect, it } from "vitest";

import {
    PAYMENT_METHOD_ADD_ACTION_KEY,
    PAYMENT_METHOD_REVOKE_ACTION_KEY,
    PAYMENT_METHOD_SET_DEFAULT_ACTION_KEY,
    paymentMethodActions,
} from "@/lib/adminV2/actions/definitions/paymentMethodActions";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    financialAuthority,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";

const ACTOR = "user-1";
const CUSTOMER = "cust-1";

function action(key: string) {
    const found = paymentMethodActions.find((a) => a.actionKey === key);
    if (!found) throw new Error(`no registered action ${key}`);
    return found;
}

/**
 * The shared operational mock models no `customers` table, so the account gate would answer "not
 * found" for EVERY id — which would make the cross-tenant case below pass even if the gate were
 * deleted. This wrapper gives the gate one real in-org account to find, so the two answers can
 * actually differ.
 */
function supabaseWith(keys: string[]) {
    const base = createOperationalEnrollmentMockSupabase(
        createOperationalEnrollmentMockStore({ ...financialAuthority(keys, ACTOR) }),
    ) as unknown as { from: (table: string) => unknown };

    return {
        ...base,
        from(table: string) {
            if (table !== "customers") return base.from(table);
            const filters: Array<(r: Record<string, unknown>) => boolean> = [];
            const self: Record<string, unknown> = {};
            self.select = () => self;
            self.eq = (col: string, value: unknown) => {
                filters.push((r) => r[col] === value);
                return self;
            };
            self.maybeSingle = async () => {
                const rows = [{ id: CUSTOMER, org_id: ORG_ID }];
                const hit = rows.find((r) => filters.every((f) => f(r as Record<string, unknown>)));
                return { data: hit ?? null, error: null };
            };
            return self;
        },
    } as never;
}

const ctx = { orgId: ORG_ID, userId: ACTOR } as never;
const invocation = { actionKey: "", entityType: "opportunity", entityId: "" } as never;

const PAYLOADS: Record<string, Record<string, unknown>> = {
    [PAYMENT_METHOD_ADD_ACTION_KEY]: { customer_id: CUSTOMER, rail: "card", payer_entity_id: "person-1" },
    [PAYMENT_METHOD_SET_DEFAULT_ACTION_KEY]: { payment_method_id: "m-1" },
    [PAYMENT_METHOD_REVOKE_ACTION_KEY]: { payment_method_id: "m-1" },
};

const CASES = [
    [PAYMENT_METHOD_ADD_ACTION_KEY, "Adding"],
    [PAYMENT_METHOD_SET_DEFAULT_ACTION_KEY, "Setting a default"],
    [PAYMENT_METHOD_REVOKE_ACTION_KEY, "Removing"],
] as const;

describe("payment method administration requires fin.write", () => {
    it.each(CASES)("%s is ineligible and refuses execution for a read-only financial role", async (key) => {
        const supabase = supabaseWith(["fin.read"]);

        const eligibility = await action(key).resolveEligibility({
            supabase, ctx, invocation, payload: PAYLOADS[key],
        } as never);
        expect(eligibility.eligible, "a read-only operator is not offered the control").toBe(false);
        expect(eligibility.blockers[0]?.code).toBe("payment_method_permission_required");

        /* Hiding a control is not authorization. The executor refuses the same call. */
        const executed = await action(key).execute({
            supabase, ctx, invocation, payload: PAYLOADS[key],
        } as never);
        expect(executed.ok, "direct invocation is refused server-side").toBe(false);
        if (executed.ok) return;
        expect(executed.status).toBe(403);
        expect(executed.error).toContain("fin.write");
    });

    it.each(CASES)("%s IS offered to an operator holding fin.write", async (key) => {
        const supabase = supabaseWith(["fin.read", "fin.write"]);
        const eligibility = await action(key).resolveEligibility({
            supabase, ctx, invocation, payload: PAYLOADS[key],
        } as never);
        expect(eligibility.eligible).toBe(true);
    });

    it.each(CASES)("%s refuses an unidentified caller", async (key) => {
        const supabase = supabaseWith(["fin.read", "fin.write"]);
        const executed = await action(key).execute({
            supabase,
            ctx: { orgId: ORG_ID, userId: null } as never,
            invocation,
            payload: PAYLOADS[key],
        } as never);
        expect(executed.ok).toBe(false);
        if (executed.ok) return;
        expect(executed.status).toBe(403);
    });

    /**
     * `fin.provider` is NOT what this work needs.
     *
     * An administrator who connected the provider but holds no `fin.write` cannot add a family's
     * card — which is the correct answer, and the proof that W2 did not simply widen W1's key.
     */
    it("holding only fin.provider does not permit adding a payment method", async () => {
        const supabase = supabaseWith(["fin.read", "fin.provider"]);
        const eligibility = await action(PAYMENT_METHOD_ADD_ACTION_KEY).resolveEligibility({
            supabase, ctx, invocation, payload: PAYLOADS[PAYMENT_METHOD_ADD_ACTION_KEY],
        } as never);
        expect(eligibility.eligible).toBe(false);
    });

    /**
     * AN ACCOUNT FROM ANOTHER TENANT IS NOT FOUND, not forbidden.
     *
     * The org comes from the session; the account is named in the payload and checked against it.
     * Without this check a permitted operator could attach a method to another organisation's family
     * simply by naming their customer id.
     */
    it("a permitted operator cannot add a method to an account outside their organization", async () => {
        const supabase = supabaseWith(["fin.read", "fin.write"]);

        const foreign = await action(PAYMENT_METHOD_ADD_ACTION_KEY).execute({
            supabase,
            ctx,
            invocation,
            payload: { customer_id: "cust-BELONGING-TO-SOMEONE-ELSE", rail: "card", payer_entity_id: "person-1" },
        } as never);
        expect(foreign.ok).toBe(false);
        if (foreign.ok) return;
        expect(foreign.status).toBe(404);
        expect(foreign.error).toMatch(/not in this organization/i);

        /*
         * THE CONTRAST IS THE PROOF. The account that IS in this organization gets PAST the gate —
         * it fails later, at the provider, because this hermetic runtime has no provider key. If
         * both ids were refused the same way, the case above would be measuring nothing.
         */
        const mine = await action(PAYMENT_METHOD_ADD_ACTION_KEY).execute({
            supabase,
            ctx,
            invocation,
            payload: { customer_id: CUSTOMER, rail: "card", payer_entity_id: "person-1" },
        } as never);
        expect(mine.ok).toBe(false);
        if (mine.ok) return;
        expect(mine.status).not.toBe(404);
        expect(mine.error).not.toMatch(/not in this organization/i);
    });

    /**
     * A PAYER IS NOT DEMANDED FROM THE BROWSER, AND IS NOT INVENTED EITHER.
     *
     * The Details panel names an account, not a person, so the payload gate must not require a payer
     * — an earlier draft did, and the mounted flow would have refused for want of a field nobody is
     * asked for. The server resolves the account's primary contact instead, and when it can resolve
     * NOBODY it refuses rather than attaching a method to an unnamed owner.
     */
    it("accepts an add with no payer named", () => {
        const validated = action(PAYMENT_METHOD_ADD_ACTION_KEY).validatePayload?.({
            customer_id: CUSTOMER,
            rail: "card",
        } as never);
        expect(validated?.ok).toBe(true);
    });

    it("refuses when no payer can be resolved for the account, rather than guessing one", async () => {
        const supabase = supabaseWith(["fin.read", "fin.write"]);
        const executed = await action(PAYMENT_METHOD_ADD_ACTION_KEY).execute({
            supabase,
            ctx,
            invocation,
            /* This mock models no household membership, so there is nobody to resolve. */
            payload: { customer_id: CUSTOMER, rail: "card" },
        } as never);
        expect(executed.ok).toBe(false);
        if (executed.ok) return;
        expect(executed.status).toBe(409);
        expect(executed.error).toMatch(/nobody who can be recorded as the payer/i);
    });

    /** The payload gate: a rail nobody supports never reaches the provider. */
    it("refuses a rail that is neither a card nor a bank account", () => {
        const validated = action(PAYMENT_METHOD_ADD_ACTION_KEY).validatePayload?.({
            customer_id: CUSTOMER,
            rail: "crypto",
            payer_entity_id: "person-1",
        } as never);
        expect(validated?.ok).toBe(false);
    });
});
