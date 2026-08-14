import { describe, expect, it } from "vitest";

import { buildNeedsAttentionSuggestion } from "@/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion";
import type { AttentionSuggestionActionFamily } from "@/lib/agent/needsAttentionSuggestion/types";
import { tryBuildOperationalRecommendationFromAttention } from "@/lib/adminV2/bos/recommendations/adapters/tryBuildOperationalRecommendationFromAttention";
import { buildLegacyAttentionSuggestionCompat } from "@/lib/adminV2/bos/recommendations/adapters/buildLegacySuggestionCompat";
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

    it("emits the DETERMINISTIC template draft, never AI content (D-78)", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const legacy = projectRecommendationToLegacyAttentionSuggestion(rec);

        // The distinction this test now guards is deterministic vs model-generated,
        // not present vs absent. Emitting nothing was the old way of guaranteeing
        // "no AI here", and it cost the operator the draft entirely (D-78).
        const content = legacy?.suggested_content ?? null;
        expect(content).not.toBeNull();
        expect(content!.template_key).toBeTruthy();

        // Same reason, same inputs, same copy, every time — a model cannot
        // produce that, so byte-stability is the property that proves the source.
        const again = projectRecommendationToLegacyAttentionSuggestion(
            buildOperationalRecommendationV1(buildTestOperationalRecommendationInput()),
        );
        expect(again?.suggested_content).toEqual(content);
    });

    it("emits no draft for a reason the template owner does not map", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const unmapped = {
            ...rec,
            stale_state_check: {
                ...rec.stale_state_check,
                fingerprint_inputs: {
                    ...rec.stale_state_check.fingerprint_inputs,
                    primary_reason_code: "stage_missing_required_fields",
                },
            },
        };
        expect(projectRecommendationToLegacyAttentionSuggestion(unmapped)?.suggested_content).toBeNull();
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

            // D-78. This asserted `toBeNull()`, and that assertion was the defect
            // written down as an expectation: all six of these reasons are
            // catalog-covered, so all six routed through this projection and lost
            // the draft the legacy builder had produced — which is what made the
            // governed enrichment control unreachable in normal operation.
            //
            // Parity is the right assertion, not merely "non-null": the two paths
            // must agree, or an operator sees different copy depending on which
            // builder happened to answer.
            expect(adapted!.suggested_content).toEqual(legacy!.suggested_content);
            expect(adapted!.suggested_content?.body?.trim()).toBeTruthy();
            expect(adapted!.suggested_content?.template_key).toBeTruthy();
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

/**
 * D-78 — enrichment reachability through the entry point the runtime actually uses.
 *
 * The projection tests above prove the adapter. This proves the CONSEQUENCE, and it
 * is the assertion that matters: `buildLegacyAttentionSuggestionCompat` is
 * canonical-first with a legacy fallback, and the operator's Enhance control
 * renders only when the suggestion it receives carries a draft body. Testing the
 * adapter alone would have missed the defect entirely — the adapter was behaving
 * exactly as written; the reachability was the thing that was broken.
 *
 * Every one of the six catalog-covered reasons is exercised, with no attention
 * priority manipulation and no tenant fixture.
 */
describe("D-78 — the enrichment control is reachable for catalog-covered reasons", () => {
    for (const caseDef of PARITY_CASES) {
        it(`yields a draft body for ${caseDef.primaryCode}`, () => {
            const attention = attentionFixture(caseDef);
            const legacyInput = {
                opportunity: {
                    id: ENTITY_ID,
                    status_key: caseDef.statusKey,
                    metadata: {},
                    primary_display_name: "Lee Household",
                },
                attention,
                activity: null,
                nowIso: NOW_ISO,
            };
            const recommendation = tryBuildOperationalRecommendationFromAttention({
                orgId: ORG_ID,
                opportunityRow: opportunityRow(caseDef.statusKey),
                attention,
                activity: null,
                nowMs: NOW_MS,
                sourceSurface: "entity_get",
            });

            const compat = buildLegacyAttentionSuggestionCompat({ recommendation, legacyInput });

            // The render predicate of `OperationalAttentionEnhanceDraft`, asserted
            // directly: no body, no control, no governed enrichment.
            expect(compat?.suggested_content?.body?.trim()).toBeTruthy();
            expect(compat?.suggested_content?.template_key).toBeTruthy();
            // The enrichment information spec reads the channel, so it must survive too.
            expect(compat?.suggested_content?.channel).toBeTruthy();
        });
    }

    it("keeps the canonical recommendation authoritative for the recommended action", () => {
        const caseDef = PARITY_CASES.find((c) => c.primaryCode === "waiting_on_family")!;
        const attention = attentionFixture(caseDef);
        const recommendation = tryBuildOperationalRecommendationFromAttention({
            orgId: ORG_ID,
            opportunityRow: opportunityRow(caseDef.statusKey),
            attention,
            activity: null,
            nowMs: NOW_MS,
            sourceSurface: "entity_get",
        });
        expect(recommendation).not.toBeNull();

        const compat = buildLegacyAttentionSuggestionCompat({
            recommendation,
            legacyInput: {
                opportunity: {
                    id: ENTITY_ID,
                    status_key: caseDef.statusKey,
                    metadata: {},
                    primary_display_name: "Lee Household",
                },
                attention,
                activity: null,
                nowIso: NOW_ISO,
            },
        });

        // The ACTION still comes from the canonical recommendation. Adding a draft
        // did not move authority to the compatibility projection.
        expect(compat!.next_action.key).toBe(recommendation!.recommended_action.key);
        expect(compat!.next_action.label).toBe(recommendation!.recommended_action.label);
        expect(compat!.reasoning.summary).toBe(recommendation!.why_it_matters);
    });

    it("waiting_on_documents keeps its draft on EITHER path (no regression)", () => {
        // The path Phase 2.8 live QA used, and it must survive this change.
        //
        // Not in `PHASE1_ATTENTION_REASON_CATALOG_KEYS` — but that does not mean no
        // canonical recommendation exists: a breached SLA maps it to the
        // `sla_breach` SUPPLEMENTAL key, so this reason reaches the projection too.
        // I asserted `recommendation === null` here at first and the test corrected
        // me. Which path answers is therefore not the guarantee worth pinning; the
        // draft surviving either way is.
        const attention = attentionFixture({
            primaryCode: "waiting_on_documents",
            primaryLabel: "Waiting on documents",
            statusKey: "application_started",
            waiting: { bucket: "waiting_on_documents", since_iso: "2026-05-18T12:00:00.000Z", active: true },
        });
        const recommendation = tryBuildOperationalRecommendationFromAttention({
            orgId: ORG_ID,
            opportunityRow: opportunityRow("application_started"),
            attention,
            activity: null,
            nowMs: NOW_MS,
            sourceSurface: "entity_get",
        });

        const legacyInput = {
            opportunity: {
                id: ENTITY_ID,
                status_key: "application_started",
                metadata: {},
                primary_display_name: "Lee Household",
            },
            attention,
            activity: null,
            nowIso: NOW_ISO,
        };

        // Canonical-first, exactly as the runtime calls it.
        const compat = buildLegacyAttentionSuggestionCompat({ recommendation, legacyInput });
        expect(compat?.suggested_content?.template_key).toBe("documents_request_short");
        expect(compat?.suggested_content?.body?.trim()).toBeTruthy();

        // And with no recommendation at all, which is what live QA observed when
        // the SLA tier was `ok`. Same template, same draft, either way.
        const fallbackOnly = buildLegacyAttentionSuggestionCompat({ recommendation: null, legacyInput });
        expect(fallbackOnly?.suggested_content).toEqual(compat?.suggested_content);
    });
});
