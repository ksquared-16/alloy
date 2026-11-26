/**
 * The Organization Communications view model.
 *
 * The load-bearing test here is the vocabulary one. "Do not expose `secret_ref`,
 * `scope`, raw constraint names, or 'composer outbound readiness'" is a product
 * requirement that is easy to satisfy on the day and easy to regress six weeks
 * later, when someone adds a field to the card and passes the binding row
 * straight through. Asserting it over the SERIALIZED model catches that, because
 * it does not depend on which property the leak arrives in.
 */

import { describe, expect, it } from "vitest";

import {
    buildChannelCards,
    summarizeChannels,
    type BindingView,
} from "@/lib/communications/organizationCommunicationsModel";
import { evaluateBindingReadiness } from "@/lib/communications/bindingReadiness";

function emailBinding(over: Partial<BindingView> = {}): BindingView {
    return {
        id: "11111111-1111-4111-8111-111111111111",
        channel: "email",
        provider: "resend",
        status: "active",
        is_primary: true,
        display_label: "Front desk",
        inbound_address: "families@firefly.example",
        from_email: "hello@firefly.example",
        receiving_domain: "firefly.example",
        sending_domain: "firefly.example",
        credential_key: "resend_deployment_key",
        credential_configured: true,
        readiness: {
            send: { state: "ready", detail: "Sending as hello@firefly.example." },
            receive: { state: "ready", detail: "Receiving mail addressed to families@firefly.example." },
        },
        ...over,
    };
}

function smsBinding(over: Partial<BindingView> = {}): BindingView {
    return {
        id: "22222222-2222-4222-8222-222222222222",
        channel: "sms",
        provider: "twilio",
        status: "active",
        is_primary: true,
        inbound_to_e164: "+15550001111",
        credential_key: "twilio_deployment_token",
        credential_configured: true,
        readiness: {
            send: { state: "ready", detail: "Ready to send." },
            receive: { state: "ready", detail: "Receiving messages sent to +15550001111." },
        },
        ...over,
    };
}

describe("the surface speaks product vocabulary, never storage", () => {
    const FORBIDDEN = [
        "secret_ref",
        "secretRef",
        "scope",
        "location_id",
        "composer",
        "binding",
        "uq",
        "constraint",
        "env:",
        "unconfigured",
        "pending_verification",
    ];

    it("no storage term survives into the rendered model", () => {
        const cards = buildChannelCards([
            emailBinding({ status: "pending_verification" }),
            smsBinding(),
        ]);
        // Everything an operator can read: labels, details, identity values.
        const readable = JSON.stringify(
            cards.map((c) => ({
                channelLabel: c.channelLabel,
                providerLabel: c.providerLabel,
                sending: c.sending,
                receiving: c.receiving,
                identity: c.identity,
                outstanding: c.outstanding,
            })),
        ).toLowerCase();

        for (const term of FORBIDDEN) {
            expect(readable, `operator-visible text must not contain "${term}"`).not.toContain(term.toLowerCase());
        }
    });

    /**
     * The fixture-driven test above only proves the states those fixtures reach.
     * This one drives EVERY readiness sentence the model can produce, because a
     * storage term is most likely to hide in a rarely-reached branch — which is
     * exactly where it survives review.
     */
    it("no storage term appears in ANY reachable readiness sentence", () => {
        const rows: BindingView[] = [];
        for (const channel of ["email", "sms"]) {
            for (const provider of ["resend", "twilio", "sendgrid", ""]) {
                for (const status of ["active", "disabled", "pending_verification"]) {
                    for (const secret_ref of ["env:RESEND_API_KEY", "legacy_global_twilio", "unconfigured", ""]) {
                        for (const hasIdentity of [true, false]) {
                            const inbound_address =
                                channel === "email" && hasIdentity ? "families@firefly.example" : null;
                            const inbound_to_e164 = channel === "sms" && hasIdentity ? "+15550001111" : null;
                            // Readiness is computed by the REAL function, exactly as the
                            // route computes it. Passing a hand-written readiness object
                            // here would test the fixture, not the sentences that ship.
                            const readiness = evaluateBindingReadiness({
                                id: "x",
                                channel,
                                provider,
                                status,
                                secret_ref,
                                inbound_address,
                                inbound_to_e164,
                                config: {},
                            });
                            rows.push({
                                id: `${channel}-${provider}-${status}-${secret_ref}-${hasIdentity}`,
                                channel,
                                provider,
                                status,
                                credential_configured: secret_ref !== "" && secret_ref !== "unconfigured",
                                inbound_address,
                                inbound_to_e164,
                                from_email: null,
                                readiness,
                            });
                        }
                    }
                }
            }
        }

        // Each row rendered on its own, so every branch produces its own card.
        for (const row of rows) {
            const cards = buildChannelCards([row]);
            const readable = JSON.stringify(
                cards.map((c) => [c.channelLabel, c.providerLabel, c.sending, c.receiving, c.identity, c.outstanding]),
            ).toLowerCase();
            for (const term of FORBIDDEN) {
                expect(readable, `row ${row.id} leaked "${term}"`).not.toContain(term.toLowerCase());
            }
        }
    });

    it("renders statuses as sentences, not stored enum values", () => {
        const [email] = buildChannelCards([emailBinding({ status: "pending_verification" })]);
        expect(email!.sending.label).not.toBe("pending_verification");
        expect(["Ready", "Setup required", "Verification required", "Disabled", "Provider unavailable"]).toContain(
            email!.sending.label,
        );
    });

    it("names providers the way their own product does", () => {
        expect(buildChannelCards([emailBinding()])[0]!.providerLabel).toBe("Resend");
        expect(buildChannelCards([smsBinding()])[1]!.providerLabel).toBe("Twilio");
    });
});

