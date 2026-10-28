import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PKG-18A — consent enforcement is wired into outbound send paths but DARK
 * (only under `comms_v2_compliance`).
 *
 * Slice 5 repair: the previous contract pointed at deleted
 * `lib/communications/executeCommunicationsSend.ts` (renamed to the legacy
 * adapter). Current send-time consent sites:
 *   - `executeLegacyCommunicationsSendAdapter.ts` (scheduled sends / family note)
 *   - `app/api/admin/communications/family-send/route.ts` (canonical family send)
 * Canonical provider-bound external routes use `canonicalSend`; family-send
 * enforces consent before calling it when the flag is on.
 */
const root = process.cwd();

function load(rel: string): string {
    return readFileSync(join(root, ...rel.split("/")), "utf8");
}

describe("send-time consent enforcement wiring — legacy adapter", () => {
    const src = load("lib/communications/executeLegacyCommunicationsSendAdapter.ts");
    const consentCallIdx = src.indexOf("enforceConsentForSend({");
    const enqueueCallIdx = src.indexOf("enqueueCanonicalOutboundMessage(");

    it("imports the enforcement helper + flag", () => {
        expect(src).toMatch(/import \{ enforceConsentForSend \} from "@\/lib\/communications\/v2\/consentEnforcement"/);
        expect(src).toMatch(/import \{ isCommsV2FlagEnabled \} from "@\/lib\/communications\/v2\/flags"/);
    });

    it("gates enforcement behind comms_v2_compliance (no-op when off)", () => {
        const flagIdx = src.indexOf('isCommsV2FlagEnabled("comms_v2_compliance")');
        expect(flagIdx).toBeGreaterThan(-1);
        expect(consentCallIdx).toBeGreaterThan(flagIdx);
        expect(src.split("enforceConsentForSend({").length - 1).toBe(1);
    });

    it("blocks with the existing failure shape (consent_blocked, status 403)", () => {
        expect(src).toMatch(/code:\s*["']consent_blocked["']/);
        expect(src).toMatch(/status:\s*403/);
    });

    it("runs before the canonical enqueue CALL", () => {
        expect(consentCallIdx).toBeGreaterThan(-1);
        expect(enqueueCallIdx).toBeGreaterThan(-1);
        expect(consentCallIdx).toBeLessThan(enqueueCallIdx);
    });
});

describe("send-time consent enforcement wiring — family-send", () => {
    const src = load("app/api/admin/communications/family-send/route.ts");

    it("imports the enforcement helper + flag", () => {
        expect(src).toMatch(/import \{ enforceConsentForSend \} from "@\/lib\/communications\/v2\/consentEnforcement"/);
        expect(src).toMatch(/import \{ isCommsV2FlagEnabled \} from "@\/lib\/communications\/v2\/flags"/);
    });

    it("gates enforcement behind comms_v2_compliance", () => {
        expect(src).toMatch(/isCommsV2FlagEnabled\("comms_v2_compliance"\)/);
        expect(src).toMatch(/const enforceConsent = isCommsV2FlagEnabled\("comms_v2_compliance"\)/);
        expect(src).toContain("enforceConsentForSend({");
    });

    it("wires consent into orchestrateFamilySend before canonicalSend", () => {
        const consentIdx = src.indexOf("enforceConsentForSend({");
        const sendIdx = src.indexOf("canonicalSend({");
        expect(consentIdx).toBeGreaterThan(-1);
        expect(sendIdx).toBeGreaterThan(-1);
        expect(consentIdx).toBeLessThan(sendIdx);
    });
});
