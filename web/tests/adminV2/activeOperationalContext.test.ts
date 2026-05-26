import { describe, expect, it } from "vitest";

import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import {
    buildOpportunityOperationalContext,
    commandExplicitlyRequestsRecordSearch,
    entityOperationalContextEqual,
    isStaleOperationalProposalEntity,
    orchestratorHandoffSeedCommand,
    resolveOpportunityOperationalContextLabel,
    shouldShortCircuitTaskAssistEntitySearch,
} from "@/lib/adminV2/bos/activeOperationalContext";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";

describe("activeOperationalContext", () => {
    it("resolveOpportunityOperationalContextLabel prefers customer name from entity GET", () => {
        const label = resolveOpportunityOperationalContextLabel({
            overviewData: { _customer_name: "Mitchell Family", name: "Inquiry 42" },
            queuePreviewSeed: { title: "Queue Title" },
            opportunitySingular: "Opportunity",
        });
        expect(label).toBe("Mitchell Family");
    });

    it("resolveOpportunityOperationalContextLabel falls back to queue seed before singular", () => {
        const label = resolveOpportunityOperationalContextLabel({
            overviewData: null,
            queuePreviewSeed: { title: "Mitchell · Tour pending" },
            opportunitySingular: "Opportunity",
        });
        expect(label).toBe("Mitchell · Tour pending");
    });

    it("buildOpportunityOperationalContext sets drawer source_surface", () => {
        const ctx = buildOpportunityOperationalContext({
            entityId: "opp-1",
            overviewData: { _customer_name: "Lee Household" },
            queuePreviewSeed: null,
            opportunitySingular: "Opportunity",
            sourceSurface: "opportunity_drawer",
        });
        expect(ctx.entity_id).toBe("opp-1");
        expect(ctx.source_surface).toBe("opportunity_drawer");
        expect(ctx.label).toBe("Lee Household");
        expect(ctx.available_actions?.length).toBeGreaterThan(0);
    });

    it("entityOperationalContextEqual ignores reference identity when fields match", () => {
        const a = buildOpportunityOperationalContext({
            entityId: "x",
            overviewData: { _customer_name: "A" },
            queuePreviewSeed: null,
            opportunitySingular: "Opportunity",
            sourceSurface: "queue",
        });
        const b = { ...a, available_actions: [...(a.available_actions ?? [])] };
        expect(entityOperationalContextEqual(a, b)).toBe(true);
    });

    it("isStaleOperationalProposalEntity when card entity differs from active", () => {
        expect(isStaleOperationalProposalEntity("a", "b")).toBe(true);
        expect(isStaleOperationalProposalEntity("a", "a")).toBe(false);
        expect(isStaleOperationalProposalEntity("a", null)).toBe(false);
        expect(isStaleOperationalProposalEntity(null, "a")).toBe(false);
    });

    it("orchestratorHandoffSeedCommand prefers canonical operational read when present", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const seed = orchestratorHandoffSeedCommand({
            entityLabel: "Mitchell Family",
            overviewData: {
                _operational_recommendation: rec,
                _attention_suggestion: { next_action: { label: "Send tour confirmation" } },
            },
        });
        expect(seed).toContain("Mitchell Family");
        expect(seed).toContain(rec.render.handoff.primary_recommendation);
        expect(seed).toContain("Do next:");
        expect(seed).toContain("Why now:");
        expect(seed).not.toContain("Send tour confirmation");
        expect(seed).not.toContain("Follow up with");
    });

    it("orchestratorHandoffSeedCommand uses legacy suggestion with do-next vocabulary", () => {
        const seed = orchestratorHandoffSeedCommand({
            entityLabel: "Mitchell Family",
            overviewData: {
                _attention_suggestion: {
                    version: 1,
                    agent_key: "needs_attention_suggestion",
                    suggestion_id: "x",
                    target: { entity_type: "opportunities", entity_id: "opp-1" },
                    source: {
                        resolver: "opportunity_attention",
                        resolver_version: 2,
                        primary_reason_code: "stale_new_inquiry",
                        reason_codes: ["stale_new_inquiry"],
                    },
                    next_action: { label: "Send tour confirmation", key: "x", action_family: "follow_up", confidence: "deterministic" },
                    reasoning: { summary: "Tour pending follow-up.", factors: [] },
                    generated_at_iso: "2026-05-20T12:00:00.000Z",
                },
            },
        });
        expect(seed).toContain("Mitchell Family");
        expect(seed).toContain("Send tour confirmation");
        expect(seed).toContain("Do next:");
        expect(seed).toContain("Why now:");
    });

    it("orchestratorHandoffSeedCommand falls back to draft message label", () => {
        const seed = orchestratorHandoffSeedCommand({
            entityLabel: null,
            overviewData: {},
        });
        expect(seed).toBe("Draft message for this inquiry");
    });

    it("shouldShortCircuitTaskAssistEntitySearch respects explicit record search", () => {
        expect(
            shouldShortCircuitTaskAssistEntitySearch({
                command: "list all opportunities",
                activeOpportunity: { entity_id: "a" },
            })
        ).toBe(false);
        expect(commandExplicitlyRequestsRecordSearch("list all opportunities")).toBe(true);
    });
});
