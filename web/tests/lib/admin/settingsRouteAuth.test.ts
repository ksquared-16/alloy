import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    isCanonicalSettingsPath,
    isOperatorAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";
import {
    isSettingsCompatibilityPath,
    OPERATOR_SESSION_GATE_EXAMPLES,
    requiresOperatorSession,
} from "@/lib/admin/operatorSessionGate";

describe("operator session gate — settings auth parity with workspace", () => {
    it("requires session for workspace paths", () => {
        for (const path of OPERATOR_SESSION_GATE_EXAMPLES.workspace) {
            expect(requiresOperatorSession(path)).toBe(true);
            expect(isOperatorAdminPath(path)).toBe(true);
        }
    });

    it("requires session for canonical /settings paths", () => {
        for (const path of OPERATOR_SESSION_GATE_EXAMPLES.settings) {
            expect(requiresOperatorSession(path)).toBe(true);
            expect(isOperatorAdminPath(path)).toBe(true);
            expect(isCanonicalSettingsPath(path)).toBe(true);
        }
    });

    it("requires session for /admin/settings compatibility redirects", () => {
        for (const path of OPERATOR_SESSION_GATE_EXAMPLES.settingsCompatibility) {
            expect(requiresOperatorSession(path)).toBe(true);
            expect(isSettingsCompatibilityPath(path)).toBe(true);
            expect(isOperatorAdminPath(path)).toBe(true);
        }
    });

    it("does not require session for public routes", () => {
        expect(requiresOperatorSession("/login")).toBe(false);
        expect(requiresOperatorSession("/")).toBe(false);
        expect(requiresOperatorSession("/api/webhooks/twilio/sms-status")).toBe(false);
    });

    it("middleware uses requiresOperatorSession gate", () => {
        const root = resolve(__dirname, "../../..");
        const middleware = readFileSync(resolve(root, "middleware.ts"), "utf8");
        expect(middleware).toContain("requiresOperatorSession");
        expect(middleware).toContain("operatorLoginRedirectPath");
    });

    it("settings layout redirects unauthenticated users to login", () => {
        const root = resolve(__dirname, "../../..");
        const layout = readFileSync(resolve(root, "app/adminV2/settings/layout.tsx"), "utf8");
        expect(layout).toContain('redirect("/login")');
        expect(layout).toContain('redirect("/unauthorized")');
    });
});
