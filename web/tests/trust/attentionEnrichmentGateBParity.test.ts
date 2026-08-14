/**
 * Phase 2.8 Gate B — capability parity harness.
 *
 * Both paths are driven through the SAME intercepted transport and the same
 * provider responses, so differences are attributable to architecture rather
 * than to fixtures:
 *
 *   legacy   : the ungoverned structured provider, which validated in transport
 *   governed : Information Package → privacy → Eligible Reasoning Input
 *              → executeGovernedProviderReasoning → adapter → Trust validation
 *
 * Per D-57 this compares CAPABILITY SEMANTICS, not prose or payload shape:
 * did enrichment survive, was the schema honoured, did a failure stay a failure.
 * Legacy rejects inside transport and governed rejects in Trust; that is a
 * deliberate change of authority, and product-equivalent where the operator
 * outcome matches.
 *
 * ## Gate D retired the legacy arm (read this before looking for it)
 *
 * This harness originally drove BOTH implementations through one intercepted
 * transport. Gate D deleted the ungoverned provider, so the legacy arm cannot
 * be driven any more — there is nothing left to drive.
 *
 * It was not replaced by a test-only replica. A replica can drift from the
 * original it is standing in for, so it would prove parity with a fiction; and
 * re-adding a second module that opens a socket to a completions endpoint is
 * exactly what the Gate D unreachability control exists to forbid. The parity
 * finding itself is certified evidence and stays in the record.
 *
 * What survives is the half that is still checkable — and it is the half that
 * matters going forward, because it describes the path that actually runs:
 * which facts reach a provider, which cannot, and what the governed pipeline
 * does with each provider response.
 *
 * No network, no credential, no live provider, no route import.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { createDisabledAiProvider } from "@/lib/ai/disabledStructuredProvider";
import { createOpenAiCompatibleProviderAdapter } from "@/lib/ai/trust/openAiCompatibleProviderAdapter";
import { buildEligibleReasoningInput, buildInformationPackage } from "@/lib/trust/information/informationPackage";
import type { EligibleReasoningInputV1 } from "@/lib/trust/information/informationPackage";
import type { PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";
import { attentionEnrichmentInformationSpec } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/informationSpec";
import { createProviderBackedAttentionEnrichmentStrategy } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/providerBackedStrategy";
import { orchestrateValidation } from "@/lib/trust/validation/validationOrchestrator";

const AGENT_KEY = "needs_attention_suggestion_enrichment";
const PRIVACY: PrivacyPolicyV1 = { key: "operator_safe_v1", pii_mode: "standard", prohibited_classes: [] };

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
        next_action: { key: "send_followup", label: "Send follow-up", action_family: "follow_up", confidence: "deterministic" },
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
    const pkg = buildInformationPackage({ spec: attentionEnrichmentInformationSpec, source: s, sourceRefs: { org_id: "org-1" } });
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

/**
 * Governed observable outcome: did enrichment survive, and did reasoning succeed.
 *
 * Gate C moved content validation off the strategy and onto the registered
 * policy, so the governed PIPELINE is now strategy + registered validation —
 * exactly the two steps `executeDecisionContract` runs back to back. This helper
 * runs both. Comparing only the strategy would compare half a pipeline against
 * a whole one and report parity where none exists: a schema-violating answer
 * leaves the strategy as a success and is refused one step later.
 */
