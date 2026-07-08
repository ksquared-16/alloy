import { describe, expect, it } from "vitest";
import {
    isReusableOutboundBindingsSnapshot,
    resolveDrawerComposerEmailAvailability,
    resolveDrawerComposerSmsAvailability,
} from "@/lib/communications/drawerComposerChannelAvailability";

const kelly = {
    person_id: "1624a9ea-c295-43fb-8523-98827dc7f731",
    email: "kelly.kurzman@gmail.com",
    phone: "+16022904816",
};
const kristi = {
    person_id: "0e850943-2d68-46c7-8008-d24a389cff07",
    email: null,
    phone: null,
};

describe("isReusableOutboundBindingsSnapshot", () => {
    it("rejects email-only snapshots that can hide SMS activation", () => {
        expect(isReusableOutboundBindingsSnapshot(["email", "in_app"])).toBe(false);
        expect(isReusableOutboundBindingsSnapshot(["email"])).toBe(false);
    });

    it("accepts SMS-ready outbound snapshots", () => {
        expect(isReusableOutboundBindingsSnapshot(["email", "sms", "in_app"])).toBe(true);
        expect(isReusableOutboundBindingsSnapshot(["sms"])).toBe(true);
    });
});

describe("resolveDrawerComposerSmsAvailability", () => {
    it("enables SMS when provider is ready and selected recipient has a valid phone", () => {
        const r = resolveDrawerComposerSmsAvailability({
            smsProviderReady: true,
            recipients: [kelly, kristi],
            selectedRecipientIds: new Set([kelly.person_id]),
        });
        expect(r).toEqual({ available: true, reason: null });
    });

    it("does not disable SMS because another household member lacks email", () => {
        const r = resolveDrawerComposerSmsAvailability({
            smsProviderReady: true,
            recipients: [kelly, kristi],
            selectedRecipientIds: new Set([kelly.person_id]),
        });
        expect(r.available).toBe(true);
        expect(r.reason).toBeNull();
    });

    it("disables SMS with No phone on file when selected recipient has no phone", () => {
        const r = resolveDrawerComposerSmsAvailability({
            smsProviderReady: true,
            recipients: [kelly, kristi],
            selectedRecipientIds: new Set([kristi.person_id]),
        });
        expect(r).toEqual({ available: false, reason: "No phone on file." });
    });

    it("disables SMS when provider binding is not ready", () => {
        const r = resolveDrawerComposerSmsAvailability({
            smsProviderReady: false,
            recipients: [kelly],
            selectedRecipientIds: new Set([kelly.person_id]),
        });
        expect(r.available).toBe(false);
        expect(r.reason).toMatch(/not configured/i);
    });
});

describe("resolveDrawerComposerEmailAvailability", () => {
    it("keeps email available for Kelly even when Kristi has no email", () => {
        const r = resolveDrawerComposerEmailAvailability({
            emailProviderReady: true,
            recipients: [kelly, kristi],
            selectedRecipientIds: new Set([kelly.person_id]),
        });
        expect(r).toEqual({ available: true, reason: null });
    });

    it("disables email for Kristi with No email on file without affecting SMS helper", () => {
        const email = resolveDrawerComposerEmailAvailability({
            emailProviderReady: true,
            recipients: [kelly, kristi],
            selectedRecipientIds: new Set([kristi.person_id]),
        });
        const sms = resolveDrawerComposerSmsAvailability({
            smsProviderReady: true,
            recipients: [kelly, kristi],
            selectedRecipientIds: new Set([kelly.person_id]),
        });
        expect(email).toEqual({ available: false, reason: "No email on file." });
        expect(sms.available).toBe(true);
    });
});
