import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** PKG-10 — assign route must be DARK, authenticated, audited, and send-free. */
describe("assign route guard", () => {
    const src = readFileSync(
        join(process.cwd(), "app", "api", "admin", "communications", "conversations", "[id]", "assign", "route.ts"),
        "utf8"
    );
    it("gated behind comms_v2_assignment (404 when off)", () => {
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_assignment["']\)/);
        expect(src).toMatch(/status:\s*404/);
    });
    it("requires admin/ops", () => {
        expect(src).toMatch(/requireAdminOrOps/);
    });
    it("writes an immutable assignment audit row", () => {
        expect(src).toMatch(/conversation_assignment_events/);
        expect(src).toMatch(/\.insert\(/);
    });
    it("performs no send", () => {
        expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutboundMessage/);
    });
});
