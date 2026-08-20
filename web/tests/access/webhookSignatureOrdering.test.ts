import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * `RL-32` — *"webhook signature rejection **before any side effect**"* (§19), for the three routes
 * `RL-30` classified under the `signature` model.
 *
 * ## Why presence is not the property
 *
 * `RL-30` proves each of these routes REACHES a signature verification. That is a reachability
 * claim about the call graph, and its own header says so: it *"does not prove the check precedes
 * the side effect."* A route that verifies a signature after it has already written has a
 * signature check and no protection — the forged request's effect has landed, and the 403 that
 * follows describes damage rather than preventing it. Order is the whole invariant here, and it is
 * invisible to a static reachability walk.
 *
 * ## What "no side effect" means for this family
 *
 * These routes converge on one writer, `applyOutboundProviderDeliveryPatch`, which is what mutates
 * message state from a provider callback. So the assertion is that an unverified request never
 * reaches that writer — not merely that the response is 4xx.
 *
 * The Twilio family additionally READS before it verifies, and that is correct rather than a
 * violation: the per-binding route must load `communication_provider_bindings.secret_ref` to
 * discover WHICH secret to verify against. A read that obtains the verification key cannot itself
 * be the thing the key protects. The test therefore pins the writer, not the client.
 */

const { mockApplyPatch } = vi.hoisted(() => ({ mockApplyPatch: vi.fn() }));
vi.mock("@/lib/communications/providerDeliveryPersistence", () => ({
    applyOutboundProviderDeliveryPatch: mockApplyPatch,
}));

const { mockVerify } = vi.hoisted(() => ({ mockVerify: vi.fn() }));
vi.mock("svix", () => ({
    Webhook: class {
        constructor(_secret: string) {}
        verify(...args: unknown[]) {
            return mockVerify(...args);
        }
    },
}));

const { mockVerifyTwilio } = vi.hoisted(() => ({ mockVerifyTwilio: vi.fn() }));
vi.mock("@/lib/communications/twilioWebhookSignature", () => ({
    verifyTwilioRequestSignature: mockVerifyTwilio,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({
        from: () => {
            const chain: Record<string, unknown> = {};
            for (const m of ["select", "eq", "update", "insert"]) chain[m] = () => chain;
            chain.maybeSingle = async () => ({ data: { secret_ref: null }, error: null });
            chain.single = async () => ({ data: { secret_ref: null }, error: null });
            return chain;
        },
    })),
}));

import { POST as resendPOST } from "@/app/api/webhooks/resend/route";
import { POST as twilioPOST } from "@/app/api/webhooks/twilio/sms-status/route";
import { POST as twilioBindingPOST } from "@/app/api/webhooks/twilio/sms-status/[binding_id]/route";

beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
    process.env.TWILIO_AUTH_TOKEN = "twilio_test_token";
    mockApplyPatch.mockResolvedValue({ ok: true, message_id: "m-1", updated: true });
});

function twilioRequest(url: string) {
    return new NextRequest(url, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            "x-twilio-signature": "forged",
        },
        body: "MessageSid=SM123&MessageStatus=delivered",
    });
}

describe("RL-32 · webhooks — the signature decides before anything is written", () => {
    it("Resend: a forged signature never reaches the delivery writer", async () => {
        mockVerify.mockImplementation(() => {
            throw new Error("invalid signature");
        });

        const res = await resendPOST(
            new NextRequest("http://localhost/api/webhooks/resend", {
                method: "POST",
                headers: { "svix-id": "1", "svix-timestamp": "2", "svix-signature": "v1,forged" },
                body: JSON.stringify({ type: "email.delivered", data: { email_id: "e-1" } }),
            })
        );

        expect(res.status).toBe(400);
        expect(mockApplyPatch).not.toHaveBeenCalled();
    });

    it("Resend: a verified signature DOES reach the writer — the positive control", async () => {
        mockVerify.mockReturnValue({ type: "email.delivered", data: { email_id: "e-1" }, id: "evt-1" });

        const res = await resendPOST(
            new NextRequest("http://localhost/api/webhooks/resend", {
                method: "POST",
                headers: { "svix-id": "1", "svix-timestamp": "2", "svix-signature": "v1,good" },
                body: JSON.stringify({ type: "email.delivered", data: { email_id: "e-1" } }),
            })
        );

        expect(res.status).toBe(200);
        expect(mockApplyPatch).toHaveBeenCalledTimes(1);
    });

    it("Resend: missing signature headers are refused before verification is even attempted", async () => {
        const res = await resendPOST(
            new NextRequest("http://localhost/api/webhooks/resend", {
                method: "POST",
                body: JSON.stringify({ type: "email.delivered", data: { email_id: "e-1" } }),
            })
        );

        expect(res.status).toBe(400);
        expect(mockVerify).not.toHaveBeenCalled();
        expect(mockApplyPatch).not.toHaveBeenCalled();
    });

    it("Twilio: a forged signature never reaches the delivery writer", async () => {
        mockVerifyTwilio.mockReturnValue(false);

        const res = await twilioPOST(twilioRequest("http://localhost/api/webhooks/twilio/sms-status"));

        expect(res.status).toBe(403);
        expect(mockApplyPatch).not.toHaveBeenCalled();
    });

    it("Twilio: a valid signature DOES reach the writer — the positive control", async () => {
        mockVerifyTwilio.mockReturnValue(true);

        const res = await twilioPOST(twilioRequest("http://localhost/api/webhooks/twilio/sms-status"));

        expect(res.status).toBe(200);
        expect(mockApplyPatch).toHaveBeenCalledTimes(1);
    });

    it("Twilio per-binding: a forged signature never reaches the delivery writer", async () => {
        mockVerifyTwilio.mockReturnValue(false);

        const res = await twilioBindingPOST(
            twilioRequest("http://localhost/api/webhooks/twilio/sms-status/binding-1"),
            { params: Promise.resolve({ binding_id: "binding-1" }) }
        );

        expect(res.status).toBe(403);
        expect(mockApplyPatch).not.toHaveBeenCalled();
    });

    it("Twilio: an unconfigured auth token refuses rather than accepting unverified input", async () => {
        delete process.env.TWILIO_AUTH_TOKEN;
        mockVerifyTwilio.mockReturnValue(true);

        const res = await twilioPOST(twilioRequest("http://localhost/api/webhooks/twilio/sms-status"));

        // Fail CLOSED: with no key there is no way to tell a real callback from a forged one, so the
        // absence of configuration must not become an absence of checking.
        expect(res.status).toBe(503);
        expect(mockApplyPatch).not.toHaveBeenCalled();
    });
});
