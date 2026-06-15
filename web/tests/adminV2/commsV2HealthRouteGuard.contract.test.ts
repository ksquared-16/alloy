import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** PKG-09 — the health API must be DARK (flag-gated) and authenticated, with no send path. */
describe("health route guard", () => {
    const src = readFileSync(
        join(process.cwd(), "app", "api", "admin", "communications", "health", "route.ts"),
        "utf8"
    );
    it("is gated behind comms_v2_command_center returning 404 when off", () => {
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_command_center["']\)/);
        expect(src).toMatch(/status:\s*404/);
    });
    it("requires admin/org context", () => {
        expect(src).toMatch(/requireAdminOrgContextLight/);
    });
    it("performs no send / enqueue", () => {
        expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutboundMessage/);
    });
});
