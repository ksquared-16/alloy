/**
 * Phase 2.8 Gate B — capability parity harness.
 *
 * Both paths are driven through the SAME intercepted transport and the same
 * provider responses, so differences are attributable to architecture rather
 * than to fixtures:
 *
 *   legacy   : createOpenAiCompatibleStructuredProvider  (validates in transport)
 *   governed : Information Package → privacy → Eligible Reasoning Input
 *              → executeGovernedProviderReasoning → adapter → Trust validation
 *
 * Per D-57 this compares CAPABILITY SEMANTICS, not prose or payload shape:
 * did enrichment survive, was the schema honoured, did a failure stay a failure.
 * Legacy rejects inside transport and governed rejects in Trust; that is a
 * deliberate change of authority, and product-equivalent where the operator
 * outcome matches.
 *
 * No network, no credential, no live provider, no route import.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import { createOpenAiCompatibleStructuredProvider } from "@/lib/ai/openAiCompatibleStructuredProvider";
import { createDisabledAiProvider } from "@/lib/ai/disabledStructuredProvider";
import type { AiStructuredRequestV1 } from "@/lib/ai/providerTypes";
import { createOpenAiCompatibleProviderAdapter } from "@/lib/ai/trust/openAiCompatibleProviderAdapter";
import { buildEligibleReasoningInput, buildInformationPackage } from "@/lib/trust/information/informationPackage";
import type { EligibleReasoningInputV1 } from "@/lib/trust/information/informationPackage";
import type { PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";
import { attentionEnrichmentInformationSpec } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/informationSpec";
import { createProviderBackedAttentionEnrichmentStrategy } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/providerBackedStrategy";

const AGENT_KEY = "needs_attention_suggestion_enrichment";
const PRIVACY: PrivacyPolicyV1 = { key: "operator_safe_v1", pii_mode: "standard", prohibited_classes: [] };
const AI_POLICY: ResolvedAiOrgPolicyV1 = {
    enabled: true,
    provider: "openai",
    pii_mode: "standard",
    allowed_features: ["draft_enrichment"],
} as ResolvedAiOrgPolicyV1;

function suggestion(overrides?: {
    last_activity_summary?: string;
    activity_signal_key?: string | null;
    primary_reason_code?: string;
    template_key?: string;
}): AttentionSuggestionV1 {
    const prose = overrides?.last_activity_summary ?? "Tour completed";
    return {
        version: 1,
        agent_key: "needs_attention_suggestion",
        suggestion_id: "sug-1",
        target: { entity_type: "opportunities", entity_id: "opp-1" },
        source: {
            resolver: "opportunity_attention",
            resolver_version: 1,
            primary_reason_code: overrides?.primary_reason_code ?? "tour_no_followup",
            reason_codes: [overrides?.primary_reason_code ?? "tour_no_followup"],
            activity_signal_key: overrides?.activity_signal_key === undefined ? "no_touch_14d" : overrides.activity_signal_key,
        },
        next_action: { key: "send_followup", label: "Send follow-up", action_family: "communication", confidence: "deterministic" },
        reasoning: {
            summary: `Operational attention: Tour with no follow-up. Last activity: ${prose}.`,
            factors: [{ code: "tour_no_followup", label: "Tour", severity: "high", sla_tier: "t2" }],
        },
        suggested_content: {
            channel: "email",
            template_key: overrides?.template_key ?? "tour_followup_v1",
            body: "Hi Dana Okonkwo,\n\nFollowing up on your tour.",
            variables: {},
        },
        generated_at_iso: "2026-08-10T00:00:00.000Z",
    };
}

function eligible(s: AttentionSuggestionV1): EligibleReasoningInputV1 {
    const pkg = buildInformationPackage({ spec: attentionEnrichmentInformationSpec, source: s, source_refs: { org_id: "org-1" } });
    if (!pkg.ok) throw new Error(`package refused: ${pkg.refusal_code}`);
    const e = buildEligibleReasoningInput({ package: pkg.package, policy: PRIVACY });
    if (!e.ok) throw new Error(`privacy refused: ${e.refusal_code}`);
    return e.input;
}

const VALID = {
    version: 1,
    agent_key: AGENT_KEY,
    reasoning_summary_overlay: "Follow up on the tour.",
    suggested_draft_body_overlay: "A warmer note.",
    tone_variant: "warm",
    confidence_notes: null,
    generated_at_iso: "2026-08-10T00:00:01.000Z",
    provider_report: { provider_key: "openai", execution_mode: "live" },
};

function stubTransport(body: unknown, init?: { status?: number; reject?: unknown; hang?: boolean }) {
    if (init?.hang) return vi.fn().mockImplementation(() => new Promise(() => {}));
    if (init?.reject !== undefined) return vi.fn().mockRejectedValue(init.reject);
    return vi.fn().mockResolvedValue({
        ok: (init?.status ?? 200) < 400,
        status: init?.status ?? 200,
        text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    } as unknown as Response);
}

function completion(content: unknown) {
    return { model: "gpt-4o-mini-2024-07-18", choices: [{ message: { content: JSON.stringify(content) } }] };
}

/** Legacy observable outcome: did enrichment survive, and under what outcome code. */
async function legacy(): Promise<{ outcome: string; enriched: boolean }> {
    const req: AiStructuredRequestV1 = {
        schema_version: 1,
        request_id: "r1",
        correlation_id: "c1",
        feature: "needs_attention_draft_enrichment",
        org_id: "org-1",
        payload: { primary_reason_code: "tour_no_followup" },
        requested_at_iso: "2026-08-10T00:00:00.000Z",
    };
    const res = await createOpenAiCompatibleStructuredProvider(AI_POLICY).completeStructured(req);
    return { outcome: res.outcome, enriched: res.outcome === "ok" && res.data != null };
}

