/**
 * THE EXECUTE ENVELOPE, AS THE ROUTE ACTUALLY EMITS IT.
 *
 * `/api/admin/actions/execute` serialises a registered action's result with
 *
 *     execution_result: result.actionResult.result.detail
 *
 * — the detail IS the `execution_result`. Three Payments command modules read
 * `execution_result.detail`, one level too deep, so every one of them received `{}` and every
 * caller behaved as though the server had returned nothing.
 *
 * ── WHAT THAT COST ──
 *
 * The provider case is the one a human found: pressing "Continue setup" on deployed staging left
 * the button reading "Opening…" and never opened Stripe, because the onboarding URL was in the
 * envelope and the client looked past it. Nothing threw, so nothing was reported.
 *
 * These cases use the EXACT envelope shape the route produces, so they fail if either side of the
 * contract moves — which is the only way this class of defect is ever caught, since both halves are
 * individually correct and only disagree about depth.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { executeProviderCommand } from "@/lib/financials/payments/providerCommands";
import { executePaymentMethodCommand } from "@/lib/financials/payments/paymentMethodCommands";
import { executeRecognizePayment } from "@/lib/financials/payments/recognitionCommands";

/** Exactly what `apiOk({ execution_result: <detail>, affected_id })` puts on the wire. */
function routeEnvelope(detail: Record<string, unknown>) {
    return {
        ok: true,
        status: 200,
        json: async () => ({
            ok: true,
            data: { execution_result: detail, affected_id: "" },
            correlation_id: "corr-1",
        }),
    };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("a registered action's detail survives the round trip", () => {
    it("carries the provider onboarding URL to the caller", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => routeEnvelope({
            created: false,
            resumed: true,
            onboarding_url: "https://connect.stripe.com/setup/e/acct_123/abc",
            state: { connected: true, readiness: "onboarding_incomplete" },
        })));

        const result = await executeProviderCommand("connect", { display_name: "Test" });
        expect(result.ok).toBe(true);
        expect(
            result.ok && result.detail.onboarding_url,
            "the URL is in the envelope; reading execution_result.detail looks past it",
        ).toBe("https://connect.stripe.com/setup/e/acct_123/abc");
    });

    /* W2's add-method flow needs the provider handles the same way. */
    it("carries the payment-method setup handles to the caller", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => routeEnvelope({
            stage: "begin",
            setup_ref: "seti_1",
            client_secret: "seti_1_secret_abc",
            provider_customer_ref: "cus_1",
            rail: "card",
        })));

        const result = await executePaymentMethodCommand("add", { customer_id: "c1" });
        expect(result.ok).toBe(true);
        expect(result.ok && result.detail.client_secret).toBe("seti_1_secret_abc");
        expect(result.ok && result.detail.setup_ref).toBe("seti_1");
    });

    it("carries the recognition outcome to the caller", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => routeEnvelope({
            recognized: true,
            payment_id: "pay-1",
        })));

        const result = await executeRecognizePayment("attempt-1");
        expect(result.ok).toBe(true);
        expect(result.ok && result.detail.payment_id).toBe("pay-1");
    });

    /*
     * TOLERANCE, NOT A SECOND CONTRACT. Some routes DO nest a `detail`, and the tours reader
     * already handles both. Reading the nested one when it exists keeps this fix from breaking a
     * caller whose route nests, without inventing a third shape.
     */
    it("still reads a nested detail when a route nests one", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                ok: true,
                data: { execution_result: { detail: { onboarding_url: "https://nested.example/x" } } },
            }),
        })));

        const result = await executeProviderCommand("connect", {});
        expect(result.ok && result.detail.onboarding_url).toBe("https://nested.example/x");
    });
});
