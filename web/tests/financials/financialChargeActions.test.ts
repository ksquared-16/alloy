import { describe, expect, it } from "vitest";

import {
    CHARGE_ADD_ACTION_KEY,
    CHARGE_POST_ACTION_KEY,
    CHARGE_REVERSE_ACTION_KEY,
    financialChargeActions,
} from "@/lib/adminV2/actions/definitions/financialChargeActions";
import { REGISTERED_ACTION_CAPABILITY_KEYS } from "@/lib/platform/commands/capabilityRegistry";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

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

/*
 * ── THE MISSING-TARGET HANDOFF ──
 *
 * `resolveChargeSubject` has always known what a charge is written against: the named child's
 * agreement when there is one, the HOUSEHOLD when there is not, because a pre-enrolment fee is the
 * family's. What it could not do was answer a question nobody asked it.
 *
 * The Financials card derived its target from `vm.subjects`, which derives from
 * `child_enrollment_agreements`. A family with no agreement therefore had no target, and both the
 * card's preview and its commit opened with a bare `return` — a visible, enabled "Add charge" that
 * issued no request at all. Certified against the representative tenant: not one call to
 * `/api/admin/actions/execute`, and `charges` stayed at 0.
 *
 * The correction is that the invocation now travels at the grain the panel HAS. These tests hold the
 * seam from the action's side: an opportunity is not a child, a household is a real subject, and
 * neither of those loosens what happens when there is genuinely nothing to charge.
 */
