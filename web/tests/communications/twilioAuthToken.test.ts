import { describe, expect, it } from "vitest";
import { resolveTwilioAuthTokenFromSecretRef } from "@/lib/communications/twilioAuthToken";

const GLOBAL = "global-token";

describe("P3 twilio auth token resolution", () => {
    it("uses global token for empty/unconfigured/legacy/unknown secret_ref", () => {
        for (const ref of [null, "", "unconfigured", "legacy_global_twilio", "vault://weird"]) {
            expect(resolveTwilioAuthTokenFromSecretRef(ref, {}, GLOBAL)).toBe(GLOBAL);
        }
    });

    it("resolves env:* to the env var value (per-tenant subaccount token)", () => {
        expect(
            resolveTwilioAuthTokenFromSecretRef("env:LOC_A_TWILIO_TOKEN", { LOC_A_TWILIO_TOKEN: "subacct-A" }, GLOBAL),
        ).toBe("subacct-A");
    });

    it("falls back to global when the env var is unset or blank", () => {
        expect(resolveTwilioAuthTokenFromSecretRef("env:MISSING", {}, GLOBAL)).toBe(GLOBAL);
        expect(resolveTwilioAuthTokenFromSecretRef("env:BLANK", { BLANK: "   " }, GLOBAL)).toBe(GLOBAL);
        expect(resolveTwilioAuthTokenFromSecretRef("env:", {}, GLOBAL)).toBe(GLOBAL);
    });

    it("returns null only when neither env nor global is available", () => {
        expect(resolveTwilioAuthTokenFromSecretRef("env:MISSING", {}, null)).toBeNull();
        expect(resolveTwilioAuthTokenFromSecretRef("legacy_global_twilio", {}, "")).toBeNull();
    });
});
