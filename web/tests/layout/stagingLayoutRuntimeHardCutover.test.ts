/**
 * Staging hard cutover — feature flags and presentation helpers.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
    isLayoutRuntimeHardCutoverActiveServer,
    isLayoutRuntimeLegacyEmergencyFallbackEnabledServer,
    isLayoutRuntimeOpportunityDrawerBodyEnabledServer,
    isLayoutRuntimeOpportunityQueueBodyEnabledServer,
    isLayoutRuntimeOpportunityQueueShadowReadPathEnabled,
    isLayoutRuntimePersonDrawerBodyEnabledServer,
    isLayoutV2ConfigEnabledServer,
} from "@/lib/layout/featureFlag";
import {
    DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS,
    resolveDrawerLayoutRuntimeBodyPresentation,
} from "@/lib/layout/runtime/drawerLayoutRuntimePresentation";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import { buildPersonLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildPersonLayoutRuntimeRecordFromVm";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

describe("staging hard cutover flags", () => {
    const env = { ...process.env };

    beforeEach(() => {
        delete process.env.LAYOUT_RUNTIME_ENABLED;
        delete process.env.LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK;
        delete process.env.LAYOUT_RUNTIME_OPPORTUNITY_DRAWER;
        delete process.env.LAYOUT_RUNTIME_PERSON_DRAWER;
        delete process.env.LAYOUT_RUNTIME_OPPORTUNITY_QUEUE;
        delete process.env.LAYOUT_V2_PREVIEW_ENABLED;
    });

    afterEach(() => {
        process.env = { ...env };
    });

    it("hard cutover requires runtime on and emergency fallback off", () => {
        expect(isLayoutRuntimeHardCutoverActiveServer()).toBe(false);
        process.env.LAYOUT_RUNTIME_ENABLED = "1";
        expect(isLayoutRuntimeHardCutoverActiveServer()).toBe(true);
        process.env.LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK = "1";
        expect(isLayoutRuntimeHardCutoverActiveServer()).toBe(false);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(false);
    });

    it("layout config APIs enabled when runtime hard cutover is active", () => {
        process.env.LAYOUT_RUNTIME_ENABLED = "1";
        expect(isLayoutV2ConfigEnabledServer()).toBe(true);
    });

    it("person and queue body require hard cutover plus per-entity flag", () => {
        process.env.LAYOUT_RUNTIME_ENABLED = "1";
        process.env.LAYOUT_RUNTIME_PERSON_DRAWER = "1";
        process.env.LAYOUT_RUNTIME_OPPORTUNITY_QUEUE = "1";
        expect(isLayoutRuntimePersonDrawerBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityQueueBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityQueueShadowReadPathEnabled()).toBe(false);
    });

    it("hold presentation during loading — no VM flash", () => {
        expect(resolveDrawerLayoutRuntimeBodyPresentation({ cutoverEnabled: true, phase: "loading" })).toBe("hold");
        expect(resolveDrawerLayoutRuntimeBodyPresentation({ cutoverEnabled: true, phase: "fallback" })).toBe("vm");
        expect(DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS).toBeGreaterThanOrEqual(1500);
    });
});

describe("layout runtime record mappers", () => {
    it("maps person VM record to operator-safe layout record", () => {
        const record = buildPersonLayoutRuntimeRecordFromVm({
            personId: "p-1",
            vmRecord: {
                first_name: "Jamie",
                last_name: "Johnson",
                _person_name: "Jamie Johnson",
                phone: "(555) 234-8901",
            },
        });
        expect(record["person.primary_contact_name"]).toBe("Jamie Johnson");
        expect(JSON.stringify(record)).not.toContain("customer_member");
    });

    it("maps queue preview item to layout row record", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Johnson Family",
            semanticCrmCompact: {
                primaryIdentity: "Johnson Family",
                childName: "Alex",
                contactDisplayName: "Jamie Johnson",
                programContext: "Infant AM",
                statusLabel: "Qualified",
                stageLabel: null,
                nextStep: "Schedule tour",
                lastActivity: null,
                commercialValue: null,
                contactSnippet: "(555) 234-8901",
                roomContext: "Main Campus",
                ageContext: null,
                attentionReason: null,
                familyNote: null,
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record.name).toBe("Johnson Family");
        expect(record["person.primary_contact_name"]).toBe("Jamie Johnson");
    });
});
