/**
 * C4 foundation — opportunity queue layout context + flag gates.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
    isLayoutRuntimeOpportunityQueueEnabledServer,
    isLayoutRuntimeOpportunityQueueShadowReadPathEnabled,
    isLayoutRuntimeOpportunityQueueBodyEnabledServer,
} from "@/lib/layout/featureFlag";
import {
    buildOpportunityQueueLayoutContext,
    opportunityQueueLayoutEntityType,
} from "@/lib/layout/runtime/queue/buildOpportunityQueueLayoutContext";

describe("buildOpportunityQueueLayoutContext", () => {
    it("maps pipeline lane to pipeline queue_type with case grain", () => {
        expect(
            buildOpportunityQueueLayoutContext({
                drillWorkUnitKey: "enrollment_pipeline",
                lifecycleKey: "lead",
                stageKey: "qualified",
            }),
        ).toEqual({
            queue_type: "pipeline",
            grain: "case",
            work_unit_key: "enrollment_pipeline",
            lifecycle_key: "lead",
            stage_key: "qualified",
        });
    });

    it("maps waitlist candidate lane to waitlist queue_type with candidate grain", () => {
        expect(
            buildOpportunityQueueLayoutContext({
                drillWorkUnitKey: "waitlist",
                isWaitlistCandidate: true,
            }),
        ).toEqual({
            queue_type: "waitlist",
            grain: "candidate",
            work_unit_key: "waitlist",
            lifecycle_key: undefined,
            stage_key: undefined,
        });
    });

    it("uses distinct entity types for pipeline vs waitlist candidate", () => {
        expect(opportunityQueueLayoutEntityType(false)).toBe("opportunities");
        expect(opportunityQueueLayoutEntityType(true)).toBe("placement_candidate");
    });
});

describe("opportunity queue layout runtime flags", () => {
    const env = { ...process.env };

    beforeEach(() => {
        delete process.env.LAYOUT_RUNTIME_ENABLED;
        delete process.env.LAYOUT_RUNTIME_OPPORTUNITY_QUEUE;
        process.env.NEXT_PUBLIC_APP_ENV = "production";
        process.env.VERCEL_ENV = "production";
    });

    afterEach(() => {
        process.env = { ...env };
    });

    it("queue shadow requires master runtime + opportunity queue flag when body cutover off", () => {
        expect(isLayoutRuntimeOpportunityQueueEnabledServer()).toBe(false);
        expect(isLayoutRuntimeOpportunityQueueShadowReadPathEnabled()).toBe(false);

        process.env.LAYOUT_RUNTIME_OPPORTUNITY_QUEUE = "1";
        expect(isLayoutRuntimeOpportunityQueueShadowReadPathEnabled()).toBe(false);

        process.env.LAYOUT_RUNTIME_ENABLED = "1";
        expect(isLayoutRuntimeOpportunityQueueBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityQueueShadowReadPathEnabled()).toBe(false);
    });
});
