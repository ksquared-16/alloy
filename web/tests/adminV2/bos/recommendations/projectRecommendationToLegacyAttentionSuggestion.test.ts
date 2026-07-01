import { describe, expect, it } from "vitest";

import { buildNeedsAttentionSuggestion } from "@/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion";
import type { AttentionSuggestionActionFamily } from "@/lib/agent/needsAttentionSuggestion/types";
import { tryBuildOperationalRecommendationFromAttention } from "@/lib/adminV2/bos/recommendations/adapters/tryBuildOperationalRecommendationFromAttention";
import {
    operationalRecommendationToAttentionSuggestionV1,
    projectRecommendationToLegacyAttentionSuggestion,
} from "@/lib/adminV2/bos/recommendations/adapters/projectRecommendationToLegacyAttentionSuggestion";
import {
    projectOperationalRecommendationQueuePreviewToLegacyAttentionSuggestionPreview,
    projectRecommendationPreviewToLegacyAttentionSuggestionPreview,
} from "@/lib/adminV2/bos/recommendations/adapters/projectRecommendationPreviewToLegacyAttentionSuggestionPreview";
import {
    buildOperationalRecommendationV1,
    validateOperationalRecommendationV1,
} from "@/lib/adminV2/bos/recommendations";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";
import type { OpportunityAttentionReasonCode, OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const ENTITY_ID = "11111111-1111-4111-8111-111111111111";
const NOW_ISO = "2026-05-21T12:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);

const VALID_ACTION_FAMILIES = new Set<AttentionSuggestionActionFamily>([
    "follow_up",
    "review",
    "update_record",
    "send_message",
    "schedule",
    "workflow",
    "none",
]);

type ParityCase = {
    primaryCode: OpportunityAttentionReasonCode;
    primaryLabel: string;
    statusKey: string;
    waiting?: OpportunityAttentionResult["waiting"];
};

const PARITY_CASES: ParityCase[] = [
    { primaryCode: "stale_new_inquiry", primaryLabel: "New inquiry is stale", statusKey: "new_inquiry" },
    { primaryCode: "follow_up_date_passed", primaryLabel: "Follow-up overdue", statusKey: "contacted" },
    { primaryCode: "tour_date_passed", primaryLabel: "Tour date passed", statusKey: "tour_scheduled" },
    {
        primaryCode: "waiting_on_family",
        primaryLabel: "Waiting on family",
        statusKey: "application_started",
        waiting: { bucket: "waiting_on_family", since_iso: "2026-05-18T12:00:00.000Z", active: true },
    },
    {
        primaryCode: "waiting_on_staff",
        primaryLabel: "Waiting on staff",
        statusKey: "application_started",
        waiting: { bucket: "waiting_on_staff", since_iso: "2026-05-18T12:00:00.000Z", active: true },
    },
    { primaryCode: "high_value_stale", primaryLabel: "High-value stale", statusKey: "qualified" },
];

function attentionFixture(caseDef: ParityCase): OpportunityAttentionResult {
    const primary = {
        code: caseDef.primaryCode,
        label: caseDef.primaryLabel,
        severity: "high" as const,
        sla_tier: "breached" as const,
        sla_clock_confidence: "high" as const,
    };
    return {
        needs_attention: true,
        reasons: [primary],
        primary_reason: primary,
        waiting: caseDef.waiting ?? { bucket: "none", since_iso: null, active: false },
        priority_score: 80,
        priority_breakdown: [],
        auxiliary: { activity_stale: null },
        resolver_version: 2,
        computed_at_iso: NOW_ISO,
    };
}

function opportunityRow(statusKey: string) {
    return {
        id: ENTITY_ID,
        status_key: statusKey,
        name: "Lee Household",
        _customer_name: "Lee Household",
        updated_at: "2026-05-19T12:00:00.000Z",
    };
}

function assertLegacySuggestionShape(suggestion: NonNullable<ReturnType<typeof buildNeedsAttentionSuggestion>>) {
    expect(suggestion.version).toBe(1);
    expect(suggestion.agent_key).toBe("needs_attention_suggestion");
    expect(suggestion.suggestion_id.trim()).not.toBe("");
    expect(suggestion.target.entity_type).toBe("opportunities");
    expect(suggestion.target.entity_id).toBe(ENTITY_ID);
    expect(suggestion.next_action.label.trim()).not.toBe("");
    expect(suggestion.next_action.key.trim()).not.toBe("");
    expect(VALID_ACTION_FAMILIES.has(suggestion.next_action.action_family)).toBe(true);
    expect(suggestion.next_action.confidence).toBe("deterministic");
    expect(suggestion.reasoning.summary.trim()).not.toBe("");
    expect(suggestion.reasoning.factors.length).toBeGreaterThan(0);
    expect(suggestion.source.resolver).toBe("opportunity_attention");
    expect(suggestion.source.primary_reason_code).toBeTruthy();
}

describe("projectRecommendationToLegacyAttentionSuggestion", () => {
    it("exports execution-pack alias", () => {
        expect(operationalRecommendationToAttentionSuggestionV1).toBe(
            projectRecommendationToLegacyAttentionSuggestion
        );
    });

    it("projects a valid legacy suggestion from canonical recommendation", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const legacy = projectRecommendationToLegacyAttentionSuggestion(rec);
        expect(legacy).not.toBeNull();
        assertLegacySuggestionShape(legacy!);
        expect(() => validateOperationalRecommendationV1(rec)).not.toThrow();
    });

    it("does not mutate input recommendation", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const before = structuredClone(rec);
        projectRecommendationToLegacyAttentionSuggestion(rec);
        expect(rec).toEqual(before);
    });

    it("does not emit AI suggested_content bodies", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const legacy = projectRecommendationToLegacyAttentionSuggestion(rec);
        expect(legacy?.suggested_content).toBeNull();
    });

    it("fails soft for unsupported or incomplete recommendations", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const broken = {
            ...rec,
            operational_context: { ...rec.operational_context, entity_id: "" },
        };
        expect(projectRecommendationToLegacyAttentionSuggestion(broken)).toBeNull();
    });

    it("does not require queue row data", () => {
        const rec = buildOperationalRecommendationV1(
            buildTestOperationalRecommendationInput({ source_surface: "entity_get" })
        );
        const legacy = projectRecommendationToLegacyAttentionSuggestion(rec);
        expect(legacy).not.toBeNull();
        expect(legacy!.target.entity_id).toBe(ENTITY_ID);
    });
});