describe("charge.add — the subject the resolver is handed", () => {
    const TODAY = "2026-06-29";
    const TEMPLATE_ID = "tpl-1";
    const CUSTOMER = "cust-1";
    const CHILD = "cm-1";
    const AGREEMENT = "agr-1";
    const OPPORTUNITY = "opp-1";

    function template() {
        return {
            id: TEMPLATE_ID,
            org_id: ORG_ID,
            service_id: "svc-1",
            template_key: "registration_fee",
            label: "Registration Fee",
            charge_category: "fee",
            trigger_type: "manual",
            amount_strategy: "fixed",
            amount_cents: 15000,
            currency_code: "USD",
            occurs_on_strategy: "now",
            billable_on_strategy: "immediate",
            billable_offset_days: null,
            default_gl_mapping_key: "fee_revenue",
            default_responsibility_key: "household",
            review_required: false,
            is_active: true,
            effective_start: "2026-01-01",
            effective_end: null,
            metadata: {},
        };
    }

    /** `enrolled: false` is the pre-enrolment family — a household, children, and no agreement. */
    function setup(opts: { enrolled: boolean }) {
        const store = createOperationalEnrollmentMockStore({
            financial_charge_templates: [template()],
            child_enrollment_agreements: opts.enrolled
                ? [
                      {
                          id: AGREEMENT,
                          org_id: ORG_ID,
                          customer_member_id: CHILD,
                          customer_id: CUSTOMER,
                          status: "active",
                          created_at: "2026-01-02T00:00:00.000Z",
                      },
                  ]
                : [],
        });
        return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
    }

    const ctx = { orgId: ORG_ID, userId: "user-1" } as never;
    const add = () => action(CHARGE_ADD_ACTION_KEY);

    function invoke(entityType: string, entityId: string) {
        return { entityType, entityId } as never;
    }

    it("still writes an enrolled child's charge against their own agreement", async () => {
        const { store, supabase } = setup({ enrolled: true });
        const payload = { template_id: TEMPLATE_ID, customer_member_id: CHILD, customer_id: CUSTOMER, today: TODAY };
        const eligibility = await add().resolveEligibility!({
            supabase, ctx, payload, invocation: invoke("child", CHILD),
        } as never);
        expect(eligibility.eligible).toBe(true);

        const result = await add().execute({
            supabase, ctx, payload, invocation: invoke("child", CHILD),
        } as never);
        expect(result.ok).toBe(true);
        expect(store.charges).toHaveLength(1);
        expect(store.charges[0]).toMatchObject({
            billable_source_type: "enrollment_agreement",
            billable_source_id: AGREEMENT,
        });
    });

    it("still reads a child-grain entity id as the child when the payload names none", async () => {
        const { store, supabase } = setup({ enrolled: true });
        const result = await add().execute({
            supabase,
            ctx,
            payload: { template_id: TEMPLATE_ID, customer_id: CUSTOMER, today: TODAY },
            invocation: invoke("child", CHILD),
        } as never);
        expect(result.ok).toBe(true);
        expect(store.charges[0]).toMatchObject({ billable_source_id: AGREEMENT });
    });

    /*
     * THE CASE THAT COULD NOT BE REACHED. A New Leads family: a household, two children, no
     * agreement — so the card has no child to name and invokes at the grain it has.
     */
    it("writes a pre-enrolment household's charge against the customer, from an opportunity invocation", async () => {
        const { store, supabase } = setup({ enrolled: false });
        const payload = { template_id: TEMPLATE_ID, customer_id: CUSTOMER, today: TODAY };
        const eligibility = await add().resolveEligibility!({
            supabase, ctx, payload, invocation: invoke("opportunity", OPPORTUNITY),
        } as never);
        expect(eligibility.eligible).toBe(true);
        expect(eligibility.blockers).toEqual([]);

        const result = await add().execute({
            supabase, ctx, payload, invocation: invoke("opportunity", OPPORTUNITY),
        } as never);
        expect(result.ok).toBe(true);
        expect(store.charges).toHaveLength(1);
        // The HOUSEHOLD is the source. The opportunity is how the operator got here, never what the
        // money is attributed to, and no sibling is invented to carry a family expense.
        expect(store.charges[0]).toMatchObject({
            billable_source_type: "customer",
            billable_source_id: CUSTOMER,
        });
    });

    /*
     * An opportunity id must never be read as a `customer_member_id`. Before this it was, and the
     * resolver reached the household by accident — returning no agreement because an opportunity id
     * matches none, rather than because it had been told there was no child.
     */
    it("does not adopt an opportunity id as the child, even when an agreement exists", async () => {
        const { store, supabase } = setup({ enrolled: true });
        const result = await add().execute({
            supabase,
            ctx,
            payload: { template_id: TEMPLATE_ID, customer_id: CUSTOMER, today: TODAY },
            invocation: invoke("opportunity", OPPORTUNITY),
        } as never);
        expect(result.ok).toBe(true);
        expect(store.charges[0]).toMatchObject({ billable_source_type: "customer" });
        expect(result.ok === true && (result.result as { entityId?: string }).entityId).toBe(OPPORTUNITY);
    });

    /*
     * THE DISCRIMINATING CASE. Ids do not collide across grains in production, so this one is built
     * to collide on purpose: an agreement whose child id is spelled the same as the opportunity.
     * Under the old rule the opportunity id was adopted as the child and MATCHED that agreement, so
     * a family expense would have been written onto a child's ledger. The grain is what decides,
     * not the shape of the string.
     */
    it("never matches an agreement by an opportunity's id", async () => {
        const store = createOperationalEnrollmentMockStore({
            financial_charge_templates: [template()],
            child_enrollment_agreements: [
                {
                    id: AGREEMENT,
                    org_id: ORG_ID,
                    customer_member_id: OPPORTUNITY,
                    customer_id: CUSTOMER,
                    status: "active",
                    created_at: "2026-01-02T00:00:00.000Z",
                },
            ],
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const result = await add().execute({
            supabase,
            ctx,
            payload: { template_id: TEMPLATE_ID, customer_id: CUSTOMER, today: TODAY },
            invocation: invoke("opportunity", OPPORTUNITY),
        } as never);
        expect(result.ok).toBe(true);
        expect(store.charges[0]).toMatchObject({
            billable_source_type: "customer",
            billable_source_id: CUSTOMER,
        });
    });

    /*
     * FAILING CLOSED IS STILL THE ANSWER when there is genuinely nothing to charge. The card's own
     * unreachable state says the same thing rather than doing nothing.
     */
    it("refuses when there is neither an agreement nor a household", async () => {
        const { store, supabase } = setup({ enrolled: false });
        const payload = { template_id: TEMPLATE_ID, today: TODAY };
        const eligibility = await add().resolveEligibility!({
            supabase, ctx, payload, invocation: invoke("opportunity", OPPORTUNITY),
        } as never);
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.blockers[0]?.code).toBe("missing_billable_subject");

        const result = await add().execute({
            supabase, ctx, payload, invocation: invoke("opportunity", OPPORTUNITY),
        } as never);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.status).toBe(409);
        expect(store.charges).toHaveLength(0);
    });

    /*
     * ONE CONFIRMATION IS ONE CHARGE. The resolution key already made a repeated commit idempotent;
     * opening the household path must not create a second way in that bypasses it.
     */
    it("creates exactly one charge when the same household commit is replayed", async () => {
        const { store, supabase } = setup({ enrolled: false });
        const args = {
            supabase,
            ctx,
            payload: { template_id: TEMPLATE_ID, customer_id: CUSTOMER, today: TODAY },
            invocation: invoke("opportunity", OPPORTUNITY),
        } as never;
        const first = await add().execute(args);
        const second = await add().execute(args);
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(store.charges).toHaveLength(1);
        const idOf = (r: typeof first) =>
            r.ok === true ? (r.result as { affectedId?: string }).affectedId : null;
        expect(idOf(second)).toBe(idOf(first));
    });
});
