/**
 * D-80 — the provider output contract, and who owns which field.
 *
 * Live QA reached OpenAI, got a real answer back (298 in / 1066 out) and
 * produced `failed_validation`. The validator was right; the request was wrong.
 * The adapter asked for "your best structured answer" while the canonical
 * schema demanded four fields the model was never told about, one of them an
 * internal literal. A successful provider call could not validate — ever.
 *
 * These tests pin the ownership split that fixes it (D-82) and the validation
 * authority that must survive it (D-83).
 */

import { describe, expect, it } from "vitest";

import {
    ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_OUTPUT_SHAPE,
    assembleAttentionSuggestionAiEnrichment,
    attentionSuggestionAiEnrichmentProviderContentV1Schema,
    safeParseAttentionSuggestionAiEnrichmentV1,
} from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";
import { buildChatCompletionsBody } from "@/lib/ai/trust/openAiCompatibleProviderAdapter";
import { NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY } from "@/lib/ai/enrichmentContracts";
import { createProviderBackedAttentionEnrichmentStrategy } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/providerBackedStrategy";
import type {
    GovernedProviderExecutionRequestV1,
    ProviderAdapterResponseV1,
} from "@/lib/trust/provider/governedProviderExecution";
import type { EligibleReasoningInputV1 } from "@/lib/trust/privacy/eligibleReasoningInput";

/** Exactly what a provider is now asked for: wording, and nothing else. */
const MODEL_CONTENT = {
    reasoning_summary_overlay: "The family is waiting on documents.",
    suggested_draft_body_overlay: "Hi — we're still missing a couple of items.",
    tone_variant: "warm",
    confidence_notes: null,
};

const TRUSTED = {
    generatedAtIso: "2026-08-14T21:00:00.000Z",
    providerKey: "openai" as const,
    executionMode: "live" as const,
};

/**
 * Shaped to satisfy `isEligibleReasoningInput` — the runtime guard that refuses
 * ungoverned input. Annotated, never `as`-cast to the contract type: a cast
 * would let this fixture drift out of the shape it is claiming to have.
 */
const ELIGIBLE = {
    schema_version: 1,
    spec_key: "attention_suggestion_enrichment",
    spec_version: "1.0.0",
    decision_class_key: "attention_suggestion_enrichment_provider_backed",
    privacy_policy_key: "attention_suggestion_minimization_v1",
    content_hash: "hash-d80",
    transformations: [],
    elements: { primary_reason_code: "waiting_on_documents" },
} satisfies Record<string, unknown> as unknown as EligibleReasoningInputV1;

function strategyWithAdapter(
    respond: (req: GovernedProviderExecutionRequestV1) => ProviderAdapterResponseV1,
    seen?: { request?: GovernedProviderExecutionRequestV1 },
) {
    return createProviderBackedAttentionEnrichmentStrategy({
        resolvePort: () => ({
            adapter: {
                adapter_key: "fake",
                async execute(request) {
                    if (seen) seen.request = request;
                    return respond(request);
                },
            },
            requested_provider_key: "openai",
            requested_model_key: "some-model",
        }),
        deadline_ms: 5_000,
    });
}

function okResponse(output: Record<string, unknown>): ProviderAdapterResponseV1 {
    return {
        ok: true,
        output,
        provider_identity: { provider_key: "openai", model_key: "some-model", execution_location: "remote" },
        usage: { input_units: 298, output_units: 1066 },
    } as ProviderAdapterResponseV1;
}

async function runStrategy(output: Record<string, unknown>, nowIso = TRUSTED.generatedAtIso) {
    const strategy = strategyWithAdapter(() => okResponse(output));
    return strategy.reason({
        context: { transformed: {} } as never,
        nowIso,
        eligibleReasoningInput: ELIGIBLE,
        correlation_id: "corr-d80",
    } as never);
}

describe("D-80 — model-owned content vs Alloy-owned metadata", () => {
    it("assembles a valid canonical enrichment from model-owned content alone", () => {
        const candidate = assembleAttentionSuggestionAiEnrichment({ providerOutput: MODEL_CONTENT, ...TRUSTED });
        expect(safeParseAttentionSuggestionAiEnrichmentV1(candidate)).not.toBeNull();
    });

    it.each([
        ["agent_key", "agent_key"],
        ["provider_report", "provider_report"],
        ["generated_at_iso", "generated_at_iso"],
        ["version", "version"],
    ])("the provider need not emit %s", (_label, field) => {
        expect(MODEL_CONTENT).not.toHaveProperty(field);
        const candidate = assembleAttentionSuggestionAiEnrichment({ providerOutput: MODEL_CONTENT, ...TRUSTED });
        expect(candidate[field]).toBeDefined();
    });

    it("supplies canonical version and agent key from Alloy's own constants", () => {
        const candidate = assembleAttentionSuggestionAiEnrichment({ providerOutput: MODEL_CONTENT, ...TRUSTED });
        expect(candidate.version).toBe(1);
        expect(candidate.agent_key).toBe(NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY);
    });

    it("takes provider identity from governed execution evidence, not model JSON", () => {
        const candidate = assembleAttentionSuggestionAiEnrichment({
            providerOutput: MODEL_CONTENT,
            ...TRUSTED,
            providerKey: "anthropic",
        });
        expect(candidate.provider_report).toEqual({ provider_key: "anthropic", execution_mode: "live" });
    });

    it.each([
        ["provider identity", { provider_report: { provider_key: "impostor", execution_mode: "disabled" } }],
        ["agent key", { agent_key: "some_other_agent" }],
        ["generated timestamp", { generated_at_iso: "1999-01-01T00:00:00.000Z" }],
        ["canonical version", { version: 99 }],
    ])("a model cannot spoof %s — the trusted value is written last", (_label, spoof) => {
        const candidate = assembleAttentionSuggestionAiEnrichment({
            providerOutput: { ...MODEL_CONTENT, ...spoof },
            ...TRUSTED,
        });
        expect(candidate.version).toBe(1);
        expect(candidate.agent_key).toBe(NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY);
        expect(candidate.generated_at_iso).toBe(TRUSTED.generatedAtIso);
        expect(candidate.provider_report).toEqual({ provider_key: "openai", execution_mode: "live" });
        expect(safeParseAttentionSuggestionAiEnrichmentV1(candidate)).not.toBeNull();
    });
});

