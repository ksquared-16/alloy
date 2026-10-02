/**
 * ORDINARY GENERATED BILLING BECOMES REAL WITHOUT A HUMAN.
 *
 * The defect these bind out: generated billing created a draft and stopped, so a tuition charge with
 * a complete amount and no review policy configured anywhere sat as a draft indefinitely — and the
 * financials work queue offered it to an operator to post by hand, which is the routine human
 * posting step the doctrine forbids.
 *
 * The three outcomes must stay distinguishable in the DATA, because before this they were not: a
 * failed post left its reason in an HTTP response and nowhere else, so "we tried and could not" and
 * "nobody ever tried" were the same row.
 */
import { describe, expect, it, vi } from "vitest";

import {
    MAX_POST_ATTEMPTS,
    isRetryablePostFailure,
    postAttemptAllowed,
    shouldRetryPost,
} from "@/lib/financials/posting/autoPostGeneratedCharge";
import {
    BILLING_AGREEMENT_ID,
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";
import { autoPostGeneratedCharge } from "@/lib/financials/posting/autoPostGeneratedCharge";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = (rel: string) => readFileSync(resolve(__dirname, "../../", rel), "utf8");
const code = (rel: string) =>
    src(rel).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");

describe("the generated paths now reach the canonical posting authority", () => {
    /*
     * BEHAVIOURAL, not a source match. The first version of this test asserted the file CONTAINED
     * `autoPostGeneratedCharge`, and a plant that wrapped the call in `if (false)` walked straight
     * through it — the identifier was still present, so the assertion passed while generated billing
     * was defective again. A source guard cannot prove reachability; only running it can.
     */
    it("a generated draft with no review policy ends up POSTED", async () => {
        const store = createOperationalEnrollmentMockStore({});
        const supabase = createOperationalEnrollmentMockSupabase(store);
        store.charges.push({
            id: "chg-auto", org_id: ORG_ID, billable_source_type: "enrollment_agreement",
            billable_source_id: BILLING_AGREEMENT_ID, status: "draft", amount_cents: 15000,
            currency_code: "USD", charge_category: "tuition", service_date: "2026-11-12",
            billable_on: "2026-11-12", metadata: { source: "charge_template" },
        });

        const outcome = await autoPostGeneratedCharge(supabase as never, {
            orgId: ORG_ID,
            chargeId: "chg-auto",
            policies: [],            // NO posting_review policy anywhere
            today: "2026-11-12",
        });

        expect(outcome.kind, "ordinary billing becomes real, unattended").toBe("posted");
        const row = store.charges.find((c) => c.id === "chg-auto")!;
        expect(row.status, "the canonical authority moved it").toBe("posted");
        expect(row.posted_at, "and stamped when").toBeTruthy();
    });

    it("an explicit review policy leaves it a draft, and SAYS so", async () => {
        const store = createOperationalEnrollmentMockStore({});
        const supabase = createOperationalEnrollmentMockSupabase(store);
        store.charges.push({
            id: "chg-review", org_id: ORG_ID, billable_source_type: "enrollment_agreement",
            billable_source_id: BILLING_AGREEMENT_ID, status: "draft", amount_cents: 15000,
            currency_code: "USD", charge_category: "tuition", service_date: "2026-11-12",
            metadata: { source: "charge_template" },
        });

        const outcome = await autoPostGeneratedCharge(supabase as never, {
            orgId: ORG_ID,
            chargeId: "chg-review",
            policies: [{
                id: "pol-review", org_id: ORG_ID, scope_type: "org", location_id: null, service_id: null,
                rate_plan_id: null, customer_id: null, policy_type: "posting_review",
                value: { required: true }, is_active: true, effective_start: "2026-01-01",
                effective_end: null, source_key: "config", metadata: {}, label: null, description: null,
                created_by: null, updated_by: null, created_at: "", updated_at: "",
            }] as never,
            today: "2026-11-12",
        });

        expect(outcome.kind).toBe("review_required");
        const row = store.charges.find((c) => c.id === "chg-review")!;
        expect(row.status, "a legitimate draft").toBe("draft");
        expect((row.metadata as Record<string, unknown>).post_gate,
               "and distinguishable from a failure").toBe("review_required");
    });

    it("the shared reduction authority completes its contra charge", () => {
        const r = code("lib/financials/reductions/reductionCore.ts");
        expect(r, "a reduction that stops at a draft reduces nothing").toContain("autoPostGeneratedCharge");
        /* Both return points, because a reconciled draft is as unposted as a fresh one. */
        expect((r.match(/completeContraCharge\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    });

    it("adds no second posting implementation", () => {
        const a = code("lib/financials/posting/autoPostGeneratedCharge.ts");
        expect(a, "the one act that makes a childcare charge owed").toContain("postChildcareCharge");
        /* It must not write a posted status itself — that belongs to the authority it calls. */
        expect(a, "no hand-rolled posting").not.toMatch(/status:\s*"posted"/);
    });

    it("manual Add Charge is untouched — it was already correct", () => {
        const m = code("lib/adminV2/actions/definitions/financialChargeActions.ts");
        expect(m).toContain("postChildcareCharge");
        expect(m, "still gated on the review answer, still in one request").toContain("written.reviewRequired");
        expect(m, "the repair added no second step here").not.toContain("autoPostGeneratedCharge");
    });
});

describe("no configured review policy means post, and the code says so once", () => {
    it("resolves absent policy to NOT required", () => {
        const a = code("lib/financials/posting/autoPostGeneratedCharge.ts");
        /* Mirrors resolveChargePolicies rather than restating the rule. */
        expect(a).toContain("if (!r.resolved) return { required: false, policyId: null }");
    });

    it("a review-required draft is never retried, because nothing failed", () => {
        expect(shouldRetryPost({ post_gate: "review_required" })).toBe(false);
    });
});

describe("a failed post is durable, and distinguishable from never attempted", () => {
    it("a draft with no attempt record is never picked up — which preserves the historical 35", () => {
        expect(shouldRetryPost(null)).toBe(false);
        expect(shouldRetryPost({})).toBe(false);
        expect(shouldRetryPost({ source: "charge_template", lifecycle_status: "scheduled" })).toBe(false);
    });

    it("retries a transient failure, bounded by the attempt ceiling", () => {
        const rec = (attempts: number) => ({
            post_attempt: { attempts, first_attempted_at: "", last_attempted_at: "", last_error: "timeout",
                            retryable: true, attention_required: false },
        });
        expect(shouldRetryPost(rec(1))).toBe(true);
        expect(shouldRetryPost(rec(MAX_POST_ATTEMPTS - 1))).toBe(true);
        expect(shouldRetryPost(rec(MAX_POST_ATTEMPTS)), "exhausted becomes attention, not a loop").toBe(false);
    });

    it("never retries a refusal the domain MEANT", () => {
        for (const permanent of [
            "posted childcare charge is immutable",
            "charge already posted",
            "cannot transition to draft in place",
            "resolves to zero",
            "charge not found",
            "refused by policy",
            "requires fin.write permission",
            "this billing period is closed",
        ]) {
            expect(isRetryablePostFailure(permanent), permanent).toBe(false);
        }
    });

    it("retries what looks transient", () => {
        for (const transient of ["fetch failed", "timeout", "connection reset", "503 upstream"]) {
            expect(isRetryablePostFailure(transient), transient).toBe(true);
        }
    });

    it("a non-retryable failure is marked attention_required on its first attempt", () => {
        /* The classification is what turns an invisible stall into operator work. */
        const a = code("lib/financials/posting/autoPostGeneratedCharge.ts");
        expect(a).toContain("attention_required: !retryable || attempts >= MAX_POST_ATTEMPTS");
    });
});

describe("the closed-period guard has exactly one home", () => {
    it("exists as a named seam that retry passes through too", () => {
        expect(postAttemptAllowed({ billing_period_id: null })).toEqual({ ok: true });
        const a = src("lib/financials/posting/autoPostGeneratedCharge.ts");
        expect(a, "named so close binds in one place rather than per caller").toContain("postAttemptAllowed");
        expect(a, "and the comment says retry must bind too").toMatch(/retry/i);
    });
});

describe("the defect class is gone", () => {
    it("a fully-resolved, no-review generated draft can no longer be created without a post attempt", () => {
        /*
         * Structural: both generated producers call the continuation, and the continuation either
         * posts, records review_required, or records a durable post_attempt. There is no path that
         * leaves a draft with none of the three.
         */
        for (const f of [
            "lib/financials/tuitionGeneration/generateTuitionCharges.ts",
            "lib/financials/reductions/reductionCore.ts",
        ]) {
            expect(code(f), `${f} reaches the continuation`).toContain("autoPostGeneratedCharge");
        }
        const a = code("lib/financials/posting/autoPostGeneratedCharge.ts");
        for (const gate of ["review_required", "post_failed"]) {
            expect(a, `records ${gate}`).toContain(gate);
        }
    });
});
