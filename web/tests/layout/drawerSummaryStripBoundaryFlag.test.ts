/**
 * Drawer summary strip boundary — staging/dev defaults and explicit overrides.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    isDrawerSummaryStripBoundaryEnabledClient,
    isDrawerSummaryStripBoundaryEnabledServer,
} from "@/lib/layout/featureFlag";

function clearBoundaryFlags() {
    delete process.env.DRAWER_SUMMARY_STRIP_BOUNDARY;
    delete process.env.NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY;
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.APP_ENV;
    delete process.env.VERCEL_ENV;
}

describe("drawer summary strip boundary flag", () => {
    const env = { ...process.env };

    beforeEach(() => {
        clearBoundaryFlags();
    });

    afterEach(() => {
        process.env = { ...env };
        vi.unstubAllEnvs();
    });

    it("defaults off in production deploy signals", () => {
        process.env.NEXT_PUBLIC_APP_ENV = "production";
        process.env.VERCEL_ENV = "production";
        vi.stubEnv("NODE_ENV", "test");
        expect(isDrawerSummaryStripBoundaryEnabledClient()).toBe(false);
        expect(isDrawerSummaryStripBoundaryEnabledServer()).toBe(false);
    });

    it("defaults on for staging and preview deploys", () => {
        process.env.NEXT_PUBLIC_APP_ENV = "staging";
        vi.stubEnv("NODE_ENV", "production");
        expect(isDrawerSummaryStripBoundaryEnabledClient()).toBe(true);

        clearBoundaryFlags();
        process.env.VERCEL_ENV = "preview";
        vi.stubEnv("NODE_ENV", "production");
        expect(isDrawerSummaryStripBoundaryEnabledServer()).toBe(true);
    });

    it("defaults on in development NODE_ENV", () => {
        vi.stubEnv("NODE_ENV", "development");
        expect(isDrawerSummaryStripBoundaryEnabledClient()).toBe(true);
    });

    it("explicit env overrides staging default", () => {
        process.env.NEXT_PUBLIC_APP_ENV = "staging";
        process.env.NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY = "0";
        expect(isDrawerSummaryStripBoundaryEnabledClient()).toBe(false);

        process.env.DRAWER_SUMMARY_STRIP_BOUNDARY = "1";
        expect(isDrawerSummaryStripBoundaryEnabledServer()).toBe(true);
    });
});
