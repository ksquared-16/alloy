/**
 * Layout runtime feature flags — Phase 0 defaults off.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
    isLayoutRuntimeEnabledClient,
    isLayoutRuntimeEnabledServer,
    isLayoutRuntimeOpportunityDrawerEnabledServer,
    isLayoutRuntimeOpportunityDrawerBodyEnabledServer,
    isLayoutRuntimeOpportunityDrawerShadowReadPathEnabled,
    isLayoutRuntimeOpportunityQueueEnabledServer,
    isLayoutRuntimeOpportunityQueueShadowReadPathEnabled,
    isLayoutRuntimeOpportunityQueueBodyEnabledServer,
    isLayoutRuntimeReadPathEnabled,
    isLayoutRuntimeShadowEnabledServer,
    isLayoutV2PreviewEnabledServer,
} from "@/lib/layout/featureFlag";

describe("layout runtime feature flags", () => {
    const env = { ...process.env };

    beforeEach(() => {
        delete process.env.LAYOUT_RUNTIME_ENABLED;
        delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED;
        delete process.env.LAYOUT_V2_PREVIEW_ENABLED;
    });

    afterEach(() => {
        process.env = { ...env };
    });

    it("LAYOUT_RUNTIME_ENABLED defaults off", () => {
        expect(isLayoutRuntimeEnabledServer()).toBe(false);
        expect(isLayoutRuntimeEnabledClient()).toBe(false);
    });

    it("LAYOUT_V2_PREVIEW_ENABLED defaults off", () => {
        expect(isLayoutV2PreviewEnabledServer()).toBe(false);
    });

    it("read path enabled when preview OR runtime flag on", () => {
        expect(isLayoutRuntimeReadPathEnabled()).toBe(false);
        process.env.LAYOUT_RUNTIME_ENABLED = "1";
        expect(isLayoutRuntimeReadPathEnabled()).toBe(true);
        delete process.env.LAYOUT_RUNTIME_ENABLED;
        process.env.LAYOUT_V2_PREVIEW_ENABLED = "true";
        expect(isLayoutRuntimeReadPathEnabled()).toBe(true);
    });

    it("LAYOUT_RUNTIME_SHADOW_ENABLED defaults off", () => {
        expect(isLayoutRuntimeShadowEnabledServer()).toBe(false);
    });

    it("LAYOUT_RUNTIME_OPPORTUNITY_DRAWER defaults off", () => {
        expect(isLayoutRuntimeOpportunityDrawerEnabledServer()).toBe(false);
        expect(isLayoutRuntimeOpportunityDrawerShadowReadPathEnabled()).toBe(false);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(false);
    });

    it("LAYOUT_RUNTIME_OPPORTUNITY_QUEUE defaults off and shadow excludes visible body cutover", () => {
        expect(isLayoutRuntimeOpportunityQueueEnabledServer()).toBe(false);
        expect(isLayoutRuntimeOpportunityQueueShadowReadPathEnabled()).toBe(false);

        process.env.LAYOUT_RUNTIME_OPPORTUNITY_QUEUE = "1";
        expect(isLayoutRuntimeOpportunityQueueShadowReadPathEnabled()).toBe(false);

        process.env.LAYOUT_RUNTIME_ENABLED = "1";
        expect(isLayoutRuntimeOpportunityQueueBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityQueueShadowReadPathEnabled()).toBe(false);
    });
});
