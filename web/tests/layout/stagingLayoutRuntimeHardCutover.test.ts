/**
 * Layout runtime hard cutover — default-on flags and presentation helpers.
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

describe("layout runtime hard cutover flags — default on", () => {
    const env = { ...process.env };

    beforeEach(() => {
        delete process.env.LAYOUT_RUNTIME_ENABLED;
        delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED;
        delete process.env.LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK;
        delete process.env.LAYOUT_RUNTIME_OPPORTUNITY_DRAWER;
        delete process.env.LAYOUT_RUNTIME_PERSON_DRAWER;
        delete process.env.LAYOUT_RUNTIME_OPPORTUNITY_QUEUE;
        delete process.env.LAYOUT_V2_PREVIEW_ENABLED;
        delete process.env.NEXT_PUBLIC_APP_ENV;
        delete process.env.VERCEL_ENV;
    });

    afterEach(() => {
        process.env = { ...env };
    });

    it("hard cutover active by default without env vars", () => {
        expect(isLayoutRuntimeHardCutoverActiveServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimePersonDrawerBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityQueueBodyEnabledServer()).toBe(true);
        expect(isLayoutV2ConfigEnabledServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityQueueShadowReadPathEnabled()).toBe(false);
    });

    it("hard cutover requires emergency fallback off", () => {
        expect(isLayoutRuntimeLegacyEmergencyFallbackEnabledServer()).toBe(false);
        process.env.LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK = "1";
        expect(isLayoutRuntimeHardCutoverActiveServer()).toBe(false);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(false);
    });

    it("explicit master kill switch disables cutover", () => {
        process.env.LAYOUT_RUNTIME_ENABLED = "0";
        expect(isLayoutRuntimeHardCutoverActiveServer()).toBe(false);
        expect(isLayoutV2ConfigEnabledServer()).toBe(false);
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
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Johnson Family",
                childName: "Alex",
                contactDisplayName: "Jamie Johnson",
                contactPhoneDisplay: "(555) 234-8901",
                contactEmail: "jamie@example.com",
                programContext: "Infant AM",
                statusLabel: "Qualified",
                stageLabel: null,
                nextStep: "Schedule tour",
                lastActivity: null,
                commercialValue: null,
                contactSnippet: "(555) 234-8901",
                roomContext: "Main Campus",
                ageContext: null,
                attentionReason: "Tour overdue",
                familyNote: null,
                tourContext: "Jun 12",
                locationContext: "Main Campus",
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record.name).toBe("Johnson Family");
        expect(record.last_name).toBe("Johnson");
        expect(record["person.primary_contact_name"]).toBe("Jamie Johnson");
        expect(record["opportunity.tour_date"]).toBe("Jun 12");
        expect(record._attention).toBe("Tour overdue");
        expect(Array.isArray(record.children) && record.children[0]?.["child.name"]).toBe("Alex");
    });

    it("maps queue preview using un-gated layoutRuntimeEnrichment when CRM slots are sparse", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Johnson Family",
            quickActions: [],
            layoutRuntimeEnrichment: {
                customerName: "Johnson Family",
                contactLine: "Jamie Johnson",
                primaryPhone: "(555) 234-8901",
                tourDisplay: "Jun 12",
                statusDisplay: "Qualified",
                childDisplayName: "Alex Johnson",
                crmCompactChildren: [{ primary: "Alex Johnson", secondary: "Infant AM" }],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record.last_name).toBe("Johnson");
        expect(record["person.primary_contact_name"]).toBe("Jamie Johnson");
        expect(record["opportunity.tour_date"]).toBe("Jun 12");
        expect(Array.isArray(record.children) && record.children.length).toBe(1);
    });

    it("maps waitlist candidate preview to layout row record", () => {
        const item: QueuePreviewItemVm = {
            id: "cand-1",
            title: "Alex Johnson",
            quickActions: [],
            placementWaitlistCandidate: {
                placementCandidateId: "pc-1",
                opportunityId: "opp-1",
                childDisplayName: "Alex Johnson",
                familyDisplayName: "Johnson Family",
                parentDisplayName: "Jamie Johnson",
                cohortKey: "infant-am",
                cohortLabel: "Infant AM",
                cohortSectionTitle: "Main Campus · Infant",
                bucketLabel: "Priority 1",
                waitSinceLabel: "14 days",
                linkModeLabel: null,
                isSyntheticFallback: false,
                hasActiveOverride: false,
                activeOverrideKinds: [],
                activeOverrides: [],
                hasManualPositionAdjustment: false,
                manualAdjustmentReason: null,
                pinOverrideId: null,
                shadowMode: false,
                forecastHints: [],
                siblingLabel: null,
                siblingCohorts: [],
                siblingContextLines: [],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record["child.name"]).toBe("Alex Johnson");
        expect(record["child.program"]).toBe("Infant AM");
        expect(record["opportunity.status_key"]).toBe("Priority 1");
    });
});
