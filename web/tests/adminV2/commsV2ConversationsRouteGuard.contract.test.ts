import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** ACT-1 — conversations route must be DARK, authed, read-only (no send). */
describe("conversations route guard", () => {
    const src = readFileSync(join(process.cwd(), "app", "api", "admin", "communications", "conversations", "route.ts"), "utf8");
    it("gated behind comms_v2_command_center (404 when off)", () => {
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_command_center["']\)/);
        expect(src).toMatch(/status:\s*404/);
    });
    it("requires admin/org context and returns conversations", () => {
        expect(src).toMatch(/requireAdminOrgContextLight/);
        expect(src).toMatch(/conversations/);
    });
    it("is read-only (no send/enqueue/mutation)", () => {
        expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutboundMessage|\.insert\(|\.update\(|\.delete\(/);
    });
});