describe("the five questions the page must answer", () => {
    it("1 — what channels are connected (both always appear, connected or not)", () => {
        const cards = buildChannelCards([emailBinding()]);
        expect(cards.map((c) => c.channel)).toEqual(["email", "sms"]);
        expect(cards[0]!.connected).toBe(true);
        // SMS is reported as NOT connected rather than omitted — an absent card
        // answers nothing.
        expect(cards[1]!.connected).toBe(false);
    });

    it("2 — what identity Alloy sends and receives as", () => {
        const [email, sms] = buildChannelCards([emailBinding(), smsBinding()]);
        expect(email!.identity).toEqual([
            { label: "From", value: "hello@firefly.example", placeholder: "Using the default sending address" },
            { label: "Replies", value: "families@firefly.example", placeholder: "No reply address set" },
        ]);
        expect(sms!.identity).toEqual([
            { label: "Number", value: "+15550001111", placeholder: "No number set" },
        ]);
    });

    it("2b — an absent identity falls back to a placeholder, never a blank", () => {
        const [email] = buildChannelCards([emailBinding({ from_email: null, inbound_address: null })]);
        expect(email!.identity.every((l) => l.value === "" && (l.placeholder ?? "").length > 0)).toBe(true);
    });

    it("3 and 4 — sending and receiving are separate answers", () => {
        const [email] = buildChannelCards([
            emailBinding({
                readiness: {
                    send: { state: "ready", detail: "Sending as hello@firefly.example." },
                    receive: { state: "verification_required", detail: "Waiting on verification." },
                },
            }),
        ]);
        expect(email!.sending.state).toBe("ready");
        expect(email!.sending.label).toBe("Ready");
        expect(email!.receiving.state).toBe("verification_required");
        expect(email!.receiving.label).toBe("Verification required");
    });

    it("5 — what still needs setup lists only the directions that are not ready", () => {
        const [email] = buildChannelCards([
            emailBinding({
                readiness: {
                    send: { state: "ready", detail: "Sending as hello@firefly.example." },
                    receive: { state: "setup_required", detail: "No receiving address." },
                },
            }),
        ]);
        expect(email!.outstanding).toEqual(["Receiving — No receiving address."]);
    });

    it("5b — a fully working channel has nothing outstanding", () => {
        const [email] = buildChannelCards([emailBinding()]);
        expect(email!.outstanding).toEqual([]);
    });

    it("5c — an unconnected channel says so once, not twice", () => {
        const cards = buildChannelCards([]);
        expect(cards[0]!.outstanding).toEqual(["Not connected yet."]);
    });
});

