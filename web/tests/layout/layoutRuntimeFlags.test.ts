/**
 * Layout runtime feature flags — default-on; emergency fallback opt-out only.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
    isLayoutRuntimeEnabledClient,
    isLayoutRuntimeEnabledServer,
    isLayoutRuntimeHardCutoverActiveClient,
    isLayoutRuntimeHardCutoverActiveServer,
    isLayoutRuntimeLegacyEmergencyFallbackEnabledServer,
    isLayoutRuntimeOpportunityDrawerBodyEnabledClient,
    isLayoutRuntimeOpportunityDrawerBodyEnabledServer,
    isLayoutRuntimeOpportunityDrawerEnabledServer,
    isLayoutRuntimeOpportunityDrawerShadowReadPathEnabled,
    isLayoutRuntimeOpportunityQueueBodyEnabledServer,
    isLayoutRuntimeOpportunityQueueEnabledServer,
    isLayoutRuntimeOpportunityQueueShadowReadPathEnabled,
    isLayoutRuntimePersonDrawerBodyEnabledServer,
    isLayoutRuntimeReadPathEnabled,
    isLayoutRuntimeShadowEnabledServer,
    isLayoutV2ConfigEnabledClient,
    isLayoutV2ConfigEnabledServer,
    isLayoutV2PreviewEnabledServer,
} from "@/lib/layout/featureFlag";

function clearLayoutRuntimeFlags() {
    delete process.env.LAYOUT_RUNTIME_ENABLED;
    delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED;
    delete process.env.LAYOUT_RUNTIME_OPPORTUNITY_DRAWER;
    delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER;
    delete process.env.LAYOUT_RUNTIME_PERSON_DRAWER;
    delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_PERSON_DRAWER;
    delete process.env.LAYOUT_RUNTIME_CHILD_DRAWER;
    delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_CHILD_DRAWER;
    delete process.env.LAYOUT_RUNTIME_OPPORTUNITY_QUEUE;
    delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_QUEUE;
    delete process.env.LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK;
    delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK;
    delete process.env.LAYOUT_V2_PREVIEW_ENABLED;
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.VERCEL_ENV;
}

describe("layout runtime feature flags — default on without env vars", () => {
    const env = { ...process.env };

    beforeEach(() => {
        clearLayoutRuntimeFlags();
    });

    afterEach(() => {
        process.env = { ...env };
    });

    it("enables layout runtime, config, and all entity cutovers with no env vars", () => {
        expect(isLayoutRuntimeEnabledServer()).toBe(true);
        expect(isLayoutRuntimeEnabledClient()).toBe(true);
        expect(isLayoutRuntimeHardCutoverActiveServer()).toBe(true);
        expect(isLayoutRuntimeHardCutoverActiveClient()).toBe(true);
        expect(isLayoutV2ConfigEnabledServer()).toBe(true);
        expect(isLayoutV2ConfigEnabledClient()).toBe(true);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledClient()).toBe(true);
        expect(isLayoutRuntimePersonDrawerBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityQueueBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimeReadPathEnabled()).toBe(true);
    });

    it("LAYOUT_V2_PREVIEW_ENABLED defaults off but config still enabled via runtime cutover", () => {
        expect(isLayoutV2PreviewEnabledServer()).toBe(false);
        expect(isLayoutV2ConfigEnabledServer()).toBe(true);
    });

    it("LAYOUT_RUNTIME_SHADOW_ENABLED defaults off", () => {
        expect(isLayoutRuntimeShadowEnabledServer()).toBe(false);
    });

    it("shadow read path off when visible body cutover is active", () => {
        expect(isLayoutRuntimeOpportunityDrawerShadowReadPathEnabled()).toBe(false);
        expect(isLayoutRuntimeOpportunityQueueShadowReadPathEnabled()).toBe(false);
    });

    it("explicit LAYOUT_RUNTIME_ENABLED=0 disables staging default", () => {
        process.env.LAYOUT_RUNTIME_ENABLED = "0";
        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED = "0";
        expect(isLayoutRuntimeEnabledServer()).toBe(false);
        expect(isLayoutRuntimeEnabledClient()).toBe(false);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(false);
        expect(isLayoutV2ConfigEnabledServer()).toBe(false);
    });

    it("per-entity explicit opt-out disables only that surface", () => {
        process.env.LAYOUT_RUNTIME_OPPORTUNITY_DRAWER = "0";
        expect(isLayoutRuntimeOpportunityDrawerEnabledServer()).toBe(false);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(false);
        expect(isLayoutRuntimePersonDrawerBodyEnabledServer()).toBe(true);
    });

    it("LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK=1 disables hard cutover and layout bodies", () => {
        expect(isLayoutRuntimeLegacyEmergencyFallbackEnabledServer()).toBe(false);
        process.env.LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK = "1";
        expect(isLayoutRuntimeHardCutoverActiveServer()).toBe(false);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(false);
        expect(isLayoutRuntimeOpportunityQueueBodyEnabledServer()).toBe(false);
        expect(isLayoutV2ConfigEnabledServer()).toBe(false);
        expect(isLayoutRuntimeOpportunityQueueEnabledServer()).toBe(true);
    });

    it("read path enabled when preview OR runtime flag on", () => {
        expect(isLayoutRuntimeReadPathEnabled()).toBe(true);
        process.env.LAYOUT_RUNTIME_ENABLED = "0";
        expect(isLayoutRuntimeReadPathEnabled()).toBe(false);
        delete process.env.LAYOUT_RUNTIME_ENABLED;
        process.env.LAYOUT_V2_PREVIEW_ENABLED = "true";
        expect(isLayoutRuntimeReadPathEnabled()).toBe(true);
    });
});
