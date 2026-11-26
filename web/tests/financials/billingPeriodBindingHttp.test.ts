/**
 * A BILLING-PERIOD REFUSAL IS A CONFIGURATION CONFLICT, NOT AN INTERNAL ERROR.
 *
 * The measured defect: `BillingPeriodBindingError` was thrown by one canonical authority and caught
 * by nothing in particular, so the shared route responder's fall-through answered it
 * `{ code: "internal_error" }, 500` — and forwarded the error's own message. A household that
 * merely needed a billing calendar chosen therefore got an unactionable 500, and an infrastructure
 * read failure got a raw PostgREST string in the operator's face.
 *
 * These cases bind the mapping itself rather than any one route, because the point of the repair is
 * that there is ONE mapping. The refusal doctrine is untouched: the binder still refuses, for the
 * same reasons, before any economic write.
 */
import { describe, expect, it } from "vitest";

import { BillingPeriodBindingError } from "@/lib/financials/billingPeriods/bindChargeBillingPeriod";
import {
    billingPeriodBindingHttpAnswer,
    isOperatorResolvableBindingCode,
} from "@/lib/financials/billingPeriods/billingPeriodBindingHttp";
import { operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

/** The sentences the binder really throws, so the test cannot drift from the authority. */
const AMBIGUOUS_MESSAGE =
    "This household attends more than one location and has no billing calendar of its own, so there"
    + " is no single commercial period to bill into. Set the account's billing calendar first.";

describe("billing-period binding — the one HTTP mapping", () => {
    describe("operator-resolvable configuration conflicts answer 409", () => {
        const resolvable = [
            "billing_calendar_ambiguous",
            "billing_calendar_invalid",
            "billing_calendar_unconfigured",
            "period_not_materialized",
            "customer_unresolved",
        ];

        for (const code of resolvable) {
            it(`${code} is 409 with its own stable code`, () => {
                const answer = billingPeriodBindingHttpAnswer(
                    new BillingPeriodBindingError(code, AMBIGUOUS_MESSAGE, { customerId: "c1" }),
                );
                expect(answer).not.toBeNull();
                expect(answer!.status).toBe(409);
                /* The diagnostic code is the error's own — never flattened to one generic value. */
                expect(answer!.code).toBe(code);
                expect(answer!.code).not.toBe("internal_error");
                /* The business sentence survives: the error already wrote it for an operator. */
                expect(answer!.message).toBe(AMBIGUOUS_MESSAGE);
                expect(answer!.detail).toEqual({ customerId: "c1" });
            });
        }

        it("says nothing an operator cannot use — no internal vocabulary, no constraint names", () => {
            const answer = billingPeriodBindingHttpAnswer(
                new BillingPeriodBindingError("billing_calendar_ambiguous", AMBIGUOUS_MESSAGE),
            )!;
            const text = `${answer.code} ${answer.message}`.toLowerCase();
            for (const leak of [
                "internal_error",
                "internal error",
                "chk",
                "constraint",
                "null value",
                "pgrst",
                "postgres",
                "supabase",
                "stack",
                "undefined",
                "exception",
            ]) {
                expect(text, `the answer must not contain ${leak}`).not.toContain(leak);
            }
        });
    });

    describe("infrastructure failures stay 500 — and stop leaking the database's words", () => {
        const infra = ["agreement_read_failed", "member_read_failed", "period_read_failed"];

        for (const code of infra) {
            it(`${code} is 500, and its raw database message is REPLACED`, () => {
                /* This is what the client actually hands us for these codes. */
                const raw = 'column charges.nope does not exist (PGRST204)';
                const answer = billingPeriodBindingHttpAnswer(
                    new BillingPeriodBindingError(code, raw, { agreementId: "a1" }),
                )!;
                expect(answer.status).toBe(500);
                expect(answer.message).not.toContain("PGRST204");
                expect(answer.message).not.toContain("does not exist");
                expect(answer.message).not.toBe(raw);
                /* Still a stable code, and still not the word we were told never to expose. */
                expect(answer.code).toBe("billing_period_unavailable");
                expect(answer.code).not.toBe("internal_error");
                /* No detail on an infrastructure answer: there is nothing to act on. */
                expect(answer.detail).toBeUndefined();
            });
        }

        it("an UNKNOWN code is treated as infrastructure, which is the safe default", () => {
            /*
             * A code added to the binder later is operator-resolvable only when someone decides it
             * is. Defaulting the other way would promise an operator a fix that may not exist, and
             * could forward a message nobody vetted.
             */
            const answer = billingPeriodBindingHttpAnswer(
                new BillingPeriodBindingError("some_future_code", "raw internals here"),
            )!;
            expect(answer.status).toBe(500);
            expect(answer.message).not.toContain("raw internals");
            expect(isOperatorResolvableBindingCode("some_future_code")).toBe(false);
        });
    });

    it("returns null for anything that is not a binding error, so callers keep their own handling", () => {
        expect(billingPeriodBindingHttpAnswer(new Error("unrelated"))).toBeNull();
        expect(billingPeriodBindingHttpAnswer(null)).toBeNull();
        expect(
            billingPeriodBindingHttpAnswer(new OperationalEnrollmentServiceError("not_found", "nope")),
        ).toBeNull();
    });
});

describe("the shared route responder answers the conflict, not a 500", () => {
    it("a missing/ambiguous calendar is 409 through operationalEnrollmentErrorResponse", async () => {
        /*
         * This is the exact path the two measured routes use —
         * /api/admin/financial/charge-templates/simulate and /api/admin/financial-charge-preview —
         * both of which end in `catch (e) { return operationalEnrollmentErrorResponse(e); }`.
         */
        const response = operationalEnrollmentErrorResponse(
            new BillingPeriodBindingError("billing_calendar_ambiguous", AMBIGUOUS_MESSAGE, {
                customerId: "c1",
                locationIds: ["l1", "l2"],
            }),
        );
        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body.code).toBe("billing_calendar_ambiguous");
        expect(body.error).toBe(AMBIGUOUS_MESSAGE);
        expect(body.details).toEqual({ customerId: "c1", locationIds: ["l1", "l2"] });
    });

    it("an infrastructure read failure is 500 with our words, not the database's", async () => {
        const response = operationalEnrollmentErrorResponse(
            new BillingPeriodBindingError("period_read_failed", 'relation "x" does not exist'),
        );
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.code).toBe("billing_period_unavailable");
        expect(body.error).not.toContain("does not exist");
    });

    it("leaves every other error exactly as it was", async () => {
        /* The repair adds a branch; it must not re-route the responder's existing contract. */
        const notFound = operationalEnrollmentErrorResponse(
            new OperationalEnrollmentServiceError("not_found", "no such charge"),
        );
        expect(notFound.status).toBe(404);

        const conflict = operationalEnrollmentErrorResponse(
            new OperationalEnrollmentServiceError("conflict", "already posted"),
        );
        expect(conflict.status).toBe(409);

        const invalid = operationalEnrollmentErrorResponse(
            new OperationalEnrollmentServiceError("invalid_input", "bad"),
        );
        expect(invalid.status).toBe(400);

        const range = operationalEnrollmentErrorResponse(new RangeError("out of range"));
        expect(range.status).toBe(400);

        const unknown = operationalEnrollmentErrorResponse(new Error("something else"));
        expect(unknown.status).toBe(500);
        expect((await unknown.json()).code).toBe("internal_error");
    });
});
