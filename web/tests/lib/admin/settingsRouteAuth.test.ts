import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    isCanonicalSettingsPath,
    isOperatorAdminPath,
    isPublicMarketingChromeSuppressedPath,
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

describe("settings app shell — marketing chrome suppression", () => {
    it("suppresses marketing chrome for canonical /settings paths", () => {
        for (const path of OPERATOR_SESSION_GATE_EXAMPLES.settings) {
            expect(isPublicMarketingChromeSuppressedPath(path)).toBe(true);
            expect(isCanonicalSettingsPath(path)).toBe(true);
        }
    });

    it("suppresses marketing chrome for /admin/settings compatibility paths", () => {
        for (const path of OPERATOR_SESSION_GATE_EXAMPLES.settingsCompatibility) {
            expect(isPublicMarketingChromeSuppressedPath(path)).toBe(true);
        }
    });

    it("suppresses marketing chrome for workspace parity paths", () => {
        for (const path of OPERATOR_SESSION_GATE_EXAMPLES.workspace) {
            expect(isPublicMarketingChromeSuppressedPath(path)).toBe(true);
        }
    });

    it("does not suppress marketing chrome for public marketing routes", () => {
        expect(isPublicMarketingChromeSuppressedPath("/")).toBe(false);
        expect(isPublicMarketingChromeSuppressedPath("/platform")).toBe(false);
        expect(isPublicMarketingChromeSuppressedPath("/contact")).toBe(false);
    });

    it("ConditionalSiteLayout uses shared marketing chrome suppression helper", () => {
        const root = resolve(__dirname, "../../..");
        const layout = readFileSync(resolve(root, "components/ConditionalSiteLayout.tsx"), "utf8");
        expect(layout).toContain("isPublicMarketingChromeSuppressedPath");
        expect(layout).not.toContain('pathname.startsWith("/workspace/")');
    });
});
