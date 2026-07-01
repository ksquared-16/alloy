import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("deliverability dark", () => {
    const route = readFileSync(join(process.cwd(), "app", "api", "admin", "communications", "deliverability", "route.ts"), "utf8");
    const dash = readFileSync(join(process.cwd(), "app", "adminV2", "communications", "deliverability", "DeliverabilityDashboard.tsx"), "utf8");
    it("route gated behind comms_v2_deliverability + authed + send-free", () => {
        expect(route).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_deliverability["']\)/);
        expect(route).toMatch(/status:\s*404/);
        expect(route).toMatch(/requireAdminOrgContextLight/);
        expect(route).not.toMatch(/executeCommunicationsSend/);
    });
    it("dashboard self-gates + shows domain/carrier", () => {
        expect(dash).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_deliverability["']\)/);
        expect(dash).toMatch(/return null/);
        expect(dash).toMatch(/data-cc-metric="domain-auth"/);
    });
});
