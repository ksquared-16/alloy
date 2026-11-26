/**
 * An organization that connected its own provider account must read as connected.
 *
 * THE DEFECT. The Director connected Resend on hosted staging. It worked: an
 * org-owned account was created, verified, healthy; a credential was stored; the
 * Email binding pointed at it. The card still said **Not connected**.
 *
 * `approvedConnectionAvailable` was computed only from deployment environment
 * variables. A self-service deployment holds none by definition — that is the
 * whole point — so the catalogue reported nothing available and readiness
 * concluded `none_approved`. The connection existed and the surface denied it.
 */

import { describe, expect, it } from "vitest";

import { evaluateBindingReadiness } from "@/lib/communications/bindingReadiness";
import { buildChannelCards, type BindingView } from "@/lib/communications/organizationCommunicationsModel";
import type { BindingSummary } from "@/lib/communications/composerChannels";

type Row = BindingSummary & { inbound_address?: string | null };

/** Exactly the Director's row: an org-owned credential, no deployment key. */
function orgOwnedBinding(over: Partial<Row> = {}): Row {
    return {
        id: "b-email",
        channel: "email",
        provider: "resend",
        status: "active",
        secret_ref: "vault:11111111-1111-4111-8111-111111111111",
        inbound_address: "kelly@example.test",
        config: { from_email: "kelly@example.test" },
        ...over,
    } as Row;
}

describe("a deployment with no provider keys of its own", () => {
    it("reports CONFIGURED when the organization connected its own account", () => {
        const r = evaluateBindingReadiness(orgOwnedBinding(), {
            credentialAvailable: true,
            // The route now includes org-owned connections here. Before the fix
            // this was false, and the card said "Not connected".
            approvedConnectionAvailable: true,
        });
        expect(r.providerConnection).toBe("configured");
    });

    it("REGRESSION: the old computation produced `none_approved` for the same row", () => {
        const r = evaluateBindingReadiness(orgOwnedBinding(), {
            credentialAvailable: true,
            approvedConnectionAvailable: false,
        });
        // Pinned so the failure mode is legible if the route ever stops counting
        // organization-owned connections.
        expect(r.providerConnection).toBe("none_approved");
    });
});

describe("the card names the account, so an administrator knows what is connected", () => {
    const binding: BindingView = {
        id: "b-sms",
        channel: "sms",
        provider: "twilio",
        status: "active",
        is_primary: true,
        inbound_to_e164: "+15412408863",
        readiness: {
            send: { state: "ready", detail: "Ready." },
            receive: { state: "ready", detail: "Ready." },
            providerConnection: "configured",
        },
    };

    it("shows a platform-managed account AS platform-managed", () => {
        // The Director saw "SMS · Connected" and could not tell whose Twilio
        // account it was, nor that it was not theirs to change.
        const card = buildChannelCards([binding], [], undefined, [
            { channel: "sms", provider: "twilio", label: "Primary SMS", owner: "platform", connected: true },
        ]).find((c) => c.channel === "sms")!;
        expect(card.providerAccount).toEqual({
            providerLabel: "Twilio",
            label: "Primary SMS",
            owner: "platform",
            connected: true,
        });
    });

    it("prefers the ORGANIZATION's account when both exist — it is the actionable one", () => {
        const card = buildChannelCards([binding], [], undefined, [
            { channel: "sms", provider: "twilio", label: "Primary SMS", owner: "platform", connected: true },
            { channel: "sms", provider: "twilio", label: "Our Twilio", owner: "organization", connected: true },
        ]).find((c) => c.channel === "sms")!;
        expect(card.providerAccount?.owner).toBe("organization");
        expect(card.providerAccount?.label).toBe("Our Twilio");
    });

    it("is null when nothing is connected, rather than inventing an account", () => {
        const card = buildChannelCards([binding], [], undefined, []).find((c) => c.channel === "sms")!;
        expect(card.providerAccount).toBeNull();
    });

    it("never carries a credential or a reference", () => {
        const card = buildChannelCards([binding], [], undefined, [
            { channel: "sms", provider: "twilio", label: "Primary SMS", owner: "platform", connected: true },
        ]).find((c) => c.channel === "sms")!;
        const serialized = JSON.stringify(card.providerAccount);
        for (const forbidden of ["vault:", "env:", "secret_ref", "TWILIO_AUTH_TOKEN"]) {
            expect(serialized).not.toContain(forbidden);
        }
    });
});