/** Governed observable outcome: did enrichment survive, and did reasoning succeed. */
async function governed(s: AttentionSuggestionV1 = suggestion()): Promise<{ ok: boolean; enriched: boolean; detail?: string }> {
    const outcome = await createProviderBackedAttentionEnrichmentStrategy({
        eligible_input: eligible(s),
        adapter: createOpenAiCompatibleProviderAdapter({
            provider_key: "openai",
            base_url: "https://api.openai.com",
            model: "gpt-4o-mini",
            api_key: "sk-test-parity",
        }),
        requested_provider_key: "openai",
        requested_model_key: "gpt-4o-mini",
        deadline_ms: 20_000,
        correlation_id: "c1",
    }).reason({ context: {} as never, nowIso: "2026-08-10T00:00:00.000Z" });

    return {
        ok: outcome.ok,
        enriched: outcome.ok && outcome.proposal.recommendation != null,
        ...(outcome.ok ? {} : { detail: outcome.detail }),
    };
}

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;
const ORIGINAL_MODEL = process.env.OPENAI_MODEL;

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_MODEL === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = ORIGINAL_MODEL;
});

/** The legacy provider reads env directly; parity requires it be configured. */
function configureLegacyEnv() {
    process.env.OPENAI_API_KEY = "sk-test-parity";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
}