describe("legacy ↔ canonical structural parity", () => {
    for (const caseDef of PARITY_CASES) {
        it(`maintains structural parity for ${caseDef.primaryCode}`, () => {
            const attention = attentionFixture(caseDef);
            const row = opportunityRow(caseDef.statusKey);

            const legacy = buildNeedsAttentionSuggestion({
                opportunity: {
                    id: ENTITY_ID,
                    status_key: caseDef.statusKey,
                    metadata: {},
                    primary_display_name: "Lee Household",
                },
                attention,
                activity: null,
                nowIso: NOW_ISO,
            });
            expect(legacy).not.toBeNull();

            const canonical = tryBuildOperationalRecommendationFromAttention({
                orgId: ORG_ID,
                opportunityRow: row,
                attention,
                activity: null,
                nowMs: NOW_MS,
                sourceSurface: "entity_get",
            });
            expect(canonical).not.toBeNull();

            const adapted = projectRecommendationToLegacyAttentionSuggestion(canonical!);
            expect(adapted).not.toBeNull();
            assertLegacySuggestionShape(adapted!);

            expect(adapted!.source.primary_reason_code).toBe(legacy!.source.primary_reason_code);
            expect(adapted!.source.reason_codes).toEqual(legacy!.source.reason_codes);
            expect(VALID_ACTION_FAMILIES.has(adapted!.next_action.action_family)).toBe(true);
            expect(VALID_ACTION_FAMILIES.has(legacy!.next_action.action_family)).toBe(true);
            expect(adapted!.next_action.label.trim()).not.toBe("");
            expect(adapted!.reasoning.summary.trim()).not.toBe("");
            expect(adapted!.suggested_content).toBeNull();
        });
    }

    it("maps waiting_on_internal alias through waiting_on_staff catalog parity", () => {
        const attention = attentionFixture({
            primaryCode: "waiting_on_internal" as OpportunityAttentionReasonCode,
            primaryLabel: "Waiting on staff",
            statusKey: "application_started",
            waiting: { bucket: "waiting_on_staff", since_iso: "2026-05-18T12:00:00.000Z", active: true },
        });
        const canonical = tryBuildOperationalRecommendationFromAttention({
            orgId: ORG_ID,
            opportunityRow: opportunityRow("application_started"),
            attention,
            activity: null,
            nowMs: NOW_MS,
        });
        expect(canonical).not.toBeNull();
        const adapted = projectRecommendationToLegacyAttentionSuggestion(canonical!);
        expect(adapted).not.toBeNull();
        expect(adapted!.next_action.key).toBe("complete_internal_action");
        expect(adapted!.next_action.action_family).toBe("review");
    });
});

describe("projectRecommendationPreviewToLegacyAttentionSuggestionPreview", () => {
    it("projects lightweight queue preview shape only", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const preview = projectRecommendationPreviewToLegacyAttentionSuggestionPreview(rec);
        expect(preview).toEqual({
            next_label: rec.render.queue.next_label,
            why_line: rec.render.queue.why_line,
        });
        expect(Object.keys(preview!)).toEqual(["next_label", "why_line"]);
    });

    it("strips non-legacy fields from OperationalRecommendationQueuePreviewV1", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const legacy = projectOperationalRecommendationQueuePreviewToLegacyAttentionSuggestionPreview(
            rec.render.queue
        );
        expect(legacy).not.toHaveProperty("urgency_band");
        expect(legacy).not.toHaveProperty("recommendation_type");
        expect(legacy?.next_label).toBeTruthy();
        expect(legacy?.why_line).toBeTruthy();
    });

    it("maintains queue preview structural parity with legacy builder output", () => {
        const attention = attentionFixture(PARITY_CASES[0]!);
        const legacy = buildNeedsAttentionSuggestion({
            opportunity: {
                id: ENTITY_ID,
                status_key: "new_inquiry",
                metadata: {},
                primary_display_name: "Lee Household",
            },
            attention,
            nowIso: NOW_ISO,
        });
        const canonical = tryBuildOperationalRecommendationFromAttention({
            orgId: ORG_ID,
            opportunityRow: opportunityRow("new_inquiry"),
            attention,
            activity: null,
            nowMs: NOW_MS,
            sourceSurface: "queue_enrich",
        });
        const adaptedPreview = projectRecommendationPreviewToLegacyAttentionSuggestionPreview(canonical!);

        expect(legacy).not.toBeNull();
        expect(adaptedPreview).not.toBeNull();
        expect(adaptedPreview!.next_label.trim()).not.toBe("");
        expect(adaptedPreview!.why_line.trim()).not.toBe("");
        expect(adaptedPreview!.why_line).toBe(canonical!.render.queue.why_line);
    });

    it("fails soft when queue render is missing", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const broken = { ...rec, render: { ...rec.render, queue: { ...rec.render.queue, next_label: "" } } };
        expect(projectRecommendationPreviewToLegacyAttentionSuggestionPreview(broken)).toBeNull();
    });
});
