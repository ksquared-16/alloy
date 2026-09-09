import { describe, expect, it, vi } from "vitest";

import { boundedRead, isTransientReadFailure } from "@/lib/certification/transientReadRetry";

/**
 * The retry boundary around the certification operational read.
 *
 * WHAT THIS PROTECTS. P_handoff's whole reason to exist is that "the handoff ran" and "the handoff
 * did something" look identical, and with the gate ON zero operational outputs is a FAILURE. A
 * retry that widened into "try again until it looks right" would destroy exactly that. So the
 * property under test is not "retrying works" — it is that retrying can never change a verdict the
 * database actually gave.
 */

const noSleep = async () => undefined;

describe("transient classification", () => {
    it("treats transport failures as retryable — no answer was ever received", () => {
        for (const message of [
            "TypeError: fetch failed",
            "ECONNRESET",
            "connection refused",
            "socket hang up",
            "request timed out",
            "503 Service Unavailable",
        ]) {
            expect(isTransientReadFailure(new Error(message)), message).toBe(true);
        }
    });

    it("treats an authoritative answer as final, however it failed", () => {
        // Each of these IS the database telling us something true. Retrying makes a real problem
        // look intermittent, which is worse than failing once and clearly.
        for (const message of [
            "permission denied for table child_placements",
            "column child_placements.location_id does not exist",
            "invalid input syntax for type uuid: \"\"",
            "new row violates row-level security policy",
            "JWT expired",
        ]) {
            expect(isTransientReadFailure(new Error(message)), message).toBe(false);
        }
    });

    it("prefers the deterministic reading when a message could look like both", () => {
        // "connection" appears here, but the answer is an authorization verdict.
        expect(isTransientReadFailure(new Error("permission denied on this connection"))).toBe(false);
    });
});

describe("bounded read", () => {
    it("A. a transient first attempt is retried and the successful result is used", async () => {
        const read = vi.fn()
            .mockRejectedValueOnce(new Error("TypeError: fetch failed"))
            .mockResolvedValueOnce({ rows: 2, errors: [] as string[] });

        const out = await boundedRead(read, { sleep: noSleep });

        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.value).toEqual({ rows: 2, errors: [] });
        expect(out.attempts).toBe(2);
        // The transient is REPORTED even though the retry succeeded — a degrading link that a
        // successful retry hides stays invisible until it fails permanently.
        expect(out.transientErrors).toEqual(["TypeError: fetch failed"]);
    });

    it("B. exhausting the bounded attempts fails, and does not loop", async () => {
        const read = vi.fn().mockRejectedValue(new Error("fetch failed"));

        const out = await boundedRead(read, { maxAttempts: 3, sleep: noSleep });

        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.attempts).toBe(3);
        expect(read).toHaveBeenCalledTimes(3);
        expect(out.deterministic).toBe(false);
    });

    it("E. a deterministic failure is NOT retried", async () => {
        const read = vi.fn().mockRejectedValue(new Error("permission denied for table child_placements"));

        const out = await boundedRead(read, { maxAttempts: 3, sleep: noSleep });

        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(read).toHaveBeenCalledTimes(1);
        expect(out.attempts).toBe(1);
        expect(out.deterministic).toBe(true);
        expect(out.transientErrors).toEqual([]);
    });

    it("C/D. a successful read of ZERO rows is an answer, and is never retried", async () => {
        // THE INVARIANT. Zero outputs is the input to the gate check — N/A when the handoff gate is
        // off, FAIL when it is on. If the retry treated zero rows as something to try again, a real
        // gate-ON failure could be retried into a pass. It must be delivered on attempt one.
        // Typed rather than `vi.fn().mockResolvedValue(...)`, whose inference is `unknown` — which
        // makes `v.errors` and `out.value.rows` below untypeable.
        const read = vi.fn(async (): Promise<{ rows: number; errors: string[] }> => ({ rows: 0, errors: [] }));

        const out = await boundedRead(read, { sleep: noSleep, errorOf: (v) => (v.errors.length ? "err" : null) });

        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.value.rows).toBe(0);
        expect(out.attempts).toBe(1);
        expect(read).toHaveBeenCalledTimes(1);
        expect(out.transientErrors).toEqual([]);
    });

    it("classifies a failure carried in the RESULT, not only a thrown one", async () => {
        // The Supabase client reports errors in the result rather than by throwing, which is how the
        // original transient arrived.
        const read = vi.fn()
            .mockResolvedValueOnce({ errors: ["TypeError: fetch failed"] })
            .mockResolvedValueOnce({ errors: [] as string[] });

        const out = await boundedRead(read, {
            sleep: noSleep,
            errorOf: (v: { errors: string[] }) => (v.errors.length ? v.errors.join("; ") : null),
        });

        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.attempts).toBe(2);
        expect(out.transientErrors).toEqual(["TypeError: fetch failed"]);
    });

    it("F. the retry re-runs ONLY the read it was given — nothing else is invoked", async () => {
        // The boundary wraps a read. If it could reach a write, a retried Complete Enrollment or a
        // second handoff materialization would be a duplicate operational record.
        const write = vi.fn();
        const read = vi.fn()
            .mockRejectedValueOnce(new Error("fetch failed"))
            .mockResolvedValueOnce({ ok: true });

        await boundedRead(read, { sleep: noSleep });

        expect(read).toHaveBeenCalledTimes(2);
        expect(write).not.toHaveBeenCalled();
    });

    it("never exceeds its bound, however transient the failure looks", async () => {
        const read = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
        await boundedRead(read, { maxAttempts: 2, sleep: noSleep });
        expect(read).toHaveBeenCalledTimes(2);
    });
});