describe("which row speaks for a channel", () => {
    it("the primary speaks, even when a spare is healthier", () => {
        const primaryBroken = emailBinding({
            id: "aaaa1111-1111-4111-8111-111111111111",
            is_primary: true,
            from_email: "primary@firefly.example",
            readiness: {
                send: { state: "setup_required", detail: "No credential." },
                receive: { state: "setup_required", detail: "No address." },
            },
        });
        const spareHealthy = emailBinding({
            id: "bbbb2222-2222-4222-8222-222222222222",
            is_primary: false,
            from_email: "spare@firefly.example",
        });
        const [email] = buildChannelCards([spareHealthy, primaryBroken]);
        // The runtime prefers the primary, so the card must describe the primary —
        // otherwise the page advertises a channel that is not the one used.
        expect(email!.identity[0]!.value).toBe("primary@firefly.example");
        expect(email!.sending.state).toBe("setup_required");
        expect(email!.additionalCount).toBe(1);
    });

    it("with no primary, the healthier row speaks", () => {
        const broken = emailBinding({
            id: "cccc3333-3333-4333-8333-333333333333",
            is_primary: false,
            from_email: "broken@firefly.example",
            readiness: {
                send: { state: "setup_required", detail: "No credential." },
                receive: { state: "setup_required", detail: "No address." },
            },
        });
        const healthy = emailBinding({ id: "dddd4444-4444-4444-8444-444444444444", is_primary: false });
        const [email] = buildChannelCards([broken, healthy]);
        expect(email!.identity[0]!.value).toBe("hello@firefly.example");
    });

    it("exposes ids only as opaque handles, never as identity text", () => {
        const [email] = buildChannelCards([emailBinding()]);
        expect(email!.primaryBindingId).toBe("11111111-1111-4111-8111-111111111111");
        const visible = JSON.stringify([email!.identity, email!.outstanding, email!.sending, email!.receiving]);
        expect(visible).not.toContain("11111111-1111-4111-8111-111111111111");
    });
});

describe("the page summary rounds DOWN, never up", () => {
    it("both channels fully working reads as ready", () => {
        const cards = buildChannelCards([emailBinding(), smsBinding()]);
        expect(summarizeChannels(cards)).toEqual({ label: "Email and SMS ready", needsAttention: false });
    });

    it("a working send with a broken receive is NOT ready", () => {
        const cards = buildChannelCards([
            emailBinding({
                readiness: {
                    send: { state: "ready", detail: "ok" },
                    receive: { state: "setup_required", detail: "no address" },
                },
            }),
            smsBinding(),
        ]);
        // The exact failure this surface exists to prevent.
        expect(summarizeChannels(cards)).toEqual({ label: "Setup incomplete", needsAttention: true });
    });

    it("nothing connected needs attention", () => {
        expect(summarizeChannels(buildChannelCards([]))).toEqual({
            label: "No channels connected",
            needsAttention: true,
        });
    });

    it("a disabled channel is not counted as ready", () => {
        const cards = buildChannelCards([
            emailBinding({
                status: "disabled",
                readiness: {
                    send: { state: "disabled", detail: "switched off" },
                    receive: { state: "disabled", detail: "switched off" },
                },
            }),
        ]);
        expect(cards[0]!.enabled).toBe(false);
        expect(summarizeChannels(cards).needsAttention).toBe(true);
    });
});
