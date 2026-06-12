import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("composer dark + send-free", () => {
    const src = readFileSync(join(process.cwd(), "app", "adminV2", "communications", "composer", "ComposerV2.tsx"), "utf8");
    it("self-gates behind comms_v2_composer and renders null when off", () => {
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_composer["']\)/);
        expect(src).toMatch(/return null/);
    });
    it("sends via the canonical endpoint on click only — no direct enqueue, no auto-send", () => {
        expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutboundMessage/);
        if (/\/api\/admin\/communications\/send/.test(src)) {
            expect(src).toMatch(/onClick=\{handleSend\}/);
            expect(src).not.toMatch(/useEffect\([^)]*handleSend/);
        }
    });
});
