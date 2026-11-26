import { describe, expect, it } from "vitest";
import { resendEmailAdapter } from "@/lib/communications/v2/providers/resendEmailAdapter";
import { twilioSmsAdapter } from "@/lib/communications/v2/providers/twilioSmsAdapter";
import { googleWorkspaceAdapter, microsoft365Adapter } from "@/lib/communications/v2/providers/deferredAdapters";
import { resolveProviderAdapter, isV1Provider } from "@/lib/communications/v2/providers/registry";

/** PKG-06 — provider abstraction: adapters normalize provider-specifics to the canonical vocabulary. */
describe("provider status event mapping", () => {
    it("resend → canonical", () => {
        expect(resendEmailAdapter.mapStatusEvent("email.delivered")).toBe("delivered");
        expect(resendEmailAdapter.mapStatusEvent("email.opened")).toBe("opened");
        expect(resendEmailAdapter.mapStatusEvent("email.clicked")).toBe("clicked");
        expect(resendEmailAdapter.mapStatusEvent("email.bounced")).toBe("bounced");
        expect(resendEmailAdapter.mapStatusEvent("email.complained")).toBe("complaint");
        expect(resendEmailAdapter.mapStatusEvent("email.unknown")).toBeNull();
    });
    it("twilio → canonical", () => {
        expect(twilioSmsAdapter.mapStatusEvent("delivered")).toBe("delivered");
        expect(twilioSmsAdapter.mapStatusEvent("undelivered")).toBe("failed");
        expect(twilioSmsAdapter.mapStatusEvent("failed")).toBe("failed");
        expect(twilioSmsAdapter.mapStatusEvent("received")).toBe("inbound");
        expect(twilioSmsAdapter.mapStatusEvent("nope")).toBeNull();
    });
});

describe("provider inbound normalization", () => {
    it("resend email", () => {
    });
    it("twilio sms", () => {
    });
});

describe("provider registry", () => {
    it("resolves V1 providers + deferred + unknown", () => {
        expect(resolveProviderAdapter("resend")).toBe(resendEmailAdapter);
        expect(resolveProviderAdapter("twilio")).toBe(twilioSmsAdapter);
        expect(resolveProviderAdapter("GOOGLE")).toBe(googleWorkspaceAdapter);
        expect(resolveProviderAdapter("microsoft")).toBe(microsoft365Adapter);
        expect(resolveProviderAdapter("nope")).toBeNull();
    });
    it("flags only Resend/Twilio as V1 providers", () => {
        expect(isV1Provider("resend")).toBe(true);
        expect(isV1Provider("twilio")).toBe(true);
        expect(isV1Provider("google")).toBe(false);
        expect(isV1Provider("microsoft")).toBe(false);
    });
    it("deferred adapters throw until V1.5", () => {
        expect(() => googleWorkspaceAdapter.mapStatusEvent("x")).toThrow(/V2\.5/);
    });
});
