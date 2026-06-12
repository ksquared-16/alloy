import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** PKG-18A — consent enforcement is wired into the send path but DARK (only under comms_v2_compliance). */
describe("send-time consent enforcement wiring", () => {
    const src = readFileSync(join(process.cwd(), "lib", "communications", "executeCommunicationsSend.ts"), "utf8");
    const consentCallIdx = src.indexOf("enforceConsentForSend({");
    const enqueueCallIdx = src.indexOf("enqueueCanonicalOutboundMessage("); // call site has a paren; import does not

    it("imports the enforcement helper + flag", () => {
        expect(src).toMatch(/import \{ enforceConsentForSend \} from "@\/lib\/communications\/v2\/consentEnforcement"/);
        expect(src).toMatch(/import \{ isCommsV2FlagEnabled \} from "@\/lib\/communications\/v2\/flags"/);
    });
    it("gates enforcement behind comms_v2_compliance (no-op when off)", () => {
        const flagIdx = src.indexOf('isCommsV2FlagEnabled("comms_v2_compliance")');
        expect(flagIdx).toBeGreaterThan(-1);
        expect(consentCallIdx).toBeGreaterThan(flagIdx); // the single call sits inside the flag guard
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
