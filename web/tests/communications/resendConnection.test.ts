/**
 * Connecting an organization's own Resend account.
 *
 * The defect being designed out: treating "the vault write succeeded" as provider
 * readiness. Storing a string proves nothing about whether Resend will accept it,
 * and a card reading "Connected" on that basis is the same lie in a new place.
 *
 * The distinction these tests exist to protect is `invalid_credential` versus
 * `unavailable`. Telling an administrator their key is wrong when Resend is merely
 * unreachable sends them to replace a key that works — so a provider that cannot
 * be reached must never be reported as a rejection.
 */

import { describe, expect, it, vi } from "vitest";

import {
    CERTIFICATION_RESEND_KEY,
    RESEND_DOMAINS_ENDPOINT,
    certificationVerifier,
    extractVerifiedDomains,
    verifyResendApiKey,
    type FetchLike,
} from "@/lib/communications/resendConnection";

function response(status: number, body: unknown = {}): Awaited<ReturnType<FetchLike>> {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("verification exercises the credential rather than trusting it", () => {
    it("uses an authenticated READ, never anything that could send", async () => {
        const fetchImpl = vi.fn(async () => response(200, { data: [] })) as unknown as FetchLike;
        await verifyResendApiKey("re_live_abc", { fetchImpl });
        const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
        expect(url).toBe(RESEND_DOMAINS_ENDPOINT);
        expect(init.method).toBe("GET");
        expect(init.headers.Authorization).toBe("Bearer re_live_abc");
    });

    it("a working key returns the domains the account can send from", async () => {
        const fetchImpl = (async () =>
            response(200, {
                data: [
                    { name: "workwithalloy.com", status: "verified" },
                    { name: "not-ready.example", status: "pending" },
                ],
            })) as unknown as FetchLike;
        const result = await verifyResendApiKey("re_live_abc", { fetchImpl });
        expect(result).toEqual({ outcome: "ok", verifiedDomains: ["workwithalloy.com"] });
    });

    it.each([401, 403])("a rejected key (%s) is `invalid_credential`", async (status) => {
        const fetchImpl = (async () => response(status)) as unknown as FetchLike;
        expect(await verifyResendApiKey("re_bad", { fetchImpl })).toEqual({ outcome: "invalid_credential" });
    });

    it("an empty key never reaches the network", async () => {
        const fetchImpl = vi.fn(async () => response(200)) as unknown as FetchLike;
        expect(await verifyResendApiKey("   ", { fetchImpl })).toEqual({ outcome: "invalid_credential" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe("a provider that cannot be reached is NOT a rejected credential", () => {
    it("a network failure is `unavailable`", async () => {
        const fetchImpl = (async () => {
            throw new Error("ECONNRESET re_live_abc");
        }) as unknown as FetchLike;
        const result = await verifyResendApiKey("re_live_abc", { fetchImpl });
        expect(result.outcome).toBe("unavailable");
        // The thrown error quoted the request, which carried the key.
        expect(JSON.stringify(result)).not.toContain("re_live_abc");
    });

    it.each([500, 502, 429])("a %s from Resend is `unavailable`, not invalid", async (status) => {
        const fetchImpl = (async () => response(status)) as unknown as FetchLike;
        expect((await verifyResendApiKey("re_live_abc", { fetchImpl })).outcome).toBe("unavailable");
    });

    it("an unreadable body is `unavailable`", async () => {
        const fetchImpl = (async () => ({
            ok: true,
            status: 200,
            json: async () => {
                throw new Error("not json");
            },
        })) as unknown as FetchLike;
        expect((await verifyResendApiKey("re_live_abc", { fetchImpl })).outcome).toBe("unavailable");
    });
});

describe("certification cannot reach the network, structurally", () => {
    it("with ALLOY_CERTIFICATION=1 no request is made at all", async () => {
        const fetchImpl = vi.fn(async () => response(200)) as unknown as FetchLike;
        const result = await verifyResendApiKey(CERTIFICATION_RESEND_KEY, {
            env: { ALLOY_CERTIFICATION: "1" },
            fetchImpl,
        });
        expect(result.outcome).toBe("ok");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("the certification key is refused OUTSIDE certification", async () => {
        // It must not become a skeleton key: without the flag it is just a string
        // Resend will reject.
        const fetchImpl = (async () => response(401)) as unknown as FetchLike;
        expect(await verifyResendApiKey(CERTIFICATION_RESEND_KEY, { env: {}, fetchImpl })).toEqual({
            outcome: "invalid_credential",
        });
    });

    it("a REAL key in certification is not called 'rejected' — Resend was never asked", () => {
        // The Director pasted a valid production key into a certification build and
        // was told Resend had rejected it. Nothing was asked of Resend.
        expect(certificationVerifier("re_a_real_production_key")).toEqual({ outcome: "certification_only" });
        expect(certificationVerifier(CERTIFICATION_RESEND_KEY).outcome).toBe("ok");
    });
});

describe("domain extraction is tolerant, because it drives a hint", () => {
    it("reads both the bare array and the `data` envelope", () => {
        const rows = [{ name: "a.example", status: "verified" }];
        expect(extractVerifiedDomains(rows)).toEqual(["a.example"]);
        expect(extractVerifiedDomains({ data: rows })).toEqual(["a.example"]);
    });

    it("returns an empty list rather than throwing on an unexpected shape", () => {
        for (const body of [null, undefined, 42, "text", {}, { data: "no" }, [null, 1]]) {
            expect(extractVerifiedDomains(body)).toEqual([]);
        }
    });

    it("only `verified` domains count — pending is not verified", () => {
        expect(
            extractVerifiedDomains([
                { name: "yes.example", status: "verified" },
                { name: "no.example", status: "pending" },
                { name: "", status: "verified" },
            ]),
        ).toEqual(["yes.example"]);
    });
});