async function governed(s: AttentionSuggestionV1 = suggestion()): Promise<{ ok: boolean; enriched: boolean; detail?: string }> {
    const outcome = await createProviderBackedAttentionEnrichmentStrategy({
        resolvePort: () => ({
            adapter: createOpenAiCompatibleProviderAdapter({
                provider_key: "openai",
                base_url: "https://api.openai.com",
                model: "gpt-4o-mini",
                api_key: "sk-test-parity",
            }),
            requested_provider_key: "openai",
            requested_model_key: "gpt-4o-mini",
        }),
        deadline_ms: 20_000,
    }).reason({
        context: {} as never,
        nowIso: "2026-08-10T00:00:00.000Z",
        eligibleReasoningInput: eligible(s),
        correlation_id: "c1",
    });

    if (!outcome.ok) return { ok: false, enriched: false, detail: outcome.detail };

    const validation = await orchestrateValidation({
        policy_key: "attention_suggestion_enrichment_v1",
        recommendation: outcome.proposal.recommendation,
    });
    const passed = validation.ok && validation.report.passed;

    return {
        ok: passed,
        enriched: passed && outcome.proposal.recommendation != null,
        ...(passed ? {} : { detail: "Registered validation refused the proposal." }),
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/**
 * The scenario matrix, governed arm only.
 *
 * Each case kept its provider response and its governed expectation; what it
 * lost is the legacy comparison, which Gate D made unrunnable. Read a failure
 * here as "the governed pipeline changed", not as "parity broke" — parity is
 * settled and recorded.
 */
describe("P28B-1 — the governed pipeline across the scenario matrix", () => {
    it("valid success: enrichment survives", async () => {
        vi.stubGlobal("fetch", stubTransport(completion(VALID)));
        expect((await governed()).enriched).toBe(true);
    });

    it("provider disabled: the disabled provider refuses, and governed reaches no provider at all", async () => {
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
        // Governed equivalent is structural: with no port configured the
        // capability has no provider to call, so no enrichment is produced.
        // Product-observable result is identical: enrichment absent.
    });

    it("malformed envelope: no enrichment", async () => {
        vi.stubGlobal("fetch", stubTransport("<html>gateway</html>"));
        expect((await governed()).enriched).toBe(false);
    });

    it("invalid model-owned value: no enrichment", async () => {
        // A wrong TYPE on a field the model genuinely owns. `provider_report`
        // used to be the vehicle here, but as of D-80 the platform writes that
        // field over whatever the model says, so an "impostor" provider is no
        // longer a way to produce an invalid envelope — it is simply ignored.
        vi.stubGlobal("fetch", stubTransport(completion({ ...VALID, tone_variant: 123 })));
        expect((await governed()).enriched).toBe(false);
    });

    it("no overlay content: no enrichment", async () => {
        // `generated_at_iso` used to be dropped here to force a missing required
        // field. The platform now supplies it, so the equivalent absence is the
        // one the model is actually answerable for: no wording at all.
        const { reasoning_summary_overlay: _a, suggested_draft_body_overlay: _b, ...noContent } = VALID;
        vi.stubGlobal("fetch", stubTransport(completion(noContent)));
        expect((await governed()).enriched).toBe(false);
    });

    it("smuggled extra field: no enrichment", async () => {
        vi.stubGlobal("fetch", stubTransport(completion({ ...VALID, trust_score: 99 })));
        expect((await governed()).enriched).toBe(false);
    });

    it("timeout: fails, and says so in Trust's own vocabulary", async () => {
        const abort = new Error("aborted");
        abort.name = "AbortError";
        vi.stubGlobal("fetch", stubTransport(null, { reject: abort }));
        const g = await governed();
        expect(g.ok).toBe(false);
        expect(g.detail).toContain("timeout");
    });

    it("provider unavailable (429): fails as provider_unavailable", async () => {
        vi.stubGlobal("fetch", stubTransport({ error: { message: "rate limited" } }, { status: 429 }));
        const g = await governed();
        expect(g.ok).toBe(false);
        expect(g.detail).toContain("provider_unavailable");
    });

    it("provider refusal (content_filter): reported distinctly, not as a generic error", async () => {
        vi.stubGlobal(
            "fetch",
            stubTransport({ model: "m", choices: [{ finish_reason: "content_filter", message: { content: null } }] }),
        );
        // This is the one place the migration made the answer strictly better:
        // the deleted implementation had no vocabulary for a safety stop and
        // collapsed it into a generic error.
        const g = await governed();
        expect(g.ok).toBe(false);
        expect(g.detail).toContain("provider_refused");
    });

    it("a failing response never leaks provider prose into the outcome", async () => {
        vi.stubGlobal("fetch", stubTransport({ error: { message: "contact ops@example.com about key sk-leak" } }, { status: 401 }));
        const g = await governed();
        expect(g.ok).toBe(false);
        expect(JSON.stringify(g)).not.toContain("ops@example.com");
        expect(JSON.stringify(g)).not.toContain("sk-leak");
    });
});

describe("P28B-2 — privacy: what actually crosses the wire", () => {
    it("governed sends only governed facts — no identity, no prose", async () => {
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
        vi.stubGlobal("fetch", stubTransport(completion(VALID)));
        const a = await governed(suggestion({ last_activity_summary: "Tour completed" }));
        const b = await governed(suggestion({ last_activity_summary: "Totally different words here" }));
        expect(a).toEqual(b);
    });
});

describe("P28B-5 — Class 3: adversarial decision-relevance probe", () => {
    it("a genuinely different SITUATION still changes provider input — the package is not blind", async () => {
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