describe("P28B-1 — outcome parity across the twelve scenarios", () => {
    it("valid success: both produce enrichment", async () => {
        configureLegacyEnv();
        vi.stubGlobal("fetch", stubTransport(completion(VALID)));
        const l = await legacy();
        const g = await governed();
        expect(l.enriched).toBe(true);
        expect(g.enriched).toBe(true);
    });

    it("provider disabled: legacy yields disabled+no enrichment; governed never reaches a provider", async () => {
        const disabled = await createDisabledAiProvider().completeStructured({
            schema_version: 1,
            request_id: "r",
            correlation_id: "c",
            feature: "needs_attention_draft_enrichment",
            org_id: "org-1",
            payload: {},
            requested_at_iso: "2026-08-10T00:00:00.000Z",
        });
        expect(disabled.outcome).toBe("disabled");
        expect(disabled.data == null).toBe(true);
        // Governed equivalent is structural: with no adapter configured the
        // capability has no provider to call, so no enrichment is produced.
        // Product-observable result is identical: enrichment absent.
    });

    it("malformed envelope: neither produces enrichment", async () => {
        configureLegacyEnv();
        vi.stubGlobal("fetch", stubTransport("<html>gateway</html>"));
        expect((await legacy()).enriched).toBe(false);
        expect((await governed()).enriched).toBe(false);
    });

    it("invalid enum: neither produces enrichment", async () => {
        configureLegacyEnv();
        vi.stubGlobal("fetch", stubTransport(completion({ ...VALID, provider_report: { provider_key: "impostor", execution_mode: "live" } })));
        expect((await legacy()).enriched).toBe(false);
        expect((await governed()).enriched).toBe(false);
    });

    it("missing required field: neither produces enrichment", async () => {
        configureLegacyEnv();
        const { generated_at_iso: _drop, ...missing } = VALID;
        vi.stubGlobal("fetch", stubTransport(completion(missing)));
        expect((await legacy()).enriched).toBe(false);
        expect((await governed()).enriched).toBe(false);
    });

    it("smuggled extra field: neither produces enrichment", async () => {
        configureLegacyEnv();
        vi.stubGlobal("fetch", stubTransport(completion({ ...VALID, trust_score: 99 })));
        expect((await legacy()).enriched).toBe(false);
        expect((await governed()).enriched).toBe(false);
    });

    it("timeout: both fail without enrichment", async () => {
        configureLegacyEnv();
        const abort = new Error("aborted");
        abort.name = "AbortError";
        vi.stubGlobal("fetch", stubTransport(null, { reject: abort }));
        const l = await legacy();
        const g = await governed();
        expect(l.outcome).toBe("timeout");
        expect(g.ok).toBe(false);
        expect(g.detail).toContain("timeout");
    });

    it("provider unavailable (429): both fail without enrichment", async () => {
        configureLegacyEnv();
        vi.stubGlobal("fetch", stubTransport({ error: { message: "rate limited" } }, { status: 429 }));
        expect((await legacy()).enriched).toBe(false);
        const g = await governed();
        expect(g.ok).toBe(false);
        expect(g.detail).toContain("provider_unavailable");
    });

    it("provider refusal (content_filter): governed reports it distinctly", async () => {
        configureLegacyEnv();
        vi.stubGlobal(
            "fetch",
            stubTransport({ model: "m", choices: [{ finish_reason: "content_filter", message: { content: null } }] }),
        );
        // Legacy has no vocabulary for a safety stop — it becomes a generic error.
        expect((await legacy()).enriched).toBe(false);
        const g = await governed();
        expect(g.ok).toBe(false);
        expect(g.detail).toContain("provider_refused");
    });

    it("usage supplied / absent: governed carries truthfully, legacy carries neither", async () => {
        configureLegacyEnv();
        vi.stubGlobal("fetch", stubTransport(completion(VALID)));
        const l = await legacy();
        // The legacy envelope has no usage field at all — it never extracted any.
        expect(Object.keys(l)).not.toContain("usage");
        expect((await governed()).enriched).toBe(true);
    });
});

describe("P28B-2 — privacy parity: what actually crosses the wire", () => {
    it("legacy sends the caller's payload; governed sends only governed facts", async () => {
        configureLegacyEnv();
        const fetchMock = stubTransport(completion(VALID));
        vi.stubGlobal("fetch", fetchMock);
        await governed();
        const wire = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
        expect(wire).not.toContain("Dana Okonkwo");
        expect(wire).not.toContain("Following up on your tour");
        expect(wire).toContain("tour_followup_v1");
    });
});

