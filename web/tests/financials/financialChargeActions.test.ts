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
    financialAuthority,
    ORG_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

/**
 * The capabilities the charge lifecycle now requires, named once.
 *
 * Every scenario below is about the lifecycle, not about authority, so each one seeds a caller who
 * holds both. The scenarios that ARE about authority seed deliberately less, and they live in their
 * own describe block at the foot of this file.
 */
const FULL_CHARGE_AUTHORITY = ["fin.write", "fin.adjust"] as const;

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
            ...financialAuthority(FULL_CHARGE_AUTHORITY),
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
            ...financialAuthority(FULL_CHARGE_AUTHORITY),
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

/*
 * ── WHO MAY MOVE THIS MONEY ──────────────────────────────────────────────────────────────────
 *
 * These three actions used to enforce nothing at all. `/api/admin/actions/execute` resolves
 * ADMISSION through `requireAdminOrOps` — which reads neither a role nor a grant — so an
 * organization that had configured a role to "view Financials only" was saying something the server
 * did not honour: the same principal could still create a charge, post it, and reverse it.
 *
 * The assertions below are the whole of that repair, stated as behaviour rather than as a call:
 *
 *   - a caller WITHOUT the capability is refused with 403, and refused by the SERVER, not by the
 *     screen — `execute` is the entry point every surface and every direct API call shares;
 *   - the refusal is also visible BEFORE the operator acts, through `resolveEligibility`, so the
 *     product can grey a control it knows will be refused rather than discovering it on submit;
 *   - creating and posting take `fin.write`, correcting takes `fin.adjust`, and holding one does
 *     NOT confer the other. That separation is the point: everyone who can bill would otherwise be
 *     able to forgive, and nothing in the record would tell them apart.
 */
describe("the charge lifecycle refuses server-side without the capability", () => {
    const TEMPLATE = "tmpl-auth";
    const CUSTOMER_ID = "cust-auth";

    function storeWith(permissions: readonly string[]) {
        const store = createOperationalEnrollmentMockStore({
            ...financialAuthority(permissions),
            financial_charge_templates: [
                {
                    id: TEMPLATE,
                    org_id: ORG_ID,
                    template_key: "registration_fee",
                    status: "active",
                    charge_type: "fee",
                    charge_category: "registration",
                    currency_code: "USD",
                    amount_strategy: "fixed",
                    unit_amount_cents: 15_000,
                    occurs_on_strategy: "today",
                    billable_on_strategy: "immediate",
                    posting_review: "draft",
                    metadata: {},
                },
            ],
            charges: [
                {
                    id: "chg-auth",
                    org_id: ORG_ID,
                    billable_source_type: "customer",
                    billable_source_id: CUSTOMER_ID,
                    source_charge_id: null,
                    status: "posted",
                    currency_code: "USD",
                    amount_cents: 15_000,
                    charge_type: "fee",
                    charge_category: "registration",
                    metadata: {},
                },
            ],
        });
        return createOperationalEnrollmentMockSupabase(store);
    }

    const authCtx = { orgId: ORG_ID, userId: "user-1" } as never;
    const authInvocation = { entityType: "customer", entityId: CUSTOMER_ID } as never;

    it("refuses Add charge with 403 when the caller lacks fin.write", async () => {
        const result = await action(CHARGE_ADD_ACTION_KEY).execute({
            supabase: storeWith([]),
            ctx: authCtx,
            payload: { template_id: TEMPLATE, customer_id: CUSTOMER_ID, today: "2026-09-10" },
            invocation: authInvocation,
        } as never);
        expect(result.ok).toBe(false);
        expect((result as { status: number }).status).toBe(403);
        expect((result as { error: string }).error).toContain("fin.write");
    });

    it("refuses Post charge with 403 when the caller lacks fin.write", async () => {
        const result = await action(CHARGE_POST_ACTION_KEY).execute({
            supabase: storeWith([]),
            ctx: authCtx,
            payload: { charge_id: "chg-auth" },
            invocation: authInvocation,
        } as never);
        expect(result.ok).toBe(false);
        expect((result as { status: number }).status).toBe(403);
        expect((result as { error: string }).error).toContain("fin.write");
    });

    /*
     * THE SEPARATION, STATED AS THE CASE THAT WOULD HIDE IT.
     *
     * A biller holds `fin.write` and must still be refused a correction. If reversal had been filed
     * under the billing key this assertion would fail — which is exactly why it is written as a
     * caller who holds something rather than a caller who holds nothing.
     */
    it("refuses Reverse charge to a caller who may bill but may not adjust", async () => {
        const result = await action(CHARGE_REVERSE_ACTION_KEY).execute({
            supabase: storeWith(["fin.write"]),
            ctx: authCtx,
            payload: { charge_id: "chg-auth" },
            invocation: authInvocation,
        } as never);
        expect(result.ok).toBe(false);
        expect((result as { status: number }).status).toBe(403);
        expect((result as { error: string }).error).toContain("fin.adjust");
    });

    it("refuses Add charge to a caller who may adjust but may not bill", async () => {
        const result = await action(CHARGE_ADD_ACTION_KEY).execute({
            supabase: storeWith(["fin.adjust"]),
            ctx: authCtx,
            payload: { template_id: TEMPLATE, customer_id: CUSTOMER_ID, today: "2026-09-10" },
            invocation: authInvocation,
        } as never);
        expect(result.ok).toBe(false);
        expect((result as { status: number }).status).toBe(403);
    });

    /*
     * A FAILED GRANT READ IS NOT AN EMPTY ONE. An actor the membership table cannot identify is
     * unidentified, not unprivileged, and `resolveActorPermissionGrants` answers null. Every caller
     * fails CLOSED — including this one, where there is no membership row at all.
     */
    it("refuses when the caller cannot be identified at all", async () => {
        const store = createOperationalEnrollmentMockStore({});
        const result = await action(CHARGE_POST_ACTION_KEY).execute({
            supabase: createOperationalEnrollmentMockSupabase(store),
            ctx: { orgId: ORG_ID, userId: null } as never,
            payload: { charge_id: "chg-auth" },
            invocation: authInvocation,
        } as never);
        expect(result.ok).toBe(false);
        expect((result as { status: number }).status).toBe(403);
    });

    it("says so before the operator acts, not only on submit", async () => {
        const eligibility = await action(CHARGE_POST_ACTION_KEY).resolveEligibility({
            supabase: storeWith([]),
            ctx: authCtx,
            payload: { charge_id: "chg-auth" },
            invocation: authInvocation,
        } as never);
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.blockers.map((b) => b.code)).toContain("charge_permission_required");
    });

    it("permits the whole lifecycle to a caller who holds both", async () => {
        const supabase = storeWith(["fin.write", "fin.adjust"]);
        const posted = await action(CHARGE_POST_ACTION_KEY).execute({
            supabase,
            ctx: authCtx,
            payload: { charge_id: "chg-auth" },
            invocation: authInvocation,
        } as never);
        expect(posted.ok).toBe(true);
        const reversed = await action(CHARGE_REVERSE_ACTION_KEY).execute({
            supabase,
            ctx: authCtx,
            payload: { charge_id: "chg-auth" },
            invocation: authInvocation,
        } as never);
        expect(reversed.ok).toBe(true);
    });
});
