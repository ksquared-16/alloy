/**
 * Receiving readiness is OBSERVED, never inferred.
 *
 * The defect: an email binding reported "Ready" to receive the moment
 * `inbound_address` held a value. That column records that an administrator
 * typed an address. It says nothing about whether their mail provider forwards
 * it anywhere, whether MX points at Resend, or whether a rule created months ago
 * still exists — and for an externally routed primary-domain identity, Alloy
 * cannot continuously prove any of those.
 *
 * `bindingReadiness.ts` states its own rule as "readiness is derived from what
 * the runtime would do, never from configuration being present." What the runtime
 * does with inbound is accept something that ARRIVES. So arrival is the evidence,
 * and nothing else is promoted to proof.
 */

import { describe, expect, it } from "vitest";

import {
    evaluateBindingReadiness,
    readinessLabel,
    type BindingReadiness,
} from "@/lib/communications/bindingReadiness";
import type { BindingSummary } from "@/lib/communications/composerChannels";

type Row = BindingSummary & { inbound_address?: string | null };

const OBSERVED_AT = "2026-08-14T12:00:00.000Z";
const HIDDEN_DESTINATION = "a7f3c1@x9k2m4.resend.app";

function emailBinding(overrides: Partial<Row> = {}): Row {
    return {
        id: "b1",
        channel: "email",
        provider: "resend",
        status: "active",
        secret_ref: "env:RESEND_API_KEY",
        is_primary: true,
        config: { from_email: "kelly@workwithalloy.com" },
        inbound_address: "kelly@workwithalloy.com",
        ...overrides,
    } as Row;
}

function smsBinding(overrides: Partial<Row> = {}): Row {
    return {
        id: "s1",
        channel: "sms",
        provider: "twilio",
        status: "active",
        secret_ref: "env:TWILIO_AUTH_TOKEN",
        is_primary: true,
        config: {},
        inbound_to_e164: "+15551234567",
        ...overrides,
    } as Row;
}

const healthy = { credentialAvailable: true, approvedConnectionAvailable: true };

function receiveOf(readiness: BindingReadiness) {
    return readiness.receive;
}

describe("an address in the database is never enough for Ready", () => {
    it("reports routing setup required with a configured address and no arrivals", () => {
        const receive = receiveOf(evaluateBindingReadiness(emailBinding(), healthy));
        expect(receive.state).toBe("routing_setup_required");
    });

    it("says the destination is missing when no route is on file", () => {
        const receive = receiveOf(evaluateBindingReadiness(emailBinding(), healthy));
        expect(receive.detail).toContain("no delivery destination");
    });

    it("WAITS for routed email when a destination exists but nothing has arrived", () => {
        // Two different unfinished states, two different next actions, and two
        // different people owed work. Collapsing them tells an administrator to
        // create something that already exists.
        const receive = receiveOf(
            evaluateBindingReadiness(emailBinding(), {
                ...healthy,
                ingress: { destination: HIDDEN_DESTINATION, lastInboundAt: null },
            })
        );
        expect(receive.state).toBe("awaiting_routed_email");
        expect(receive.detail).toContain("destination is ready");
        expect(receive.detail).toContain("mail provider");
    });

    it("distinguishes NO destination from a destination awaiting mail", () => {
        // The progression the product promises:
        //   no destination -> Routing setup required
        //   destination, nothing arrived -> Waiting for routed email
        //   arrival -> Connected
        const none = receiveOf(evaluateBindingReadiness(emailBinding(), healthy));
        const waiting = receiveOf(
            evaluateBindingReadiness(emailBinding(), {
                ...healthy,
                ingress: { destination: HIDDEN_DESTINATION, lastInboundAt: null },
            })
        );
        const connected = receiveOf(
            evaluateBindingReadiness(emailBinding(), {
                ...healthy,
                ingress: { destination: HIDDEN_DESTINATION, lastInboundAt: OBSERVED_AT },
            })
        );
        expect([none.state, waiting.state, connected.state]).toEqual([
            "routing_setup_required",
            "awaiting_routed_email",
            "ready",
        ]);
        expect(readinessLabel("awaiting_routed_email")).toBe("Waiting for routed email");
    });

    it("NEVER renders the hidden destination in operator-facing copy", () => {
        const receive = receiveOf(
            evaluateBindingReadiness(emailBinding(), {
                ...healthy,
                ingress: { destination: HIDDEN_DESTINATION, lastInboundAt: null },
            })
        );
        expect(receive.detail).not.toContain(HIDDEN_DESTINATION);
        expect(receive.detail).not.toContain("resend.app");
        // It names the VISIBLE identity instead — the address the operator knows.
        expect(receive.detail).toContain("kelly@workwithalloy.com");
    });
});