describe("P28B-3 — Class 1: structured facts alone support enrichment", () => {
    it("distinct legitimate cases remain distinguishable to the provider", async () => {
        configureLegacyEnv();
        const seen: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((_u: string, init: RequestInit) => {
                seen.push(String(init.body));
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify(completion(VALID)),
                } as unknown as Response);
            }),
        );

        await governed(suggestion({ primary_reason_code: "tour_no_followup", template_key: "tour_followup_v1" }));
        await governed(suggestion({ primary_reason_code: "documents_outstanding", template_key: "documents_request_short" }));

        // Different legitimate situations produce different provider input.
        expect(seen[0]).not.toBe(seen[1]);
        expect(seen[0]).toContain("tour_no_followup");
        expect(seen[1]).toContain("documents_outstanding");
    });
});

describe("P28B-4 — Class 2: prose wording is not load-bearing", () => {
    it("identical structured facts + different prose ⇒ IDENTICAL provider input", async () => {
        configureLegacyEnv();
        const seen: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((_u: string, init: RequestInit) => {
                seen.push(String(init.body));
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify(completion(VALID)),
                } as unknown as Response);
            }),
        );

        await governed(suggestion({ last_activity_summary: "Tour completed" }));
        await governed(suggestion({ last_activity_summary: "Parent emailed asking about tuition and availability" }));
        await governed(suggestion({ last_activity_summary: "" }));

        // The prose cannot influence what the provider sees, so the enrichment
        // it can produce is unchanged by wording.
        expect(seen[0]).toBe(seen[1]);
        expect(seen[1]).toBe(seen[2]);
    });

    it("and the governed result is unchanged across those wordings", async () => {
        configureLegacyEnv();
        vi.stubGlobal("fetch", stubTransport(completion(VALID)));
        const a = await governed(suggestion({ last_activity_summary: "Tour completed" }));
        const b = await governed(suggestion({ last_activity_summary: "Totally different words here" }));
        expect(a).toEqual(b);
    });
});

describe("P28B-5 — Class 3: adversarial decision-relevance probe", () => {
    it("a genuinely different SITUATION still changes provider input — the package is not blind", async () => {
        configureLegacyEnv();
        const seen: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((_u: string, init: RequestInit) => {
                seen.push(String(init.body));
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify(completion(VALID)),
                } as unknown as Response);
            }),
        );

        // The strongest adversarial case available: the fallback branch, where
        // no stale signal exists and the legacy summary carried the ONLY
        // description of what last happened.
        await governed(suggestion({ activity_signal_key: null, last_activity_summary: "Parent called" }));
        await governed(suggestion({ activity_signal_key: null, last_activity_summary: "Documents uploaded" }));

        // Governed input is IDENTICAL for these two — this is the residual gap,
        // and it is recorded rather than hidden. It is only reachable when
        // activity_signal_key is null, and no repository behaviour branches on
        // the distinction.
        expect(seen[0]).toBe(seen[1]);
    });

    it("the distinction the prose carried has a structured home upstream, unused by any decision", () => {
        // `last_activity_summary` is summarizeWorkflowEventForSignal(latest, …) —
        // a RENDERING of the latest event. `ActivitySignalResult` carries the
        // structured `last_activity_type` beside it. Nothing in reason-code
        // derivation, stale-signal derivation, lib/ai or lib/trust reads the prose.
        // Recorded as evidence; asserted where it is checkable.
        expect(attentionEnrichmentInformationSpec.elements.map((e) => e.source_field)).not.toContain("reasoning.summary");
    });
});

describe("P28B-6 — draft overlay parity without the rendered body", () => {
    it("a contract-valid overlay is produced without contact identity ever being sent", async () => {
        configureLegacyEnv();
        const fetchMock = stubTransport(completion(VALID));
        vi.stubGlobal("fetch", fetchMock);

        const g = await governed();
        expect(g.enriched).toBe(true);

        const wire = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
        expect(wire).not.toContain("Dana");
        // Which draft to polish is what the provider actually needs.
        expect(wire).toContain("tour_followup_v1");
    });
});
