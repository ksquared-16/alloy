/**
 * Phase 2.8 Gate A — the first production connection of the governed provider
 * stack to a capability.
 *
 * The chain under test, end to end with intercepted transport:
 *
 *   Information Package → Trust privacy → Eligible Reasoning Input
 *     → executeGovernedProviderReasoning → Phase 2.7 ProviderAdapterV1
 *     → normalized result → registered Trust validation → proposal
 *
 * No network, no credential, no live provider. The live route is not imported.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { createOpenAiCompatibleProviderAdapter } from "@/lib/ai/trust/openAiCompatibleProviderAdapter";
import { buildEligibleReasoningInput, buildInformationPackage } from "@/lib/trust/information/informationPackage";
import type { EligibleReasoningInputV1 } from "@/lib/trust/information/informationPackage";
import type { PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";
import { attentionEnrichmentInformationSpec } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/informationSpec";
import { createProviderBackedAttentionEnrichmentStrategy } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/providerBackedStrategy";
import { validateAttentionEnrichmentResult } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/validationPolicy";

const API_KEY = "sk-test-GATE-A-DO-NOT-LEAK";
const CONTACT_NAME = "Dana Okonkwo";
const ARBITRARY_PROSE = "Re: Dana asked about tuition — call 555-0100";

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
    reasoning: {
        summary: `Operational attention: Tour with no follow-up. Last activity: ${ARBITRARY_PROSE}.`,
        factors: [{ code: "tour_no_followup", label: "Tour with no follow-up", severity: "high", sla_tier: "t2" }],
    },
    suggested_content: {
        channel: "email",
        template_key: "tour_followup_v1",
        body: `Hi ${CONTACT_NAME},\n\nI wanted to follow up on your tour.`,
        variables: {},
    },
    generated_at_iso: "2026-08-10T00:00:00.000Z",
};

const POLICY: PrivacyPolicyV1 = { key: "operator_safe_v1", pii_mode: "standard", prohibited_classes: [] };

function eligibleInput(): EligibleReasoningInputV1 {
    const pkg = buildInformationPackage({
        spec: attentionEnrichmentInformationSpec,
        source: SUGGESTION,
        sourceRefs: { org_id: "org-1" },
    });
    if (!pkg.ok) throw new Error(`fixture package refused: ${pkg.refusal_code}`);
    const eligible = buildEligibleReasoningInput({ package: pkg.package, policy: POLICY });
    if (!eligible.ok) throw new Error(`fixture privacy refused: ${eligible.refusal_code}`);
    return eligible.input;
}

function adapter() {
    return createOpenAiCompatibleProviderAdapter({
        provider_key: "openai",
        base_url: "https://api.openai.com",
        model: "gpt-4o-mini",
        api_key: API_KEY,
    });
}

function strategy(overrides?: { deadline_ms?: number }) {
    return createProviderBackedAttentionEnrichmentStrategy({
        eligible_input: eligibleInput(),
        adapter: adapter(),
        requested_provider_key: "openai",
        requested_model_key: "gpt-4o-mini",
        deadline_ms: overrides?.deadline_ms ?? 20_000,
        correlation_id: "corr-1",
    });
}

const VALID_ENRICHMENT = {
    version: 1,
    agent_key: "needs_attention_suggestion_enrichment",
    reasoning_summary_overlay: "Follow up on the tour.",
    suggested_draft_body_overlay: "A warmer follow-up note.",
    tone_variant: "warm",
    confidence_notes: null,
    generated_at_iso: "2026-08-10T00:00:01.000Z",
    provider_report: { provider_key: "openai", execution_mode: "live" },
};

function completion(content: unknown, extra?: Record<string, unknown>) {
    return {
        ok: true,
        status: 200,
        text: async () =>
            JSON.stringify({
                model: "gpt-4o-mini-2024-07-18",
                choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
                ...extra,
            }),
    } as unknown as Response;
}

function run(content: unknown, extra?: Record<string, unknown>) {
    const fetchMock = vi.fn().mockResolvedValue(completion(content, extra));
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, exec: () => strategy().reason({ context: {} as never, nowIso: "2026-08-10T00:00:00.000Z" }) };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("P28GA-1 — the governed chain is the one that runs", () => {
    it("the provider-safe package builds and privacy admits it", () => {
        const input = eligibleInput();
        expect(input.schema_version).toBe(1);
        expect(input.privacy_policy_key).toBe("operator_safe_v1");
        expect(Object.keys(input.elements)).toHaveLength(10);
    });

    it("the strategy declares model reasoning, not deterministic", () => {
        const s = strategy();
        expect(s.kind).toBe("small_reasoning");
        expect(s.decision_class_key).toBe("attention_suggestion_enrichment");
    });

    it("the real governed seam is invoked — the adapter receives the Eligible Reasoning Input", async () => {
        const { fetchMock, exec } = run(VALID_ENRICHMENT);
        await exec();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
            messages: { role: string; content: string }[];
        };
        const payload = JSON.parse(body.messages.find((m) => m.role === "user")!.content) as Record<string, unknown>;
        expect(payload.privacy_policy_key).toBe("operator_safe_v1");
        expect(payload.content_hash).toEqual(expect.stringContaining("teri1:"));
    });

    it("no contact identity, no arbitrary prose and no raw source object reach transport", async () => {
        const { fetchMock, exec } = run(VALID_ENRICHMENT);
        await exec();

        const wire = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
        expect(wire).not.toContain(CONTACT_NAME);
        expect(wire).not.toContain("Dana");
        expect(wire).not.toContain(ARBITRARY_PROSE);
        expect(wire).not.toContain("asked about tuition");
        expect(wire).not.toContain("I wanted to follow up");
        expect(wire).not.toContain("suggestion_id");
        expect(wire).not.toContain("opp-1");
    });
});

describe("P28GA-2 — valid output becomes a capability result", () => {
    it("produces a proposal carrying the enrichment", async () => {
        const { exec } = run(VALID_ENRICHMENT);
        const outcome = await exec();

        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.proposal.recommendation).toMatchObject({
            version: 1,
            agent_key: "needs_attention_suggestion_enrichment",
            tone_variant: "warm",
        });
    });

    it("reports no calibrated confidence rather than inventing one", async () => {
        const { exec } = run(VALID_ENRICHMENT);
        const outcome = await exec();
        expect(outcome.ok && outcome.proposal.confidence).toBeNull();
    });
});

describe("P28GA-3 — Trust owns business validation, not transport", () => {
    it("the registered policy is the thing that decides validity", () => {
        expect(validateAttentionEnrichmentResult(VALID_ENRICHMENT).ok).toBe(true);
        expect(validateAttentionEnrichmentResult({ nonsense: true }).ok).toBe(false);
    });

    it("an invalid enum is rejected", async () => {
        const { exec } = run({ ...VALID_ENRICHMENT, provider_report: { provider_key: "impostor", execution_mode: "live" } });
        const outcome = await exec();
        expect(outcome.ok).toBe(false);
        expect(!outcome.ok && outcome.refusal_code).toBe("REASONING_UNABLE");
    });

    it("a missing required field is rejected", async () => {
        const { generated_at_iso: _omitted, ...missing } = VALID_ENRICHMENT;
        const { exec } = run(missing);
        expect((await exec()).ok).toBe(false);
    });

    it("a smuggled extra field is rejected — the contract is strict", async () => {
        const { exec } = run({ ...VALID_ENRICHMENT, trust_score: 99, lifecycle_state: "accepted" });
        expect((await exec()).ok).toBe(false);
    });

    it("the adapter does NOT decide validity — it normalized the envelope and passed nonsense through", async () => {
        const fetchMock = vi.fn().mockResolvedValue(completion({ utter: "nonsense" }));
        vi.stubGlobal("fetch", fetchMock);
        // Transport succeeded...
        const raw = await adapter().execute({
            schema_version: 1,
            decision_class_key: "attention_suggestion_enrichment",
            correlation_id: "c",
            input: eligibleInput(),
            requested_strategy_kind: "small_reasoning",
            requested_provider_key: "openai",
            deadline_ms: 20_000,
        });
        expect(raw.ok).toBe(true);
        // ...and Trust is what refused it.
        expect(validateAttentionEnrichmentResult({ utter: "nonsense" }).ok).toBe(false);
    });
});

describe("P28GA-4 — telemetry facts are forwarded, never assembled", () => {
    it("provider, model and locality are retained on success", async () => {
        const { exec } = run(VALID_ENRICHMENT);
        const outcome = await exec();
        expect(outcome.provider_execution?.identity).toMatchObject({
            provider_key: "openai",
            model_key: "gpt-4o-mini-2024-07-18",
            execution_location: "remote",
        });
    });

    it("supplied usage is retained", async () => {
        const { exec } = run(VALID_ENRICHMENT, { usage: { prompt_tokens: 120, completion_tokens: 40 } });
        const outcome = await exec();
        expect(outcome.provider_execution?.usage).toEqual({ input_units: 120, output_units: 40 });
    });

    it("absent usage remains absent — never zero", async () => {
        const { exec } = run(VALID_ENRICHMENT);
        const outcome = await exec();
        expect(outcome.provider_execution?.usage).toBeUndefined();
    });

    it("identity is retained on FAILURE too — a call that failed still names who failed", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
        const outcome = await strategy().reason({ context: {} as never, nowIso: "2026-08-10T00:00:00.000Z" });
        expect(outcome.ok).toBe(false);
        expect(outcome.provider_execution?.identity.provider_key).toBe("openai");
    });
});

describe("P28GA-5 — D-19 survives the migration", () => {
    it("Trust's deadline still terminates a non-cooperative provider", async () => {
        vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));
        const outcome = await strategy({ deadline_ms: 20 }).reason({
            context: {} as never,
            nowIso: "2026-08-10T00:00:00.000Z",
        });
        expect(outcome.ok).toBe(false);
        expect(!outcome.ok && outcome.detail).toContain("timeout");
    });

    it("the AbortSignal still reaches transport through the strategy", async () => {
        const seen: (AbortSignal | undefined)[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((_u: string, init: RequestInit) => {
                seen.push(init.signal ?? undefined);
                return Promise.resolve(completion(VALID_ENRICHMENT));
            }),
        );
        await strategy().reason({ context: {} as never, nowIso: "2026-08-10T00:00:00.000Z" });
        expect(seen[0]).toBeInstanceOf(AbortSignal);
    });
});

describe("P28GA-6 — hostile provider output cannot reach durable evidence", () => {
    it("provider error prose never enters the refusal", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                text: async () => JSON.stringify({ error: { message: `key ${API_KEY} invalid; mail evil@example.com` } }),
            } as unknown as Response),
        );
        const outcome = await strategy().reason({ context: {} as never, nowIso: "2026-08-10T00:00:00.000Z" });
        const blob = JSON.stringify(outcome);
        expect(blob).not.toContain(API_KEY);
        expect(blob).not.toContain("evil@example.com");
        expect(blob).not.toContain("invalid");
    });

    it("no credential appears in any outcome", async () => {
        const { exec } = run(VALID_ENRICHMENT);
        expect(JSON.stringify(await exec())).not.toContain(API_KEY);
    });

    it("the validation refusal names the contract, never the rejected content", () => {
        const res = validateAttentionEnrichmentResult({ secret_note: "Dana Okonkwo lives at 12 Elm St" });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.detail).not.toContain("Dana Okonkwo");
        expect(res.detail).not.toContain("Elm St");
        expect(res.detail).toContain("attention_suggestion_enrichment_result_v1");
    });
});

describe("P28GA-7 — boundaries hold", () => {
    it("the strategy resolves no credential and constructs no adapter", async () => {
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync("lib/trust/capabilities/attentionSuggestionEnrichment/providerBackedStrategy.ts", "utf8"),
        );
        expect(src).not.toMatch(/process\.env/);
        expect(src).not.toMatch(/\bfetch\s*\(/);
        expect(src).not.toMatch(/API_KEY/);
        // The adapter arrives as a port; it is never built here.
        expect(src).not.toContain("createOpenAiCompatibleProviderAdapter");
    });

    it("validation is delegated, not duplicated inside the strategy", async () => {
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync("lib/trust/capabilities/attentionSuggestionEnrichment/providerBackedStrategy.ts", "utf8"),
        );
        expect(src).toContain("validateAttentionEnrichmentResult");
        // No second copy of the business contract.
        expect(src).not.toContain("agent_key:");
        expect(src).not.toContain("safeParse");
    });
});
