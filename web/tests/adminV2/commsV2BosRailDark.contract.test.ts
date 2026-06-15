import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("PKG-18E BOS rail intelligence dark + doctrine", () => {
    const src = readFileSync(join(process.cwd(), "app", "adminV2", "communications", "bos", "CommunicationsRailIntelligence.tsx"), "utf8");
    it("self-gates behind comms_v2_bos", () => {
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_bos["']\)/);
        expect(src).toMatch(/return null/);
    });
    it("is review-first: no send/enqueue, no auto-send", () => {
        expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutboundMessage|\/communications\/send/);
    });
    it("renders rail cards", () => {
        expect(src).toMatch(/data-cc-bos-card/);
    });
});