describe("D-83 — the registered validator stays the sole business authority", () => {
    it("an invalid model-owned value fails through canonical validation", () => {
        const candidate = assembleAttentionSuggestionAiEnrichment({
            providerOutput: { ...MODEL_CONTENT, tone_variant: 123 },
            ...TRUSTED,
        });
        expect(safeParseAttentionSuggestionAiEnrichmentV1(candidate)).toBeNull();
    });

    it("missing model-owned content fails through canonical validation", () => {
        const candidate = assembleAttentionSuggestionAiEnrichment({ providerOutput: {}, ...TRUSTED });
        // Well-formed envelope, no enrichment in it. An enrichment that
        // enriches nothing is not a recommendation.
        expect(candidate.agent_key).toBe(NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY);
        expect(safeParseAttentionSuggestionAiEnrichmentV1(candidate)).toBeNull();
    });

    it("a smuggled foreign field SURVIVES assembly so the canonical contract can refuse it", () => {
        const candidate = assembleAttentionSuggestionAiEnrichment({
            providerOutput: { ...MODEL_CONTENT, trust_score: 99 },
            ...TRUSTED,
        });
        // Deliberately still present: dropping it here would hide the attempt
        // from the only authority allowed to judge it.
        expect(candidate.trust_score).toBe(99);
        expect(safeParseAttentionSuggestionAiEnrichmentV1(candidate)).toBeNull();
    });

    it("the strategy runs no final-schema safeParse — an invalid candidate is still returned for validation", async () => {
        const outcome = await runStrategy({ ...MODEL_CONTENT, trust_score: 99 });
        // If the strategy validated, this would be a refusal. It must not.
        expect(outcome.ok).toBe(true);
        expect(safeParseAttentionSuggestionAiEnrichmentV1((outcome as { proposal: { recommendation: unknown } }).proposal.recommendation)).toBeNull();
    });
});

describe("D-82 — the declaration reaches the provider, and the clock is the runtime's", () => {
    it("the adapter forwards the caller's declared output shape and adds no schema of its own", () => {
        const request = {
            schema_version: 1,
            decision_class_key: "k",
            correlation_id: "c",
            input: ELIGIBLE,
            requested_strategy_kind: "small_reasoning",
            requested_provider_key: "openai",
            deadline_ms: 1000,
            expected_output_shape: ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_OUTPUT_SHAPE,
        } as GovernedProviderExecutionRequestV1;

        const body = buildChatCompletionsBody({ model: "m", request });
        const system = (body.messages as { role: string; content: string }[])[0].content;

        expect(system).toContain("suggested_draft_body_overlay");
        expect(system).toContain("Do NOT include version, agent_key, generated_at_iso, provider_report");
    });

    it("a caller that declares nothing still gets the generic framing (additive)", () => {
        const request = {
            schema_version: 1,
            decision_class_key: "k",
            correlation_id: "c",
            input: ELIGIBLE,
            requested_strategy_kind: "small_reasoning",
            requested_provider_key: "openai",
            deadline_ms: 1000,
        } as GovernedProviderExecutionRequestV1;

        const system = (buildChatCompletionsBody({ model: "m", request }).messages as { content: string }[])[0].content;
        expect(system).toContain("governed decision system");
        expect(system).not.toContain("suggested_draft_body_overlay");
    });

    it("the strategy declares the content shape on the governed request", async () => {
        const seen: { request?: GovernedProviderExecutionRequestV1 } = {};
        const strategy = strategyWithAdapter(() => okResponse(MODEL_CONTENT), seen);
        await strategy.reason({
            context: { transformed: {} } as never,
            nowIso: TRUSTED.generatedAtIso,
            eligibleReasoningInput: ELIGIBLE,
            correlation_id: "corr-d80",
        } as never);

        expect(seen.request?.expected_output_shape).toBe(ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_OUTPUT_SHAPE);
    });

    it("stamps the runtime clock passed through strategy execution, never a wall clock", async () => {
        const outcome = await runStrategy(MODEL_CONTENT, "2026-01-02T03:04:05.000Z");
        const rec = (outcome as { proposal: { recommendation: Record<string, unknown> } }).proposal.recommendation;
        expect(rec.generated_at_iso).toBe("2026-01-02T03:04:05.000Z");
    });

    it("the declared shape names only model-owned fields", () => {
        const declared = ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_OUTPUT_SHAPE;
        for (const owned of Object.keys(attentionSuggestionAiEnrichmentProviderContentV1Schema.shape)) {
            expect(declared).toContain(owned);
        }
    });
});
