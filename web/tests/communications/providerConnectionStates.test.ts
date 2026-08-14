/**
 * What an administrator is told when a channel cannot run.
 *
 * The defect: an admin could set a From address, a reply address and an SMS
 * number, and still be told only "The credential this channel uses is not
 * available in this deployment. Ask your administrator to restore it." — the SAME
 * sentence for sending and receiving, with no approved connection to choose and
 * no action inside Alloy that could produce one. It was diagnostic, not
 * actionable, and it was addressed to the wrong person.
 *
 * These tests pin the two things that fixes it: `none_approved` is distinct from
 * `unavailable` because a DIFFERENT person has to act, and the two directions
 * never share one sentence again.
 */

import { describe, expect, it } from "vitest";

import { evaluateBindingReadiness } from "@/lib/communications/bindingReadiness";
import type { BindingSummary } from "@/lib/communications/composerChannels";

type Row = BindingSummary & { inbound_address?: string | null };

function emailBinding(over: Partial<Row> = {}): Row {
    return {
        id: "b-email",
        channel: "email",
        provider: "resend",
        status: "active",
        secret_ref: "env:RESEND_API_KEY",
        inbound_address: "families@reply.example.com",
        config: { from_email: "hello@example.com" },
        ...over,
    } as Row;
}

function smsBinding(over: Partial<Row> = {}): Row {
    return {
        id: "b-sms",
        channel: "sms",
        provider: "twilio",
        status: "active",
        secret_ref: "env:TWILIO_AUTH_TOKEN",
        inbound_to_e164: "+15550001111",
        ...over,
    } as Row;
}

describe("the deployment offers no approved connection at all", () => {
    it("is its own state — not merely `unavailable`", () => {
        const r = evaluateBindingReadiness(emailBinding(), {
            credentialAvailable: false,
            approvedConnectionAvailable: false,
        });
        expect(r.providerConnection).toBe("none_approved");
    });

    it("names the person who can actually act, and says it cannot be done here", () => {
        const r = evaluateBindingReadiness(emailBinding(), {
            credentialAvailable: false,
            approvedConnectionAvailable: false,
        });
        expect(r.send.detail).toMatch(/Alloy administrator/i);
        expect(r.send.detail).toMatch(/cannot be completed from here/i);
    });

    it("does NOT tell the operator to choose another connection — there is none", () => {
        const r = evaluateBindingReadiness(smsBinding(), {
            credentialAvailable: false,
            approvedConnectionAvailable: false,
        });
        expect(r.send.detail).not.toMatch(/choose another/i);
    });

    it("outranks `unavailable`, because a dead end is the more actionable truth", () => {
        // Credential referenced but absent AND nothing else on offer.
        const r = evaluateBindingReadiness(emailBinding(), {
            credentialAvailable: false,
            approvedConnectionAvailable: false,
        });
        expect(r.providerConnection).not.toBe("unavailable");
    });
});

describe("a connection was chosen but this deployment lost it", () => {
    it("is `unavailable`, and DOES offer choosing another", () => {
        const r = evaluateBindingReadiness(emailBinding(), {
            credentialAvailable: false,
            approvedConnectionAvailable: true,
        });
        expect(r.providerConnection).toBe("unavailable");
        expect(r.send.detail).toMatch(/another approved connection/i);
    });
});

describe("sending and receiving never share one sentence again", () => {
    it.each([
        ["none_approved", { credentialAvailable: false, approvedConnectionAvailable: false }],
        ["unavailable", { credentialAvailable: false, approvedConnectionAvailable: true }],
    ] as const)("%s explains each direction differently", (_label, options) => {
        for (const binding of [emailBinding(), smsBinding()]) {
            const r = evaluateBindingReadiness(binding, options);
            expect(r.send.detail).not.toBe(r.receive.detail);
        }
    });

    it("tells an email operator their mail is waiting, not lost", () => {
        const r = evaluateBindingReadiness(emailBinding(), {
            credentialAvailable: false,
            approvedConnectionAvailable: false,
        });
        expect(r.receive.detail).toMatch(/not lost/i);
        expect(r.receive.detail).toMatch(/waits at the provider/i);
        // The sending half must not claim anything about waiting mail.
        expect(r.send.detail).not.toMatch(/waits at the provider/i);
    });

    it("tells an SMS operator inbound is refused, which is the opposite of waiting", () => {
        const r = evaluateBindingReadiness(smsBinding(), {
            credentialAvailable: false,
            approvedConnectionAvailable: false,
        });
        expect(r.receive.detail).toMatch(/not accepted/i);
    });

    it("names the right provider per channel", () => {
        const email = evaluateBindingReadiness(emailBinding(), {
            credentialAvailable: false,
            approvedConnectionAvailable: false,
        });
        const sms = evaluateBindingReadiness(smsBinding(), {
            credentialAvailable: false,
            approvedConnectionAvailable: false,
        });
        expect(email.send.detail).toMatch(/Resend/);
        expect(email.send.detail).not.toMatch(/Twilio/);
        expect(sms.send.detail).toMatch(/Twilio/);
        expect(sms.send.detail).not.toMatch(/Resend/);
    });
});

describe("the old copy is gone", () => {
    it.each([
        [{ credentialAvailable: false, approvedConnectionAvailable: false }],
        [{ credentialAvailable: false, approvedConnectionAvailable: true }],
    ])("no direction says 'Ask your administrator to restore it' verbatim", (options) => {
        const r = evaluateBindingReadiness(emailBinding(), options);
        for (const d of [r.send.detail, r.receive.detail]) {
            expect(d).not.toMatch(/nothing can be sent or received/i);
        }
    });
});

describe("nothing regressed for callers that cannot observe the catalogue", () => {
    it("omitting `approvedConnectionAvailable` keeps the previous behaviour", () => {
        const r = evaluateBindingReadiness(emailBinding(), { credentialAvailable: false });
        expect(r.providerConnection).toBe("unavailable");
    });

    it("a healthy binding is still ready in both directions", () => {
        const r = evaluateBindingReadiness(emailBinding(), {
            credentialAvailable: true,
            approvedConnectionAvailable: true,
        });
        expect(r.providerConnection).toBe("configured");
        expect(r.send.state).toBe("ready");
        expect(r.receive.state).toBe("ready");
    });

    it("a disabled channel still reads as switched off, not as a provider fault", () => {
        const r = evaluateBindingReadiness(emailBinding({ status: "disabled" }), {
            credentialAvailable: false,
            approvedConnectionAvailable: false,
        });
        expect(r.send.state).toBe("disabled");
        expect(r.send.detail).toMatch(/switched off/i);
    });

    it("no secret or secret reference appears in any operator-facing sentence", () => {
        for (const options of [
            { credentialAvailable: false, approvedConnectionAvailable: false },
            { credentialAvailable: false, approvedConnectionAvailable: true },
        ]) {
            for (const binding of [emailBinding(), smsBinding()]) {
                const r = evaluateBindingReadiness(binding, options);
                for (const d of [r.send.detail, r.receive.detail]) {
                    expect(d).not.toMatch(/env:/i);
                    expect(d).not.toMatch(/secret_ref/i);
                    expect(d).not.toMatch(/RESEND_API_KEY|TWILIO_AUTH_TOKEN/);
                }
            }
        }
    });
});
