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
});