describe("observed inbound is the only thing that turns receiving green", () => {
    it("is ready once a message has actually arrived at the route", () => {
        const receive = receiveOf(
            evaluateBindingReadiness(emailBinding(), {
                ...healthy,
                ingress: { destination: HIDDEN_DESTINATION, lastInboundAt: OBSERVED_AT },
            })
        );
        expect(receive.state).toBe("ready");
        expect(receive.detail).toContain("Last inbound verified");
        expect(receive.detail).toContain(OBSERVED_AT);
    });

    it("counts canonical history, so a WORKING direct configuration is not called unproven", () => {
        // Introducing the route model must not report an arrangement that has
        // been receiving mail for months as broken. A message that genuinely
        // arrived is evidence whichever table recorded it.
        const receive = receiveOf(
            evaluateBindingReadiness(emailBinding(), { ...healthy, observedInboundAt: OBSERVED_AT })
        );
        expect(receive.state).toBe("ready");
    });

    it("still refuses Ready with no credential, even after an observed arrival", () => {
        // Ownership resolves without a credential; the BODY is fetched with one.
        // An observation does not make an unretrievable message retrievable.
        const receive = receiveOf(
            evaluateBindingReadiness(emailBinding({ secret_ref: "unconfigured" }), {
                approvedConnectionAvailable: true,
                observedInboundAt: OBSERVED_AT,
            })
        );
        expect(receive.state).toBe("setup_required");
    });

    it("still refuses Ready with no visible identity at all", () => {
        const receive = receiveOf(
            evaluateBindingReadiness(emailBinding({ inbound_address: null }), {
                ...healthy,
                observedInboundAt: OBSERVED_AT,
            })
        );
        expect(receive.state).toBe("setup_required");
    });

    it("a disabled channel is switched off, not awaiting routing", () => {
        const receive = receiveOf(
            evaluateBindingReadiness(emailBinding({ status: "disabled" }), {
                ...healthy,
                observedInboundAt: OBSERVED_AT,
            })
        );
        expect(receive.state).toBe("disabled");
    });
});

describe("the live-certified SMS runtime is untouched", () => {
    it("SMS receiving is ready on a configured number, with no observation required", () => {
        // Deliberate asymmetry, and it is not laziness. SMS inbound arrives on a
        // signed webhook at a number the provider owns end to end; no third party
        // holds a forwarding rule that could silently disappear. Email under
        // selective routing does have exactly such a third party.
        const receive = receiveOf(evaluateBindingReadiness(smsBinding(), healthy));
        expect(receive.state).toBe("ready");
    });

    it("SMS is unaffected by ingress inputs, which are email-only", () => {
        const receive = receiveOf(
            evaluateBindingReadiness(smsBinding(), {
                ...healthy,
                ingress: { destination: HIDDEN_DESTINATION, lastInboundAt: null },
            })
        );
        expect(receive.state).toBe("ready");
    });
});

describe("the new state is operator-facing English", () => {
    it("has a label, and it is not the enum", () => {
        expect(readinessLabel("routing_setup_required")).toBe("Routing setup required");
    });
});
