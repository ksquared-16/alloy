/**
 * ONE POLICY IDENTITY, CARRIED FROM CONFIGURATION TO THE LEDGER.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────
 *
 * A discount that is configured in one place, forecast in a second and posted from a third has
 * three chances to mean different things. The rule this certifies is that there is only one
 * identity in play — `commercial_policies.id` — and that an exception, the forecast, and the
 * posted reduction all name THAT, so an operator comparing the Assignment surface to the ledger is
 * comparing two readings of one fact rather than two opinions.
 *
 * The projection is exercised END TO END here, over a faked database, rather than by asserting
 * that it calls something: a test that only proves the call still passes when the call stops
 * meaning anything.
 */
import { describe, expect, it } from "vitest";

import { forecastAssignmentReductions } from "@/lib/financials/reductions/forecastAssignmentReductions";
import { resolveFinancialReductions } from "@/lib/financials/reductions/resolveFinancialReductions";

const ORG = "org-1";
const POLICY_ID = "policy-sibling-1";
const OCM = "ocm-1";
const MEMBER = "member-2";
const AGREEMENT = "agreement-2";

/** Rows the three real readers ask for. Anything else answers empty, as a real org would. */
function fakeDb(rows: Record<string, Array<Record<string, unknown>>>) {
    return {
        from(table: string) {
            const data = rows[table] ?? [];
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.select = self;
            chain.eq = self;
            chain.in = self;
            chain.is = self;
            chain.not = self;
            chain.order = self;
            chain.gte = self;
            chain.lte = self;
            chain.then = (resolve: (v: unknown) => unknown) => resolve({ data, error: null });
            return chain;
        },
    } as never;
}

const SIBLING_POLICY = {
    id: POLICY_ID,
    scope_type: "org",
    policy_type: "sibling_discount",
    /* The authored shape, exactly as `commercial_policies.value` carries it. */
    value: { label: "Sibling discount", basis: "percentage", value: 10, min_siblings: 2, applies_to: "tuition" },
    effective_start: "2026-01-01",
    effective_end: null,
    is_active: true,
};

/* Two concurrently enrolled children, so the second child's sibling rank is genuinely 2. */
const AGREEMENTS = [
    { id: "agreement-1", customer_member_id: "member-1", status: "active", start_date: "2026-01-01", end_date: null },
    { id: AGREEMENT, customer_member_id: MEMBER, status: "active", start_date: "2026-02-01", end_date: null },
];

const forecastArgs = {
    orgId: ORG,
    opportunityCustomerMemberId: OCM,
    customerId: "customer-1",
    customerMemberId: MEMBER,
    enrollmentAgreementId: AGREEMENT,
    grossCents: 100_000,
    currencyCode: "USD",
    periodKey: "2026-10",
    categoryKey: "tuition",
};

const liveException = (over: Record<string, unknown> = {}) => ({
    id: "exception-1",
    org_id: ORG,
    policy_id: POLICY_ID,
    opportunity_customer_member_id: OCM,
    customer_member_id: MEMBER,
    effective_start: "2026-09-01",
    effective_end: null,
    reason: "Board waived the sibling discount for this family",
    created_by: "user-1",
    created_at: "2026-09-01T00:00:00Z",
    supersedes_exception_id: null,
    superseded_at: null,
    ...over,
});

