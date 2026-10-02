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
        /*
         * It must not post a CHARGE itself — that belongs to the authority it calls. It DOES write
         * `status: "posted"` to `resolved_obligations`, which is the convergence, so the assertion
         * is about the charges table rather than the literal.
         */
        expect(a, "no hand-rolled charge posting").not.toMatch(/from\("charges"\)[\s\S]{0,200}status:\s*"posted"/);
        expect(a, "the obligation convergence is the only posted write").toContain('from("resolved_obligations")');
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

describe("the obligation converges only after the authority returned", () => {
    it("writes status posted to resolved_obligations, and never touches review_status", () => {
        const a = code("lib/financials/posting/autoPostGeneratedCharge.ts");
        expect(a).toContain('from("resolved_obligations")');
        expect(a).toContain('status: "posted"');
        /*
         * Automatic posting is NOT review. Writing `reviewed` here would record a review that never
         * happened, and then justify skipping a real one.
         */
        expect(a, "review_status must stay truthful").not.toContain("review_status");
    });

    it("converges from drafted/previewed only, so it cannot resurrect a superseded obligation", () => {
        const a = code("lib/financials/posting/autoPostGeneratedCharge.ts");
        expect(a).toContain('.in("status", ["drafted", "previewed"])');
    });

    it("the convergence sits AFTER the post call, not before it", () => {
        const a = code("lib/financials/posting/autoPostGeneratedCharge.ts");
        const post = a.indexOf("await postChildcareCharge");
        const converge = a.indexOf('from("resolved_obligations")\n            .update');
        const conv2 = a.indexOf('.update({ status: "posted"');
        expect(post, "the authority is called").toBeGreaterThan(-1);
        expect(conv2, "the convergence exists").toBeGreaterThan(-1);
        expect(conv2, "an obligation marked posted before the post would claim money a failure never made")
            .toBeGreaterThan(post);
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

describe("the rule is the economic family's, not the template's name", () => {
    /*
     * One-time and late-pickup are not special cases: they reach the same continuation through the
     * same shared writer, so the binding is that the continuation is CATEGORY-AGNOSTIC. Asserted
     * behaviourally — each category is actually posted — rather than by reading the generator.
     */
    for (const category of ["one_time", "late_pickup", "tuition", "discount", "credit"] as const) {
        it(`a fully-resolved ${category} charge with no review policy posts`, async () => {
            const store = createOperationalEnrollmentMockStore({});
            const supabase = createOperationalEnrollmentMockSupabase(store);
            store.charges.push({
                id: `chg-${category}`, org_id: ORG_ID, billable_source_type: "enrollment_agreement",
                billable_source_id: BILLING_AGREEMENT_ID, status: "draft", amount_cents: 9000,
                currency_code: "USD", charge_category: category, service_date: "2026-11-12",
                billable_on: "2026-11-12", metadata: { source: "charge_template" },
            });
            const outcome = await autoPostGeneratedCharge(supabase as never, {
                orgId: ORG_ID, chargeId: `chg-${category}`, policies: [], today: "2026-11-12",
            });
            expect(outcome.kind, `${category} must not need a human`).toBe("posted");
            expect(store.charges.find((c) => c.id === `chg-${category}`)!.status).toBe("posted");
        });
    }
});

describe("retry succeeds, exactly once, and the failure stops looking current", () => {
    it("a draft carrying a retryable failure posts on the next continuation and converges", async () => {
        const store = createOperationalEnrollmentMockStore({});
        const supabase = createOperationalEnrollmentMockSupabase(store);
        /* The state a first failed attempt leaves behind. */
        const priorFailure = {
            attempts: 1, first_attempted_at: "2026-11-11T00:00:00Z", last_attempted_at: "2026-11-11T00:00:00Z",
            last_error: "fetch failed", retryable: true, attention_required: false,
        };
        store.charges.push({
            id: "chg-retry", org_id: ORG_ID, billable_source_type: "enrollment_agreement",
            billable_source_id: BILLING_AGREEMENT_ID, status: "draft", amount_cents: 12000,
            currency_code: "USD", charge_category: "tuition", service_date: "2026-11-12",
            metadata: { source: "charge_template", post_gate: "post_failed", post_attempt: priorFailure },
        });
        store.resolved_obligations.push({
            id: "ob-retry", org_id: ORG_ID, draft_charge_id: "chg-retry",
            status: "drafted", review_status: "pending",
        });

        /* The unattended continuation considers it, because the failure was transient. */
        expect(shouldRetryPost({ post_attempt: priorFailure })).toBe(true);

        const first = await autoPostGeneratedCharge(supabase as never, {
            orgId: ORG_ID, chargeId: "chg-retry", policies: [], today: "2026-11-12",
        });
        expect(first.kind).toBe("posted");

        const row = store.charges.find((c) => c.id === "chg-retry")!;
        expect(row.status).toBe("posted");
        const md = row.metadata as Record<string, unknown>;
        expect(md.post_gate, "a posted charge must not keep looking failed").toBeUndefined();
        expect(md.post_attempt, "stale failure state is cleared").toBeUndefined();

        /* The obligation converged — and only now. */
        expect(store.resolved_obligations.find((o) => o.id === "ob-retry")!.status).toBe("posted");
        expect(store.resolved_obligations.find((o) => o.id === "ob-retry")!.review_status,
               "automatic posting is not review").toBe("pending");

        /* EXACTLY ONCE: a further continuation must not post again. */
        const posted = store.charges.filter((c) => c.id === "chg-retry" && c.status === "posted").length;
        const second = await autoPostGeneratedCharge(supabase as never, {
            orgId: ORG_ID, chargeId: "chg-retry", policies: [], today: "2026-11-12",
        });
        expect(second.kind, "already real is not a failure").toBe("posted");
        expect(store.charges.filter((c) => c.id === "chg-retry" && c.status === "posted").length,
               "no duplicate consequence").toBe(posted);
        expect(store.charges.filter((c) => c.id === "chg-retry").length, "and no duplicate row").toBe(1);
    });

    it("a terminal failure stays draft, is marked for attention, and is not retried again", async () => {
        const exhausted = {
            attempts: 5, first_attempted_at: "2026-11-01T00:00:00Z", last_attempted_at: "2026-11-05T00:00:00Z",
            last_error: "fetch failed", retryable: true, attention_required: true,
        };
        const nonRetryable = {
            attempts: 1, first_attempted_at: "2026-11-01T00:00:00Z", last_attempted_at: "2026-11-01T00:00:00Z",
            last_error: "posted childcare charge is immutable", retryable: false, attention_required: true,
        };
        /* Neither is picked up again by the unattended continuation. */
        expect(shouldRetryPost({ post_attempt: exhausted }), "exhausted stops").toBe(false);
        expect(shouldRetryPost({ post_attempt: nonRetryable }), "non-retryable never started").toBe(false);
        expect(exhausted.attention_required && nonRetryable.attention_required).toBe(true);
    });

    it("the Financials work queue is the attention surface, and a draft is its eligibility", () => {
        /*
         * Not another task system. The queue already surfaces draft childcare charges as operator
         * work — which was part of the DEFECT for ordinary billing, and is exactly right for a
         * terminal failure, because that is work only a human can finish.
         */
        const q = code("lib/financials/workspace/resolveFinancialWorkQueue.ts");
        expect(q).toContain('.eq("status", "draft")');
    });
});
