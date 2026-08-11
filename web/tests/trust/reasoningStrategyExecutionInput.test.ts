/**
 * Phase 2.8 Gate C0 — the strategy execution input contract.
 *
 * The runtime required `eligibleReasoningInput` for provider-capable strategies
 * and then never handed it to them, so a registry-selected provider strategy
 * could not reach the governed artifact it was obliged to send. These tests pin
 * the additive fix and, more importantly, pin that it changed nothing for the
 * deterministic strategies certified in Phase 1.
 */

import { describe, expect, it, vi } from "vitest";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { createOpenAiCompatibleProviderAdapter } from "@/lib/ai/trust/openAiCompatibleProviderAdapter";
import { buildEligibleReasoningInput, buildInformationPackage } from "@/lib/trust/information/informationPackage";
import type { EligibleReasoningInputV1 } from "@/lib/trust/information/informationPackage";
import type { PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";
import type { ReasoningContextV1 } from "@/lib/trust/privacy/privacyEngine";
import type { ReasoningStrategyExecutionInputV1, ReasoningStrategyV1 } from "@/lib/trust/reasoning/reasoningStrategy";
import { attentionSuggestionEnrichmentDeterministicStrategy } from "@/lib/trust/reasoning/strategies/attentionSuggestionEnrichmentDeterministic";
import { attentionEnrichmentInformationSpec } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/informationSpec";
import { createProviderBackedAttentionEnrichmentStrategy } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/providerBackedStrategy";

const PRIVACY: PrivacyPolicyV1 = { key: "operator_safe_v1", pii_mode: "standard", prohibited_classes: [] };

const SUGGESTION: AttentionSuggestionV1 = {
    version: 1,
    agent_key: "needs_attention_suggestion",
    suggestion_id: "sug-1",
    target: { entity_type: "opportunities", entity_id: "opp-1" },
    source: {
        resolver: "opportunity_attention",
        resolver_version: 1,
        primary_reason_code: "tour_no_followup",
        reason_codes: ["tour_no_followup"],
        activity_signal_key: "no_touch_14d",
    },
    next_action: { key: "send_followup", label: "Send follow-up", action_family: "follow_up", confidence: "deterministic" },
    reasoning: { summary: "Operational attention.", factors: [{ code: "tour_no_followup", label: "Tour" }] },
    suggested_content: { channel: "email", template_key: "tour_followup_v1", body: "Hi Dana,", variables: {} },
    generated_at_iso: "2026-08-10T00:00:00.000Z",
};

function eligibleInput(): EligibleReasoningInputV1 {
    const pkg = buildInformationPackage({
        spec: attentionEnrichmentInformationSpec,
        source: SUGGESTION,
        sourceRefs: { org_id: "org-1" },
    });
    if (!pkg.ok) throw new Error(`package refused: ${pkg.refusal_code}`);
    const e = buildEligibleReasoningInput({ package: pkg.package, policy: PRIVACY });
    if (!e.ok) throw new Error(`privacy refused: ${e.refusal_code}`);
    return e.input;
}

/** The deterministic context shape the certified strategies already consume. */
function deterministicContext(): ReasoningContextV1 {
    return {
        transformed: {
            deterministic_attention_suggestion: {
                primary_reason_code: "tour_no_followup",
                next_action_key: "send_followup",
                template_key: "tour_followup_v1",
                channel: "email",
                reasoning_summary: "Operational attention.",
                draft_body: "Hi Dana,",
            },
        },
        classes_present: [],
        pii_mode: "standard",
        transformations: [],
        text_minimizations: [],
        redaction_steps: [],
    } as unknown as ReasoningContextV1;
}

describe("P28C0-1 — deterministic strategies are unaffected", () => {
    it("executes with NO eligible input, exactly as before", () => {
        const outcome = attentionSuggestionEnrichmentDeterministicStrategy.reason({
            context: deterministicContext(),
            nowIso: "2026-08-10T00:00:00.000Z",
        });
        expect(outcome).toBeDefined();
    });

    it("produces an identical result whether or not the new fields are present", () => {
        const base = attentionSuggestionEnrichmentDeterministicStrategy.reason({
            context: deterministicContext(),
            nowIso: "2026-08-10T00:00:00.000Z",
        });
        const withExtras = attentionSuggestionEnrichmentDeterministicStrategy.reason({
            context: deterministicContext(),
            nowIso: "2026-08-10T00:00:00.000Z",
            eligibleReasoningInput: eligibleInput(),
            correlation_id: "corr-1",
        });
        // The certified deterministic path ignores the widening entirely.
        expect(JSON.stringify(withExtras)).toBe(JSON.stringify(base));
    });

    it("remains a `deterministic` kind, so the escalation ladder is unchanged", () => {
        expect(attentionSuggestionEnrichmentDeterministicStrategy.kind).toBe("deterministic");
    });
});

describe("P28C0-2 — the provider strategy is registry-safe", () => {
    it("constructs from STABLE dependencies only — no request state in the factory", () => {
        const s: ReasoningStrategyV1 = createProviderBackedAttentionEnrichmentStrategy({
            resolvePort: () => ({
                adapter: createOpenAiCompatibleProviderAdapter({
                    provider_key: "openai",
                    base_url: "https://api.openai.com",
                    model: "gpt-4o-mini",
                    api_key: "sk-test-c0",
                }),
                requested_provider_key: "openai",
                requested_model_key: "gpt-4o-mini",
            }),
            deadline_ms: 20_000,
        });
        expect(s.kind).toBe("small_reasoning");
        expect(s.decision_class_key).toBe("attention_suggestion_enrichment_provider_backed");
    });

    it("a SINGLE constructed instance serves two executions with different governed inputs", async () => {
        const bodies: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((_u: string, init: RequestInit) => {
                bodies.push(String(init.body));
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: async () =>
                        JSON.stringify({
                            model: "m",
                            choices: [{ message: { content: JSON.stringify({ bad: true }) } }],
                        }),
                } as unknown as Response);
            }),
        );

        // Constructed ONCE, as the composition root would.
        const s = createProviderBackedAttentionEnrichmentStrategy({
            resolvePort: () => ({
                adapter: createOpenAiCompatibleProviderAdapter({
                    provider_key: "openai",
                    base_url: "https://api.openai.com",
                    model: "gpt-4o-mini",
                    api_key: "sk-test-c0",
                }),
                requested_provider_key: "openai",
            }),
            deadline_ms: 20_000,
        });

        const a = eligibleInput();
        await s.reason({ context: {} as never, nowIso: "t", eligibleReasoningInput: a, correlation_id: "c-A" });
        await s.reason({ context: {} as never, nowIso: "t", eligibleReasoningInput: a, correlation_id: "c-B" });

        // Correlation is per-execution; a closure would have frozen the first.
        expect(bodies[0]).toContain("c-A");
        expect(bodies[1]).toContain("c-B");
        vi.unstubAllGlobals();
    });

    it("receives the EXACT governed artifact — same content hash, unmodified", async () => {
        const seen: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((_u: string, init: RequestInit) => {
                seen.push(String(init.body));
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({ model: "m", choices: [{ message: { content: "{}" } }] }),
                } as unknown as Response);
            }),
        );

        const input = eligibleInput();
        const s = createProviderBackedAttentionEnrichmentStrategy({
            resolvePort: () => ({
                adapter: createOpenAiCompatibleProviderAdapter({
                    provider_key: "openai",
                    base_url: "https://api.openai.com",
                    model: "gpt-4o-mini",
                    api_key: "sk-test-c0",
                }),
                requested_provider_key: "openai",
            }),
            deadline_ms: 20_000,
        });
        await s.reason({ context: {} as never, nowIso: "t", eligibleReasoningInput: input, correlation_id: "c1" });

        // The artifact produced upstream is the artifact transmitted.
        expect(seen[0]).toContain(input.content_hash);
        expect(seen[0]).toContain(input.privacy_policy_key);
        vi.unstubAllGlobals();
    });

    it("refuses rather than transmitting when no governed input is supplied", async () => {
        const s = createProviderBackedAttentionEnrichmentStrategy({
            resolvePort: () => ({
                adapter: createOpenAiCompatibleProviderAdapter({
                    provider_key: "openai",
                    base_url: "https://api.openai.com",
                    model: "gpt-4o-mini",
                    api_key: "sk-test-c0",
                }),
                requested_provider_key: "openai",
            }),
            deadline_ms: 20_000,
        });
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const outcome = await s.reason({ context: {} as never, nowIso: "t", correlation_id: "c1" });

        expect(outcome.ok).toBe(false);
        // The point: nothing was sent.
        expect(fetchMock).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});