describe("configuration → forecast", () => {
    it("expects the configured policy, under the identity the configuration gave it", async () => {
        const forecast = await forecastAssignmentReductions(
            fakeDb({ commercial_policies: [SIBLING_POLICY], child_enrollment_agreements: AGREEMENTS }),
            forecastArgs,
        );
        expect(forecast.outcomes).toHaveLength(1);
        const outcome = forecast.outcomes[0]!;
        expect(outcome.kind).toBe("expected");
        if (outcome.kind !== "expected") return;
        /* THE IDENTITY: not the label, not the kind — the configured row's own id. */
        expect(outcome.policyId).toBe(POLICY_ID);
        expect(outcome.amountCents).toBe(-10_000);
        expect(forecast.netCents).toBe(90_000);
    });

    /*
     * THE EXCEPTION CHANGES WHAT THE FORECAST SAYS, AND SAYS WHY. "No policy configured" would
     * send the operator to look for configuration that exists and is correct.
     */
    it("reports an excepted policy as excluded, not as missing configuration", async () => {
        const forecast = await forecastAssignmentReductions(
            fakeDb({
                commercial_policies: [SIBLING_POLICY],
                child_enrollment_agreements: AGREEMENTS,
                commercial_policy_exceptions: [liveException()],
            }),
            forecastArgs,
        );
        expect(forecast.outcomes).toEqual([{ kind: "not_expected", reason: "excluded_by_exception" }]);
        expect(forecast.totalCents).toBe(0);
        expect(forecast.netCents).toBe(100_000);
    });

    it("scopes the exception to the policy it names", async () => {
        const forecast = await forecastAssignmentReductions(
            fakeDb({
                commercial_policies: [SIBLING_POLICY],
                child_enrollment_agreements: AGREEMENTS,
                commercial_policy_exceptions: [liveException({ policy_id: "policy-someone-else" })],
            }),
            forecastArgs,
        );
        expect(forecast.outcomes[0]!.kind, "another policy's exception excludes nothing here").toBe("expected");
    });

    it("ignores an exception that has already ended", async () => {
        const forecast = await forecastAssignmentReductions(
            fakeDb({
                commercial_policies: [SIBLING_POLICY],
                child_enrollment_agreements: AGREEMENTS,
                commercial_policy_exceptions: [liveException({ effective_end: "2026-09-30" })],
            }),
            forecastArgs,
        );
        expect(forecast.outcomes[0]!.kind, "October is after the exception ended").toBe("expected");
    });

    it("ignores a superseded exception however its dates read", async () => {
        const forecast = await forecastAssignmentReductions(
            fakeDb({
                commercial_policies: [SIBLING_POLICY],
                child_enrollment_agreements: AGREEMENTS,
                commercial_policy_exceptions: [liveException({ superseded_at: "2026-09-20T00:00:00Z" })],
            }),
            forecastArgs,
        );
        expect(forecast.outcomes[0]!.kind).toBe("expected");
    });

    /*
     * AN ASSIGNMENT WITH NO COMMERCIAL THROUGH-LINE READS NO EXCEPTIONS. It must not fall back to
     * some other relationship's exclusions, so the absent identity means "none", never "any".
     */
    it("reads no exclusions when there is no relationship to scope them by", async () => {
        const forecast = await forecastAssignmentReductions(
            fakeDb({
                commercial_policies: [SIBLING_POLICY],
                child_enrollment_agreements: AGREEMENTS,
                commercial_policy_exceptions: [liveException()],
            }),
            { ...forecastArgs, opportunityCustomerMemberId: null },
        );
        expect(forecast.outcomes[0]!.kind).toBe("expected");
    });
});

describe("forecast → ledger", () => {
    /*
     * The projection and the application path are the SAME function over the same inputs. This
     * runs the resolver directly with what the forecast reasoned about and requires the identical
     * decision — if the two ever diverge, it is because someone added a second engine, and this is
     * where that shows up.
     */
    it("reaches the decision the application path would reach from the same facts", async () => {
        const db = fakeDb({
            commercial_policies: [SIBLING_POLICY],
            child_enrollment_agreements: AGREEMENTS,
            commercial_policy_exceptions: [liveException()],
        });
        const forecast = await forecastAssignmentReductions(db, forecastArgs);

        const applied = resolveFinancialReductions({
            gross: {
                chargeId: "charge-real-1",
                customerMemberId: MEMBER,
                enrollmentAgreementId: AGREEMENT,
                amountCents: 100_000,
                currencyCode: "USD",
                categoryKey: "tuition",
                periodKey: "2026-10",
            },
            policies: [{ id: POLICY_ID, kind: "sibling_discount", params: SIBLING_POLICY.value, label: "Sibling discount" }],
            facts: { siblingRank: 2, siblingCount: 2, employeeHousehold: false },
            excludedPolicyIds: [POLICY_ID],
        });

        expect(applied.kind).toBe("not_eligible");
        if (applied.kind !== "not_eligible") return;
        /* The SAME reason word, so the surface and the ledger cannot describe this differently. */
        expect(applied.reason).toBe("excluded_by_exception");
        expect(forecast.outcomes[0]).toEqual({ kind: "not_expected", reason: applied.reason });
    });

    /* Without the exclusion, both sides produce the same money against the same policy id. */
    it("agrees on the amount and the policy when nothing is excepted", async () => {
        const forecast = await forecastAssignmentReductions(
            fakeDb({ commercial_policies: [SIBLING_POLICY], child_enrollment_agreements: AGREEMENTS }),
            forecastArgs,
        );
        const applied = resolveFinancialReductions({
            gross: {
                chargeId: "charge-real-1",
                customerMemberId: MEMBER,
                enrollmentAgreementId: AGREEMENT,
                amountCents: 100_000,
                currencyCode: "USD",
                categoryKey: "tuition",
                periodKey: "2026-10",
            },
            policies: [{ id: POLICY_ID, kind: "sibling_discount", params: SIBLING_POLICY.value, label: "Sibling discount" }],
            facts: { siblingRank: 2, siblingCount: 2, employeeHousehold: false },
            excludedPolicyIds: [],
        });
        expect(applied.kind).toBe("applied");
        if (applied.kind !== "applied") return;
        const outcome = forecast.outcomes[0]!;
        if (outcome.kind !== "expected") throw new Error("the forecast expected nothing");
        expect(outcome.policyId).toBe(applied.reductions[0]!.policyId);
        expect(outcome.amountCents).toBe(applied.reductions[0]!.amountCents);
        expect(forecast.totalCents).toBe(applied.totalCents);
    });
});

