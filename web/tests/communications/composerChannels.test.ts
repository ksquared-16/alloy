import { describe, expect, it } from "vitest";
import {
    availableComposerChannels,
    bindingEligibleForOutboundComposer,
    type BindingSummary,
} from "@/lib/communications/composerChannels";

describe("bindingEligibleForOutboundComposer", () => {
    it("requires Resend for email even when secret_ref is set", () => {
        const b: BindingSummary = {
            id: "1",
            channel: "email",
            provider: "sendgrid",
            status: "active",
            secret_ref: "env:SENDGRID_KEY",
        };
        expect(bindingEligibleForOutboundComposer(b)).toBe(false);
        expect(availableComposerChannels([b]).includes("email")).toBe(false);
    });

    it("accepts active Resend email with configured secret ref", () => {
        const b: BindingSummary = {
            id: "2",
            channel: "email",
            provider: "resend",
            status: "active",
            secret_ref: "env:RESEND_API_KEY",
        };
        expect(bindingEligibleForOutboundComposer(b)).toBe(true);
        expect(availableComposerChannels([b]).includes("email")).toBe(true);
    });

    it("rejects inactive rows", () => {
        const b: BindingSummary = {
            id: "3",
            channel: "email",
            provider: "resend",
            status: "paused",
            secret_ref: "env:RESEND_API_KEY",
        };
        expect(bindingEligibleForOutboundComposer(b)).toBe(false);
    });

    it("accepts active Twilio SMS with configured secret ref", () => {
        const b: BindingSummary = {
            id: "4",
            channel: "sms",
            provider: "twilio",
            status: "active",
            secret_ref: "env:TWILIO_AUTH_TOKEN",
        };
        expect(bindingEligibleForOutboundComposer(b)).toBe(true);
        expect(availableComposerChannels([b]).includes("sms")).toBe(true);
    });

    it("rejects SMS when secret_ref is unconfigured or provider is not Twilio", () => {
        const unconfigured: BindingSummary = {
            id: "5",
            channel: "sms",
            provider: "twilio",
            status: "active",
            secret_ref: "unconfigured",
        };
        const wrongProvider: BindingSummary = {
            id: "6",
            channel: "sms",
            provider: "vonage",
            status: "active",
            secret_ref: "env:TWILIO_AUTH_TOKEN",
        };
        expect(bindingEligibleForOutboundComposer(unconfigured)).toBe(false);
        expect(bindingEligibleForOutboundComposer(wrongProvider)).toBe(false);
        expect(availableComposerChannels([unconfigured, wrongProvider]).includes("sms")).toBe(false);
    });

    it("rejects pending_verification SMS even with secret ref", () => {
        const b: BindingSummary = {
            id: "7",
            channel: "sms",
            provider: "twilio",
            status: "pending_verification",
            secret_ref: "env:TWILIO_AUTH_TOKEN",
        };
        expect(bindingEligibleForOutboundComposer(b)).toBe(false);
        expect(availableComposerChannels([b]).includes("sms")).toBe(false);
    });
});
