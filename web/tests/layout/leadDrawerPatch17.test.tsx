import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LeadOperatingAttentionSummaryCard from "@/components/layout/lead/LeadOperatingAttentionSummaryCard";
import QueueRecordAttentionWidget from "@/components/layout/queueRecord/QueueRecordAttentionWidget";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import { projectOperationalRecommendationQueuePreview } from "@/lib/adminV2/bos/recommendations/adapters/projectOperationalRecommendationQueuePreview";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import {
    layoutRuntimeAttentionHasMoreGuidance,
    resolveLayoutRuntimeAttentionGuidanceLines,
    resolveLayoutRuntimeAttentionSummaryLine,
} from "@/lib/layout/runtime/resolveLayoutRuntimeAttentionGuidance";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

describe("resolveLayoutRuntimeAttentionGuidance", () => {
    it("resolves More guidance from queue preview fields without full recommendation", () => {
        const overview = {
            _operational_recommendation_preview: {
                next_label: "Send a warm first response today",
                why_line: "New inquiry has not received staff outreach within SLA.",
            },
        };
        const summary = resolveLayoutRuntimeAttentionSummaryLine(overview);
        expect(summary).toContain("Send a warm first response");
        expect(layoutRuntimeAttentionHasMoreGuidance(overview, summary)).toBe(true);
        const lines = resolveLayoutRuntimeAttentionGuidanceLines(overview, summary);
        expect(lines.some((l) => l.label === "Why this needs attention")).toBe(true);
    });

    it("hides More guidance when only a flat attention reason exists", () => {
        const overview = {
            _attention_reason_label: "Review with a lead and assign a same-day resolution path.",
        };
        const summary = resolveLayoutRuntimeAttentionSummaryLine(overview);
        expect(summary).toContain("Review with a lead");
        expect(layoutRuntimeAttentionHasMoreGuidance(overview, summary)).toBe(false);
        expect(resolveLayoutRuntimeAttentionGuidanceLines(overview, summary)).toEqual([]);
    });
});

describe("LeadOperatingAttentionSummaryCard", () => {
    it("renders More guidance when drawer recommendation exists", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const record = buildProofOpportunityRecord({
            _operational_recommendation: rec,
            _operational_attention: {
                needs_attention: true,
                reasons: [{ code: "stale_new_inquiry", label: "New inquiry is stale", severity: "medium" }],
                primary_reason: {
                    code: "stale_new_inquiry",
                    label: "New inquiry is stale",
                    severity: "medium",
                },
                waiting: { bucket: "none", since_iso: null, active: false },
                priority_score: 1,
                priority_breakdown: [],
                auxiliary: {},
                resolver_version: 2,
                computed_at_iso: "2026-06-01T12:00:00.000Z",
            },
        });
        const html = renderToStaticMarkup(<LeadOperatingAttentionSummaryCard record={record} />);
        expect(html).toContain("data-lead-attention-summary-card");
        expect(html).toContain("data-testid=\"header-attention-more-guidance\"");
        expect(html).toContain("More guidance");
    });

    it("omits More guidance when no expandable guidance content exists", () => {
        const record = buildProofOpportunityRecord({
            _attention_reason_label: "Needs follow-up",
        });
        const html = renderToStaticMarkup(<LeadOperatingAttentionSummaryCard record={record} />);
        expect(html).not.toContain("More guidance");
    });
});

describe("QueueRecordAttentionWidget", () => {
    it("renders More guidance from queue row preview enrichment", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const preview = projectOperationalRecommendationQueuePreview(rec);
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Mitchell household",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell household",
                attentionReason: preview.next_label,
                statusLabel: "Contact Attempted",
                childName: null,
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                programContext: null,
            },
            layoutRuntimeEnrichment: {
                attentionReason: preview.next_label,
                operationalRecommendationPreview: preview,
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const html = renderToStaticMarkup(<QueueRecordAttentionWidget record={record} />);
        expect(html).toContain("data-queue-attention-widget");
        expect(html).toContain("More guidance");
    });
});

describe("queue row children visibility audit", () => {
    it("merges household CRM lines with inquiry enrichment instead of inquiry-only truncation", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-mitchell",
            title: "Mitchell household",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell household",
                childName: null,
                childrenLines: [
                    { primary: "Mia Mitchell", personId: "p-mia" },
                    { primary: "Liam Mitchell", personId: "p-liam" },
                    { primary: "Sophia Mitchell", personId: "p-sophia" },
                    { primary: "Alex Kelly", personId: "p-alex-k" },
                    { primary: "Alex Lyons", personId: "p-alex-l" },
                ],
                statusLabel: "Contact Attempted",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                programContext: null,
            },
            layoutRuntimeEnrichment: {
                inquiryChildren: [
                    {
                        id: "inq-mia",
                        person_id: "p-mia",
                        display_name: "Mia Mitchell",
                        desired_program_label: "Preschool",
                    },
                    {
                        id: "inq-liam",
                        person_id: "p-liam",
                        display_name: "Liam Mitchell",
                        desired_program_label: "Preschool",
                    },
                    {
                        id: "inq-sophia",
                        person_id: "p-sophia",
                        display_name: "Sophia Mitchell",
                        desired_program_label: "Preschool",
                    },
                ],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const children = Array.isArray(record.children) ? record.children : [];
        expect(children).toHaveLength(5);
        expect(children.map((c) => (c as Record<string, unknown>)["child.name"])).toEqual([
            "Mia Mitchell",
            "Liam Mitchell",
            "Sophia Mitchell",
            "Alex Kelly",
            "Alex Lyons",
        ]);
    });
});
