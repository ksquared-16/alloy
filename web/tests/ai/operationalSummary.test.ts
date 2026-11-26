import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { AI_POLICY_METADATA_KEY, parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";
import {
    buildOperationalSummaryDeterministic,
    toOperationalSummaryQueuePreview,
} from "@/lib/operationalSummary/buildOperationalSummary";
import { applyStubOperationalSummaryOverlay } from "@/lib/ai/buildOperationalSummary";
import { aiUsageTelemetryPayloadV1ToJson } from "@/lib/ai/enrichmentContracts";
import { safeParseOperationalSummaryV1 } from "@/lib/ai/operationalSummarySchema";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

function minimalAttention(): OpportunityAttentionResult {
    return {
        needs_attention: true,
        reasons: [
            {
                code: "stale_new_inquiry",
                label: "New inquiry is stale",
                severity: "medium",
                sla_tier: "breached",
                sla_clock_confidence: "low",
            },
        ],
        primary_reason: {
            code: "stale_new_inquiry",
            label: "New inquiry is stale",
            severity: "medium",
            sla_tier: "breached",
            sla_clock_confidence: "low",
        },
        waiting: { bucket: "none", since_iso: null, active: false },
        priority_score: 1,
        priority_breakdown: [],
        auxiliary: {
            activity_stale: { key: "idle_rule", label: "Idle signal", severity: "medium", threshold_minutes: 60 },
        },
        resolver_version: 2,
        computed_at_iso: "2026-05-13T12:00:00.000Z",
    };
}

function minimalSuggestion(): AttentionSuggestionV1 {
    return {
        version: 1,
        agent_key: "needs_attention_suggestion",
        suggestion_id: "a".repeat(48),
        target: { entity_type: "opportunities", entity_id: "opp-1" },
        source: {
            resolver: "opportunity_attention",
            resolver_version: 2,
            primary_reason_code: "stale_new_inquiry",
            reason_codes: ["stale_new_inquiry"],
        },
        next_action: {
            key: "respond_to_new_request",
            label: "Respond to new request",
            action_family: "follow_up",
            confidence: "deterministic",
        },
        reasoning: {
            summary: "Operational attention: New inquiry is stale.",
            factors: [],
        },
        suggested_content: {
            channel: "email",
            template_key: "generic_follow_up_short",
            body: "SECRET_DRAFT_BODY_XYZ",
            variables: {},
        },
        generated_at_iso: "2026-05-13T12:00:00.000Z",
    };
}

describe("buildOperationalSummaryDeterministic", () => {
    it("returns versioned shape with headline, bullets, risk, and source metadata", () => {
        const s = buildOperationalSummaryDeterministic({
            attention: minimalAttention(),
            suggestion: minimalSuggestion(),
            nowIso: "2026-05-13T12:00:00.000Z",
        });
        expect(s).not.toBeNull();
        expect(s!.version).toBe(1);
        expect(s!.headline.length).toBeGreaterThan(10);
        expect(s!.bullets.length).toBeGreaterThanOrEqual(1);
        expect(s!.bullets.length).toBeLessThanOrEqual(3);
        expect(["low", "medium", "high"]).toContain(s!.risk_urgency_hint);
        expect(s!.generation_mode).toBe("deterministic");
        expect(s!.source.suggestion_present).toBe(true);
        expect(s!.source.attention_primary_code).toBe("stale_new_inquiry");
        expect(s!.source.resolver_version).toBe(2);
        expect(s!.redaction).toBeNull();
    });

    it("returns null when no attention and no activity signal", () => {
        const idle: OpportunityAttentionResult = {
            ...minimalAttention(),
            needs_attention: false,
            primary_reason: null,
            reasons: [],
            auxiliary: { activity_stale: null },
        };
        expect(
            buildOperationalSummaryDeterministic({
                attention: idle,
                suggestion: null,
                nowIso: "2026-05-13T12:00:00.000Z",
            }),
        ).toBeNull();
    });
});

describe("applyStubOperationalSummaryOverlay", () => {
    beforeEach(() => vi.unstubAllEnvs());
    afterEach(() => vi.unstubAllEnvs());

    it("is a no-op when stub env is disabled", () => {
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "false");
        const base = buildOperationalSummaryDeterministic({
            attention: minimalAttention(),
            suggestion: minimalSuggestion(),
            nowIso: "2026-05-13T12:00:00.000Z",
        })!;
        const policy = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["operational_summary"],
            },
        });
        const out = applyStubOperationalSummaryOverlay(base, policy);
        expect(out.generation_mode).toBe("deterministic");
        expect(out.source.kind).toBe("deterministic_aggregate");
    });

    it("adds stub metadata when env and org policy allow operational_summary on stub", () => {
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const base = buildOperationalSummaryDeterministic({
            attention: minimalAttention(),
            suggestion: minimalSuggestion(),
            nowIso: "2026-05-13T12:00:00.000Z",
        })!;
        const policy = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["operational_summary"],
            },
        });
        const out = applyStubOperationalSummaryOverlay(base, policy);
        expect(out.generation_mode).toBe("deterministic_plus_stub_overlay");
        expect(out.source.kind).toBe("deterministic_aggregate_stub_overlay");
        expect(out.bullets.length).toBeLessThanOrEqual(3);
        expect(out.redaction?.steps_total).toBeGreaterThanOrEqual(0);
    });
});

describe("safeParseOperationalSummaryV1", () => {
    it("accepts valid payloads", () => {
        const s = buildOperationalSummaryDeterministic({
            attention: minimalAttention(),
            suggestion: null,
            nowIso: "2026-05-13T12:00:00.000Z",
        });
        expect(s).not.toBeNull();
        expect(safeParseOperationalSummaryV1(s)).not.toBeNull();
    });
});

describe("toOperationalSummaryQueuePreview", () => {
    it("truncates headline for queue density", () => {
        const longHead = "x".repeat(200);
        const summary = buildOperationalSummaryDeterministic({
            attention: {
                ...minimalAttention(),
                primary_reason: {
                    code: "stale_new_inquiry",
                    label: longHead,
                    severity: "low",
                    sla_tier: "ok",
                    sla_clock_confidence: "high",
                },
            },
            suggestion: null,
            nowIso: "2026-05-13T12:00:00.000Z",
        });
        expect(summary).not.toBeNull();
        const prev = toOperationalSummaryQueuePreview(summary!);
        expect(prev.headline.length).toBeLessThanOrEqual(140);
    });
});

describe("AiUsageTelemetryPayloadV1 JSON", () => {
    it("does not carry operational summary headline or draft bodies", () => {
        const json = aiUsageTelemetryPayloadV1ToJson({
            schema_version: 1,
            event_kind: "enrichment_request",
            correlation_id: "c1",
            org_id: "o1",
            feature: "needs_attention_draft_enrichment",
            provider_key: "stub",
            outcome: "stub_success",
            latency_ms: 12,
            redaction: { steps_total: 1, kinds: ["email"] },
        });
        const raw = JSON.stringify(json);
        expect(raw).not.toContain("SECRET_DRAFT");
        expect(raw).not.toContain("headline");
        expect(raw).not.toContain("bullets");
    });
});

describe("Phase 2 — no operational_summaries migration", () => {
    it("does not introduce a new operational_summaries table migration", () => {
        const dir = join(process.cwd(), "..", "supabase", "migrations");
        const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
        const hits: string[] = [];
        for (const f of files) {
            const text = readFileSync(join(dir, f), "utf8").toLowerCase();
            if (text.includes("operational_summaries") && text.includes("create table")) {
                hits.push(f);
            }
        }
        expect(hits).toEqual([]);
    });
});
