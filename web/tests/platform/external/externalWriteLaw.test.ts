/**
 * The law every future public mutation must follow, written down before the first one exists.
 *
 * ── WHY THIS FILE EXISTS WITH NO ENDPOINT TO TEST ──
 *
 * Thread 7 slice 7.3 was asked to settle the external write contract BEFORE Attendance submission
 * ships, because the alternative is that the first operation invents a contract and every later one
 * inherits it by accident. What is asserted here is the decided law and the two concrete pieces
 * that carry it: a distinct idempotency-conflict error type, and a write rate class.
 *
 * ── WHAT WAS DELIBERATELY NOT BUILT ──
 *
 * No generic idempotency store. Measurement found Alloy already has one doctrine, applied
 * consistently: `child_attendance_events.idempotency_key`, `payments.idempotency_key`, parent
 * intent, tours — every one of them DERIVED from the fact's own identity and namespaced by the
 * actor, and the payments module states the rule outright ("Derived, stable, and never a delivery
 * id"). A caller-supplied opaque header would have been a second mechanism for the same job,
 * weaker than the one already in place, and its first consumer would have been an operation that
 * already has a stronger key.
 */
import { describe, expect, it } from "vitest";

import { apiError, type ApiErrorType } from "@/lib/platform/external/apiErrors";
import { RATE_LIMIT_POLICY } from "@/lib/platform/external/rateLimit";

describe("idempotency conflict is its own answer", () => {
    it("is a distinct error type, not an overloaded conflict", () => {
        const types: ApiErrorType[] = ["conflict", "idempotency_conflict"];
        expect(new Set(types).size).toBe(2);
    });

    it("answers 409, the same status as a domain conflict", () => {
        /*
         * Same status, different code. The status tells a client it may not simply retry; the code
         * tells it WHICH fix applies — reconcile your data, or stop reusing an identity. A client
         * that cannot tell them apart will retry the one it should not.
         */
        const conflict = apiError({
            code: "conflict", type: "conflict", message: "x", requestId: "r",
        });
        const idempotency = apiError({
            code: "idempotency_conflict", type: "idempotency_conflict", message: "x", requestId: "r",
        });
        expect(conflict.status).toBe(409);
        expect(idempotency.status).toBe(409);
    });

    it("carries the request id every public error carries", async () => {
        const response = apiError({
            code: "idempotency_conflict", type: "idempotency_conflict",
            message: "This identity was already used with a different payload.", requestId: "req_1",
        });
        const body = await response.json() as { error: { code: string; request_id: string } };
        expect(body.error.code).toBe("idempotency_conflict");
        expect(body.error.request_id).toBe("req_1");
    });
});

describe("the write rate class", () => {
    it("exists, so the first operation does not have to invent one", () => {
        expect(RATE_LIMIT_POLICY.authenticatedWrite).toBeTruthy();
        expect(RATE_LIMIT_POLICY.authenticatedWrite.windowSeconds).toBe(60);
    });

    it("is tighter than reads and looser than token exchange", () => {
        /*
         * The ordering is the policy, and it is the part worth pinning. Reads are the highest
         * volume and the least dangerous; token exchange is the guessable surface and the tightest;
         * writes sit between. Exact numbers may be tuned with evidence — this relationship should
         * not silently invert.
         */
        const { tokenExchange, authenticatedRead, authenticatedWrite } = RATE_LIMIT_POLICY;
        expect(authenticatedWrite.limit).toBeLessThan(authenticatedRead.limit);
        expect(authenticatedWrite.limit).toBeGreaterThan(tokenExchange.limit);
    });

    it("is a platform class, not an attendance one", () => {
        // A per-resource budget is how two resources end up with two answers to one question.
        expect(Object.keys(RATE_LIMIT_POLICY)).toEqual([
            "tokenExchange",
            "authenticatedRead",
            "authenticatedWrite",
        ]);
    });
});
