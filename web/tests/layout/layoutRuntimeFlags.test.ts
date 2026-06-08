/**
 * Layout runtime feature flags — staging defaults on, production defaults off.
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
    isLayoutRuntimePersonDrawerBodyEnabledServer,
    isLayoutRuntimeReadPathEnabled,
    isLayoutRuntimeShadowEnabledServer,
    isLayoutV2ConfigEnabledServer,
    isLayoutV2PreviewEnabledServer,
} from "@/lib/layout/featureFlag";

function setProductionEnv() {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
}

function setStagingEnv() {
    process.env.NEXT_PUBLIC_APP_ENV = "staging";
    process.env.VERCEL_ENV = "preview";
}

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
}

describe("layout runtime feature flags — production defaults off", () => {
    const env = { ...process.env };

    beforeEach(() => {
        clearLayoutRuntimeFlags();
        setProductionEnv();
    });

    afterEach(() => {
        process.env = { ...env };
    });

    it("LAYOUT_RUNTIME_ENABLED defaults off on production", () => {
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

    it("LAYOUT_RUNTIME_OPPORTUNITY_DRAWER defaults off on production", () => {
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

describe("layout runtime feature flags — staging defaults on", () => {
    const env = { ...process.env };

    beforeEach(() => {
        clearLayoutRuntimeFlags();
        setStagingEnv();
    });

    afterEach(() => {
        process.env = { ...env };
    });

    it("enables layout runtime and all entity cutovers without manual env vars", () => {
        expect(isLayoutRuntimeEnabledServer()).toBe(true);
        expect(isLayoutRuntimeEnabledClient()).toBe(true);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimePersonDrawerBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityQueueBodyEnabledServer()).toBe(true);
        expect(isLayoutV2ConfigEnabledServer()).toBe(true);
    });

    it("explicit LAYOUT_RUNTIME_ENABLED=0 disables staging default", () => {
        process.env.LAYOUT_RUNTIME_ENABLED = "0";
        expect(isLayoutRuntimeEnabledServer()).toBe(false);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(false);
    });
});