describe("the ledger writes the identity it was given", () => {
    /*
     * A source lock, and a deliberate one: the writer is a database insert, so the thing worth
     * holding still is that it takes `policy_id` from the resolver's decision rather than from
     * anything the caller sent. Comments are stripped before matching, so this cannot be satisfied
     * by prose describing the rule.
     */
    it("takes policy_id from the decision, not from the request", async () => {
        const { readFileSync } = await import("node:fs");
        const src = readFileSync("lib/financials/reductions/applyFinancialReductions.ts", "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|[^:])\/\/.*$/gm, "$1");
        expect(src).toMatch(/policy_id:\s*r\.policyId/);
        /* And the exclusions it applies were read by the one authority, not re-derived. */
        expect(src).toContain("readExcludedPolicyIds");
        expect(src).toContain("excludedPolicyIds");
    });
});

describe("the table is not in every environment yet", () => {
    /**
     * The migration is committed but unapplied on the deployed database, which takes migrations
     * from merged lineage only. Until promotion, every read of this table there answers "relation
     * does not exist".
     *
     * Absorbing that one error keeps the discount forecast working on a runtime where no exception
     * can exist. Absorbing ANY error would be the `resolveChargeDetail` defect again: a bare catch
     * turned a broken query into "not posted to a period yet" on every charge in the product.
     */
    function failingDb(error: { code?: string; message: string }) {
        return {
            from(table: string) {
                const chain: Record<string, unknown> = {};
                const self = () => chain;
                chain.select = self; chain.eq = self; chain.in = self; chain.is = self;
                chain.not = self; chain.order = self; chain.gte = self; chain.lte = self;
                chain.then = (resolve: (v: unknown) => unknown) =>
                    resolve(
                        table === "commercial_policy_exceptions"
                            ? { data: null, error }
                            : {
                                  data: table === "commercial_policies" ? [SIBLING_POLICY] : table === "child_enrollment_agreements" ? AGREEMENTS : [],
                                  error: null,
                              },
                    );
                return chain;
            },
        } as never;
    }

    it.each([
        ["42P01", 'relation "commercial_policy_exceptions" does not exist'],
        ["PGRST205", "Could not find the table 'public.commercial_policy_exceptions' in the schema cache"],
    ])("still forecasts the discount when the table is absent (%s)", async (code, message) => {
        const forecast = await forecastAssignmentReductions(failingDb({ code, message }), forecastArgs);
        expect(forecast.outcomes[0]!.kind, "the section must not go dark where no exception can exist").toBe("expected");
    });

    /*
     * ANY OTHER FAILURE STILL FAILS CLOSED. "No exceptions" read off a broken query would silently
     * grant a discount somebody deliberately withheld — the exact harm this feature exists to stop.
     */
    it.each([
        ["42501", "permission denied for table commercial_policy_exceptions"],
        ["57014", "canceling statement due to statement timeout"],
        [undefined, "connection terminated unexpectedly"],
    ])("refuses to guess when the read fails for any other reason (%s)", async (code, message) => {
        await expect(forecastAssignmentReductions(failingDb({ code, message }), forecastArgs)).rejects.toThrow(
            /could not be read/,
        );
    });
});