describe("P28C0-3 — boundaries the widening must not erode", () => {
    it("the governed input is NOT duplicated into the reasoning context", async () => {
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync("lib/trust/privacy/privacyEngine.ts", "utf8"),
        );
        // Reasoning context and provider-safe governed input stay distinct.
        expect(src).not.toContain("eligibleReasoningInput");
    });

    it("the runtime forwards the caller's artifact rather than rebuilding it", async () => {
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync("lib/trust/runtime/trustRuntime.ts", "utf8"),
        );
        expect(src).toContain("eligibleReasoningInput: input.eligibleReasoningInput");
        // Privacy is not re-run for a supplied governed input.
        expect(src).not.toContain("buildEligibleReasoningInput(");
    });

    it("the strategy resolves no credential and constructs no transport", async () => {
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync("lib/trust/capabilities/attentionSuggestionEnrichment/providerBackedStrategy.ts", "utf8"),
        );
        expect(src).not.toMatch(/process\.env/);
        expect(src).not.toMatch(/API_KEY/);
        expect(src).not.toContain("createOpenAiCompatibleProviderAdapter");
    });

    it("no request-scoped state survives in the strategy factory config", async () => {
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync("lib/trust/capabilities/attentionSuggestionEnrichment/providerBackedStrategy.ts", "utf8"),
        );
        expect(src).not.toContain("eligible_input:");
        expect(src).not.toContain("correlation_id: string;");
    });

    it("the execution input is a named contract, not an inline bag", async () => {
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync("lib/trust/reasoning/reasoningStrategy.ts", "utf8"),
        );
        expect(src).toContain("export type ReasoningStrategyExecutionInputV1");
        expect(src).toContain("reason(input: ReasoningStrategyExecutionInputV1)");
    });
});
