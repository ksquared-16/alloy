/**
 * Connecting an organization's own Twilio account.
 *
 * WHY NOT TWILIO CONNECT — recorded here because the choice is a security one.
 * Connect would avoid storing a customer secret at all. It is not used because
 * Twilio signs inbound webhooks with "your account's auth token" and the public
 * documentation does not say whether that means Alloy's token or the Connect
 * SUBACCOUNT's. Alloy validates that signature and FAILS CLOSED, so an unproven
 * answer risks silently refusing every inbound text. Guessing at that boundary is
 * worse than storing a credential we already have a proven authority for.
 */

import { describe, expect, it, vi } from "vitest";

import {
    CERTIFICATION_TWILIO_SID,
    CERTIFICATION_TWILIO_TOKEN,
    certificationTwilioVerifier,
    looksLikeAccountSid,
    twilioAccountEndpoint,
    verifyTwilioCredentials,
    type FetchLike,
} from "@/lib/communications/twilioConnection";

const SID = "AC00000000000000000000000000000001";
const TOKEN = "not-a-real-token";

function response(status: number, body: unknown = {}): Awaited<ReturnType<FetchLike>> {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("verification uses a non-mutating call", () => {
    it("fetches the account itself — read-only, cannot send", async () => {
        const fetchImpl = vi.fn(async () => response(200, { friendly_name: "Firefly SMS" })) as unknown as FetchLike;
        const r = await verifyTwilioCredentials(SID, TOKEN, { fetchImpl });
        const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
        expect(url).toBe(twilioAccountEndpoint(SID));
        expect(init.method).toBe("GET");
        expect(init.headers.Authorization.startsWith("Basic ")).toBe(true);
        expect(r).toEqual({ outcome: "ok", accountLabel: "Firefly SMS" });
    });

    it.each([401, 403])("a rejected credential (%s) is `invalid_credential`", async (status) => {
        const fetchImpl = (async () => response(status)) as unknown as FetchLike;
        expect(await verifyTwilioCredentials(SID, TOKEN, { fetchImpl })).toEqual({ outcome: "invalid_credential" });
    });

    it.each([500, 429])("a %s is `unavailable`, never a rejection", async (status) => {
        const fetchImpl = (async () => response(status)) as unknown as FetchLike;
        expect((await verifyTwilioCredentials(SID, TOKEN, { fetchImpl })).outcome).toBe("unavailable");
    });

    it("a network failure never leaks the token", async () => {
        const fetchImpl = (async () => {
            throw new Error(`ECONNRESET ${TOKEN}`);
        }) as unknown as FetchLike;
        const r = await verifyTwilioCredentials(SID, TOKEN, { fetchImpl });
        expect(r.outcome).toBe("unavailable");
        expect(JSON.stringify(r)).not.toContain(TOKEN);
    });
});

describe("a malformed Account SID never becomes a network call carrying a secret", () => {
    it.each(["", "AC123", "not-a-sid", "SK00000000000000000000000000000001"])("%s is refused locally", async (sid) => {
        const fetchImpl = vi.fn(async () => response(200)) as unknown as FetchLike;
        expect(await verifyTwilioCredentials(sid, TOKEN, { fetchImpl })).toEqual({ outcome: "invalid_credential" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("accepts a well-formed SID", () => {
        expect(looksLikeAccountSid(SID)).toBe(true);
        expect(looksLikeAccountSid(" AC00000000000000000000000000000001 ")).toBe(true);
    });

    it("a missing token never reaches the network", async () => {
        const fetchImpl = vi.fn(async () => response(200)) as unknown as FetchLike;
        expect(await verifyTwilioCredentials(SID, "  ", { fetchImpl })).toEqual({ outcome: "invalid_credential" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe("certification cannot reach Twilio", () => {
    it("makes no request when ALLOY_CERTIFICATION=1", async () => {
        const fetchImpl = vi.fn(async () => response(200)) as unknown as FetchLike;
        const r = await verifyTwilioCredentials(CERTIFICATION_TWILIO_SID, CERTIFICATION_TWILIO_TOKEN, {
            env: { ALLOY_CERTIFICATION: "1" },
            fetchImpl,
        });
        expect(r.outcome).toBe("ok");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("a REAL credential in certification is not called 'rejected' — Twilio was never asked", () => {
        expect(certificationTwilioVerifier(SID, TOKEN)).toEqual({ outcome: "certification_only" });
    });

    it("the certification credential is refused OUTSIDE certification", async () => {
        const fetchImpl = (async () => response(401)) as unknown as FetchLike;
        expect(
            await verifyTwilioCredentials(CERTIFICATION_TWILIO_SID, CERTIFICATION_TWILIO_TOKEN, { env: {}, fetchImpl }),
        ).toEqual({ outcome: "invalid_credential" });
    });
});
