/**
 * Phase 2.8 Gate C — the live authority switch.
 *
 * Gates A and B built the governed chain and proved it behaves like the
 * ungoverned one. Neither connected it to anything: the strategy was
 * unregistered, the route still called the bypass, and no real request could
 * reach the governed stack. Gate C connects it, and these are the proofs that
 * the connection is the one that was designed.
 *
 * Everything runs through the REAL composed registry, the REAL runtime and the
 * REAL authorization producers. Nothing here constructs a strategy by hand,
 * because a hand-built strategy would prove that a strategy works, not that the
 * platform selects it.
 *
 * The four things that must be true:
 *
 *   1. The deterministic path certified in Phase 1 is byte-for-byte unchanged in
 *      behaviour, and no provider can reach it.
 *   2. Provider-backed reasoning is reachable ONLY through affirmative
 *      `provider_backed` authorization (D-42).
 *   3. Validation is the registered policy's job, enforced by the runtime, with
 *      no second copy anywhere.
 *   4. The operator sees the same envelope either way, and telemetry tells the
 *      truth about which one ran (D-44, D-54).
 *
 * No network, no credential, no live provider: transport is intercepted, the
 * key is a literal fixture, and a control asserts the real key is absent.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminAccessContextResult, AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import type { AdminContextResult, AdminContextSuccess } from "@/lib/admin/getAdminContext";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { resolveTrustAuthorization } from "@/lib/ai/resolveTrustAuthorization";
import { AI_PROVIDER_KEYS, asAiProviderKey } from "@/lib/ai/providerTypes";
import { resolveGovernedReasoningProviderPort } from "@/lib/ai/trust/governedReasoningProviderPort";
import type { TrustAuthorizationDecision } from "@/lib/trust/authorization/trustAuthorizationDecision";
import { permitsReasoningMode } from "@/lib/trust/authorization/trustAuthorizationDecision";
import { ATTENTION_SUGGESTION_ENRICHMENT_CONTRIBUTION } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/contribution";
import { decideAttentionSuggestionEnrichment } from "@/lib/trust/consumers/attentionSuggestionEnrichment";
import { enrichAttentionSuggestionViaTrustRuntime } from "@/lib/trust/consumers/attentionSuggestionEnrichmentEnvelope";
import type {
    DecisionContractLifecycleState,
    DecisionContractV1,
} from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type {
    ReasoningUsageInput,
    TrustObservationInput,
    TrustRepository,
} from "@/lib/trust/persistence/trustDecisionRepository";
import { TRUST_REGISTRY } from "@/lib/trust/registry/trustRegistry";
import { selectStrategy } from "@/lib/trust/strategy/strategyEngine";

const WEB_ROOT = join(__dirname, "..", "..");

const ORG = "11111111-1111-1111-1111-111111111111";
const OPERATOR = "33333333-3333-3333-3333-333333333333";
const FIXTURE_KEY = "sk-test-GATE-C-DO-NOT-LEAK";
const CONTACT_NAME = "Dana Okonkwo";
const ARBITRARY_PROSE = "Re: Dana asked about tuition — call 555-0100";

const DETERMINISTIC_CLASS = "attention_suggestion_enrichment";
const PROVIDER_BACKED_CLASS = "attention_suggestion_enrichment_provider_backed";

// ---------------------------------------------------------------------------
// Fixtures, built from real producers and ANNOTATED — never cast.
// ---------------------------------------------------------------------------

function suggestion(): AttentionSuggestionV1 {
    return {
        version: 1,
        agent_key: "needs_attention_suggestion",
        suggestion_id: "sugg-gate-c",
        target: { entity_type: "opportunities", entity_id: "22222222-2222-2222-2222-222222222222" },
        source: {
            resolver: "opportunity_attention",
            resolver_version: 3,
            primary_reason_code: "tour_no_followup",
            reason_codes: ["tour_no_followup"],
            activity_signal_key: "no_touch_14d",
        },
        next_action: {
            key: "send_followup",
            label: "Send follow-up",
            action_family: "follow_up",
            confidence: "deterministic",
        },
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
}

const ADMIN_CTX: AdminContextSuccess = { ok: true, orgId: ORG, role: "admin", userId: OPERATOR };

const ACCESS_WITH_GRANT: AdminAccessContextSuccess = {
    ok: true,
    userId: OPERATOR,
    orgId: ORG,
    roleKeys: ["admin"],
    permissionKeys: ["ai.enrichment.use"],
    departmentScope: "all",
    allowedDepartmentIds: null,
    siteScope: "all",
    allowedSiteLocationIds: null,
};

const ACCESS_WITHOUT_GRANT: AdminAccessContextSuccess = { ...ACCESS_WITH_GRANT, permissionKeys: [] };

function orgMetadata(provider: "openai" | "stub"): Record<string, unknown> {
    return { ai_policy: { enabled: true, provider, pii_mode: "standard", allowed_features: ["draft_enrichment"] } };
}

/**
 * Authorization from its REAL owner.
 *
 * Deliberately not a hand-written `TrustAuthorizationDecision`. The whole of
 * D-42 is "the seam said provider_backed", so a fixture that simply asserts it
 * did would test the fixture. Every permit here is produced by
 * `resolveTrustAuthorization` from environment, org policy, permission grants
 * and portal role — the same four inputs production uses.
 */
function authorize(input: {
    provider: "openai" | "stub";
    ctx?: AdminContextResult;
    access?: AdminAccessContextResult;
}): TrustAuthorizationDecision {
    return resolveTrustAuthorization({
        consumer: "attention_draft_enrichment",
        ctx: input.ctx ?? ADMIN_CTX,
        access: input.access ?? ACCESS_WITH_GRANT,
        orgMetadata: orgMetadata(input.provider),
    });
}

function createRecordingRepository() {
    const contracts: DecisionContractV1[] = [];
    const packages: DecisionPackageV1[] = [];
    const observations: TrustObservationInput[] = [];
    const usage: ReasoningUsageInput[] = [];
    const lifecycle: DecisionContractLifecycleState[] = [];

    const repository: TrustRepository = {
        async insertContract(contract) {
            contracts.push(contract);
        },
        async advanceContractLifecycle({ lifecycle_state }) {
            lifecycle.push(lifecycle_state);
        },
        async insertPackage(pkg) {
            if (packages.some((p) => p.contract_id === pkg.contract_id)) {
                throw new Error("one-package-per-contract violated");
            }
            packages.push(pkg);
        },
        async insertObservation(o) {
            observations.push(o);
        },
        async insertReasoningUsage(u) {
            usage.push(u);
        },
    };

    return { repository, contracts, packages, observations, usage, lifecycle };
}

/**
 * What a provider may return, as of D-80/D-82: model-owned wording ONLY.
 *
 * This fixture used to carry `version`, `agent_key`, `generated_at_iso` and
 * `provider_report` — and that is exactly what made the suite green while the
 * live path could never validate. The fake adapter was being handed an answer
 * no real model was ever asked to produce, so the tests agreed with each other
 * and not with production. Content-only here is the point of the fix.
 */
const VALID_ENRICHMENT = {
    reasoning_summary_overlay: "Follow up on the tour.",
    suggested_draft_body_overlay: "A warmer follow-up note.",
    tone_variant: "warm",
    confidence_notes: null,
};

function completion(content: unknown, extra?: Record<string, unknown>): Response {
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

function interceptTransport(content: unknown, extra?: Record<string, unknown>) {
    const fetchMock = vi.fn().mockResolvedValue(completion(content, extra));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

/** One governed decision, through the real consumer and the real runtime. */
async function decide(input: {
    provider: "openai" | "stub";
    deterministic?: AttentionSuggestionV1 | null;
    access?: AdminAccessContextSuccess;
}) {
    const harness = createRecordingRepository();
    const decision = await decideAttentionSuggestionEnrichment({
        org_id: ORG,
        deterministic: input.deterministic === undefined ? suggestion() : input.deterministic,
        correlation_id: "corr-gate-c",
        initiating_actor: { actor_type: "operator", actor_id: OPERATOR },
        channel: "operator",
        authorization: authorize({ provider: input.provider, ...(input.access ? { access: input.access } : {}) }),
        repository: harness.repository,
        nowIso: "2026-08-10T00:00:00.000Z",
    });
    return { ...decision, ...harness };
}

const SAVED_ENV: Record<string, string | undefined> = {};
const MANAGED = [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_BASE_URL",
    "AI_ENRICHMENT_STUB_ENABLED",
    "AI_ENRICHMENT_USE_PERMISSION_REQUIRED",
] as const;

beforeEach(() => {
    for (const key of MANAGED) SAVED_ENV[key] = process.env[key];
    // Both modes configured, so which one executes is decided by org policy and
    // permission — never by which environment variable happens to be set.
    process.env.OPENAI_API_KEY = FIXTURE_KEY;
    process.env.OPENAI_MODEL = "gpt-4o-mini";
    process.env.OPENAI_BASE_URL = "https://api.openai.com";
    process.env.AI_ENRICHMENT_STUB_ENABLED = "true";
    process.env.AI_ENRICHMENT_USE_PERMISSION_REQUIRED = "true";
});

afterEach(() => {
    for (const key of MANAGED) {
        if (SAVED_ENV[key] === undefined) delete process.env[key];
        else process.env[key] = SAVED_ENV[key];
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Composition — the switch exists and is wired to the right things
// ---------------------------------------------------------------------------

describe("P28C-1 — the provider-backed class composes, and the deterministic one is untouched", () => {
    it("both classes are registered, sharing privacy and validation policy", () => {
        const det = TRUST_REGISTRY.requireDecisionClass(DETERMINISTIC_CLASS);
        const prov = TRUST_REGISTRY.requireDecisionClass(PROVIDER_BACKED_CLASS);

        expect(prov.privacy_policy_key).toBe(det.privacy_policy_key);
        expect(prov.validation_policy_key).toBe(det.validation_policy_key);
        expect(prov.risk_tier).toBe(det.risk_tier);
        expect(prov.review_requirement).toBe(det.review_requirement);
        expect(prov.trust_threshold).toBe(det.trust_threshold);
        expect(prov.requires_allowed_feature).toBe(det.requires_allowed_feature);
        expect(prov.required_information).toEqual(det.required_information);
    });

    it("only the escalation budget differs, and it admits small_reasoning and nothing above it", () => {
        const prov = TRUST_REGISTRY.requireDecisionClass(PROVIDER_BACKED_CLASS);
        expect(prov.strategy_preference).toEqual(["small_reasoning"]);
        // 3 is small_reasoning's index. large_reasoning (4) and human_review (5)
        // would exceed the ceiling and be refused by the strategy engine.
        expect(prov.economic_policy.max_escalation_level).toBe(3);
    });

    it("the deterministic class still refuses to escalate — its ceiling was NOT raised", () => {
        const det = TRUST_REGISTRY.requireDecisionClass(DETERMINISTIC_CLASS);
        expect(det.strategy_preference).toEqual(["deterministic"]);
        expect(det.economic_policy.max_escalation_level).toBe(0);
    });

    it("no provider-capable strategy is registered against the deterministic class", () => {
        const strategies = TRUST_REGISTRY.listStrategiesForDecisionClass(DETERMINISTIC_CLASS);
        expect(strategies.map((s) => s.kind)).toEqual(["deterministic"]);
    });

    it("exactly one strategy satisfies the provider-backed class, and it is small_reasoning", () => {
        const strategies = TRUST_REGISTRY.listStrategiesForDecisionClass(PROVIDER_BACKED_CLASS);
        expect(strategies).toHaveLength(1);
        expect(strategies[0]!.kind).toBe("small_reasoning");
        expect(strategies[0]!.key).toBe("attention_enrichment_provider_backed");
    });

    it("the registry — not the capability, not the route — selects each class's strategy", () => {
        const det = selectStrategy(TRUST_REGISTRY.requireDecisionClass(DETERMINISTIC_CLASS));
        const prov = selectStrategy(TRUST_REGISTRY.requireDecisionClass(PROVIDER_BACKED_CLASS));
        expect(det.ok && det.strategy.kind).toBe("deterministic");
        expect(det.ok && det.escalation_level).toBe(0);
        expect(prov.ok && prov.strategy.kind).toBe("small_reasoning");
        expect(prov.ok && prov.escalation_level).toBe(3);
    });

    it("the capability contributes both classes from one contribution, and still owns no privacy policy", () => {
        expect(ATTENTION_SUGGESTION_ENRICHMENT_CONTRIBUTION.decisionClasses?.map((c) => c.key)).toEqual([
            DETERMINISTIC_CLASS,
            PROVIDER_BACKED_CLASS,
        ]);
        expect(ATTENTION_SUGGESTION_ENRICHMENT_CONTRIBUTION.privacyPolicies).toBeUndefined();
        expect(ATTENTION_SUGGESTION_ENRICHMENT_CONTRIBUTION.validationPolicies).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// 2. D-42 — affirmative permission is the only route to a provider
// ---------------------------------------------------------------------------

describe("P28C-2 — provider-backed reasoning requires affirmative authorization", () => {
    it("an `openai` org policy with the grant affirms provider_backed and nothing else", () => {
        const decision = authorize({ provider: "openai" });
        expect(decision.permitted).toBe(true);
        expect(permitsReasoningMode(decision, "provider_backed")).toBe(true);
        expect(permitsReasoningMode(decision, "deterministic_local")).toBe(false);
    });

    it("a `stub` org policy affirms deterministic_local and NOT provider_backed", () => {
        const decision = authorize({ provider: "stub" });
        expect(permitsReasoningMode(decision, "deterministic_local")).toBe(true);
        expect(permitsReasoningMode(decision, "provider_backed")).toBe(false);
    });

    it("an `openai` policy WITHOUT the permission grant is refused before any class is chosen", () => {
        const decision = authorize({ provider: "openai", access: ACCESS_WITHOUT_GRANT });
        expect(decision.permitted).toBe(false);
        expect(permitsReasoningMode(decision, "provider_backed")).toBe(false);
    });

    it("an affirmative permit routes to the provider-backed class", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const result = await decide({ provider: "openai" });
        expect(result.reasoning_mode).toBe("provider_backed");
        expect(result.package.decision_class_key).toBe(PROVIDER_BACKED_CLASS);
        expect(result.contracts[0]!.decision_class_key).toBe(PROVIDER_BACKED_CLASS);
    });

    it("no affirmative permit routes to the deterministic class and reaches no transport", async () => {
        const fetchMock = interceptTransport(VALID_ENRICHMENT);
        const result = await decide({ provider: "stub" });
        expect(result.reasoning_mode).toBe("deterministic_local");
        expect(result.package.decision_class_key).toBe(DETERMINISTIC_CLASS);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a caller supplying no authorization at all takes the deterministic class — the default is closed", async () => {
        const fetchMock = interceptTransport(VALID_ENRICHMENT);
        const harness = createRecordingRepository();
        const result = await decideAttentionSuggestionEnrichment({
            org_id: ORG,
            deterministic: suggestion(),
            correlation_id: "corr-legacy",
            initiating_actor: { actor_type: "system", actor_id: null },
            channel: "operator",
            repository: harness.repository,
            nowIso: "2026-08-10T00:00:00.000Z",
        });
        expect(result.reasoning_mode).toBe("deterministic_local");
        expect(result.package.decision_class_key).toBe(DETERMINISTIC_CLASS);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a refused authorization reaches neither class's reasoning — it is recorded and stops", async () => {
        const fetchMock = interceptTransport(VALID_ENRICHMENT);
        const harness = createRecordingRepository();
        const result = await decideAttentionSuggestionEnrichment({
            org_id: ORG,
            deterministic: suggestion(),
            correlation_id: "corr-refused",
            initiating_actor: { actor_type: "operator", actor_id: OPERATOR },
            channel: "operator",
            authorization: authorize({ provider: "openai", access: ACCESS_WITHOUT_GRANT }),
            repository: harness.repository,
            nowIso: "2026-08-10T00:00:00.000Z",
        });
        expect(result.package.outcome).toBe("refused_permission");
        expect(result.enrichment).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        // Still a persisted package. A refusal is audit evidence, not an error.
        expect(harness.packages).toHaveLength(1);

        // The sharp part. A refusal permits NEITHER mode, so a selector written
        // as "not deterministic ⇒ provider" would submit the provider-backed
        // class here and be caught only by whatever refused later. The class on
        // the contract is what proves the condition is an affirmative positive.
        expect(result.reasoning_mode).toBe("deterministic_local");
        expect(result.package.decision_class_key).toBe(DETERMINISTIC_CLASS);
        expect(harness.contracts[0]!.decision_class_key).toBe(DETERMINISTIC_CLASS);
    });
});

// ---------------------------------------------------------------------------
// 3. The governed chain actually executes end to end
// ---------------------------------------------------------------------------

describe("P28C-3 — the provider-backed path runs the whole governed chain", () => {
    it("produces a recommended package carrying the provider's enrichment", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const result = await decide({ provider: "openai" });

        expect(result.package.outcome).toBe("recommended");
        expect(result.enrichment).not.toBeNull();
        expect(result.enrichment?.tone_variant).toBe("warm");
    });

    it("executes every runtime step, in the canonical order", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const result = await decide({ provider: "openai" });

        expect(result.step_trace).toEqual([
            "resolve_truth_and_context",
            "classify_information",
            "apply_privacy_transformations",
            "retrieve_authorized_knowledge",
            "select_strategy",
            "execute_reasoning",
            "deterministic_validation",
            "trust_evaluation",
            "build_decision_package",
        ]);
    });

    it("records the provider strategy on the package economics", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const result = await decide({ provider: "openai" });

        expect(result.package.economics.strategy_key).toBe("attention_enrichment_provider_backed");
        expect(result.package.economics.strategy_kind).toBe("small_reasoning");
        expect(result.package.economics.escalation_level).toBe(3);
        expect(result.package.strategy_version).toBe("3.0.0");
    });

    it("sends the governed Eligible Reasoning Input, and only that", async () => {
        const fetchMock = interceptTransport(VALID_ENRICHMENT);
        await decide({ provider: "openai" });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
        const body = JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] };
        const payload = JSON.parse(body.messages.find((m) => m.role === "user")!.content) as Record<string, unknown>;

        expect(payload.decision_class_key).toBe(PROVIDER_BACKED_CLASS);
        expect(payload.privacy_policy_key).toBe("attention_suggestion_minimization_v1");
        expect(String(payload.content_hash)).toContain("teri1:");
    });

    it("no identity, no prose and no record identifier reaches transport", async () => {
        const fetchMock = interceptTransport(VALID_ENRICHMENT);
        await decide({ provider: "openai" });

        const wire = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
        expect(wire).not.toContain(CONTACT_NAME);
        expect(wire).not.toContain("Dana");
        expect(wire).not.toContain(ARBITRARY_PROSE);
        expect(wire).not.toContain("asked about tuition");
        expect(wire).not.toContain("I wanted to follow up");
        expect(wire).not.toContain("sugg-gate-c");
        expect(wire).not.toContain("22222222-2222-2222-2222-222222222222");
    });

    it("the privacy policy actually applied is the one the class references", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const result = await decide({ provider: "openai" });
        const det = TRUST_REGISTRY.requireDecisionClass(PROVIDER_BACKED_CLASS);

        // `strict` is the registered policy's mode. A package reporting anything
        // else would mean privacy ran under a policy the class did not name.
        expect(result.package.privacy_report.pii_mode).toBe(
            TRUST_REGISTRY.requirePrivacyPolicy(det.privacy_policy_key).pii_mode,
        );
    });

    it("privacy is not re-run: the package reports the governed input's own evidence", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const result = await decide({ provider: "openai" });

        // All declared elements are closed vocabulary, so nothing needed
        // structural redaction — and the package says so rather than inventing
        // steps a second privacy pass would have produced.
        expect([...result.package.privacy_report.classes_present].sort()).toEqual(["communications", "operational"]);
    });

    it("a provider failure becomes a refusal, never an exception or a partial overlay", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
        const result = await decide({ provider: "openai" });

        expect(result.package.outcome).toBe("failed_reasoning");
        expect(result.enrichment).toBeNull();
        expect(result.package.recommendation).toBeNull();
    });

    it("a missing suggestion is the SAME refusal on both paths", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const provider = await decide({ provider: "openai", deterministic: null });
        const deterministic = await decide({ provider: "stub", deterministic: null });

        expect(provider.package.outcome).toBe("refused_insufficient_information");
        expect(deterministic.package.outcome).toBe("refused_insufficient_information");
    });
});

// ---------------------------------------------------------------------------
// 4. Validation authority — one copy, owned by the registered policy
// ---------------------------------------------------------------------------

describe("P28C-4 — the registered policy is the only validation authority", () => {
    it("a schema-violating answer becomes failed_validation, not a recommendation", async () => {
        // A model-owned field with the wrong TYPE. Note the choice: `tone_variant`
        // is a free string in the contract, so a "weird-looking" tone is VALID and
        // asserting otherwise would test a rule that does not exist. A NUMBER
        // there is genuinely off-contract, and — this is the part that matters —
        // the strategy does not catch it. It rides all the way to the registered
        // policy, which is the only thing entitled to refuse it.
        interceptTransport({ ...VALID_ENRICHMENT, tone_variant: 123 });
        const result = await decide({ provider: "openai" });

        expect(result.package.outcome).toBe("failed_validation");
        expect(result.enrichment).toBeNull();
    });

    it("a model that states its own provider identity is overruled, not obeyed (D-82)", async () => {
        // The retired ungoverned provider ASKED the model for `provider_report`,
        // so a model claiming to be someone else was once believed. Identity is
        // now taken from governed execution evidence and written over whatever
        // the model said, which is why this succeeds rather than failing: the
        // spoof is not rejected, it is irrelevant.
        interceptTransport({
            ...VALID_ENRICHMENT,
            provider_report: { provider_key: "impostor", execution_mode: "disabled" },
            agent_key: "some_other_agent",
        });
        const result = await decide({ provider: "openai" });

        expect(result.package.outcome).toBe("recommended");
        expect(result.enrichment?.provider_report).toEqual({ provider_key: "openai", execution_mode: "live" });
        expect(result.enrichment?.agent_key).toBe("needs_attention_suggestion_enrichment");
    });

    it("a smuggled Decision Package field is refused — the contract is strict", async () => {
        interceptTransport({ ...VALID_ENRICHMENT, trust_score: 99, lifecycle_state: "accepted" });
        const result = await decide({ provider: "openai" });

        expect(result.package.outcome).toBe("failed_validation");
        // The smuggled values did not become package state.
        expect(result.package.trust_score).toBeNull();
        expect(JSON.stringify(result.package)).not.toContain("lifecycle_state");
    });

    it("the validation that ran is the registered policy, named on the package", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const result = await decide({ provider: "openai" });

        expect(result.package.validation?.results.map((r) => r.validator_key)).toEqual([
            "safeParseAttentionSuggestionAiEnrichmentV1",
        ]);
        expect(result.package.validation_version).toBe(
            TRUST_REGISTRY.requireValidationPolicy("attention_suggestion_enrichment_v1").version,
        );
    });

    it("both classes are validated by the SAME registered policy — one authority, two paths", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const provider = await decide({ provider: "openai" });
        const deterministic = await decide({ provider: "stub" });

        expect(provider.package.validation?.results.map((r) => r.validator_key)).toEqual(
            deterministic.package.validation?.results.map((r) => r.validator_key),
        );
    });

    it("hostile provider prose cannot reach durable evidence through a validation failure", async () => {
        interceptTransport({ secret_note: `${CONTACT_NAME} lives at 12 Elm St`, tone_variant: "warm" });
        const result = await decide({ provider: "openai" });

        expect(result.package.outcome).toBe("failed_validation");
        const blob = JSON.stringify(result.package);
        expect(blob).not.toContain(CONTACT_NAME);
        expect(blob).not.toContain("Elm St");
    });
});

// ---------------------------------------------------------------------------
// 5. Telemetry and provider identity — D-44
// ---------------------------------------------------------------------------

describe("P28C-5 — Trust owns provider identity, and reports what answered", () => {
    it("provider identity comes back from the adapter, not from org policy", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const result = await decide({ provider: "openai" });

        expect(result.provider_execution?.identity).toMatchObject({
            provider_key: "openai",
            // The MODEL the provider reported, not the one requested.
            model_key: "gpt-4o-mini-2024-07-18",
            execution_location: "remote",
        });
    });

    it("the usage row carries provider identity; the package deliberately does not (ADR-2)", async () => {
        interceptTransport(VALID_ENRICHMENT, { usage: { prompt_tokens: 120, completion_tokens: 40 } });
        const result = await decide({ provider: "openai" });

        expect(result.usage).toHaveLength(1);
        expect(result.usage[0]).toMatchObject({
            provider_key: "openai",
            execution_location: "remote",
            input_units: 120,
            output_units: 40,
        });
        expect(JSON.stringify(result.package.economics)).not.toContain("provider_key");
    });

    it("the deterministic path reports NO provider — omission, never a zeroed row", async () => {
        const result = await decide({ provider: "stub" });

        expect(result.provider_execution).toBeUndefined();
        expect(result.usage).toHaveLength(1);
        expect(result.usage[0]).not.toHaveProperty("provider_key");
    });

    it("identity survives a FAILED call — a call that failed still names who failed", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
        const result = await decide({ provider: "openai" });

        expect(result.package.outcome).toBe("failed_reasoning");
        expect(result.provider_execution?.identity.provider_key).toBe("openai");
        expect(result.usage[0]).toMatchObject({ provider_key: "openai" });
    });

    it("the operator-facing telemetry reports a live provider success on the governed path", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const result = await enrichAttentionSuggestionViaTrustRuntime({
            org_id: ORG,
            org_metadata: orgMetadata("openai"),
            deterministic: suggestion(),
            correlation_id: "corr-envelope",
            operator_id: OPERATOR,
            authorization: authorize({ provider: "openai" }),
            repository: createRecordingRepository().repository,
        });

        expect(result.reasoning_mode).toBe("provider_backed");
        expect(result.telemetry_payload.provider_key).toBe("openai");
        expect(result.telemetry_payload.outcome).toBe("live_success");
        expect(result.envelope.enrichment).not.toBeNull();
    });

    it("the deterministic path's telemetry is unchanged from Slice 1", async () => {
        const result = await enrichAttentionSuggestionViaTrustRuntime({
            org_id: ORG,
            org_metadata: orgMetadata("stub"),
            deterministic: suggestion(),
            correlation_id: "corr-envelope-det",
            operator_id: OPERATOR,
            authorization: authorize({ provider: "stub" }),
            repository: createRecordingRepository().repository,
        });

        expect(result.reasoning_mode).toBe("deterministic_local");
        expect(result.telemetry_payload.provider_key).toBe("stub");
        expect(result.telemetry_payload.outcome).toBe("stub_success");
    });

    it("the operator envelope has the same shape on both paths (D-54)", async () => {
        interceptTransport(VALID_ENRICHMENT);
        const provider = await enrichAttentionSuggestionViaTrustRuntime({
            org_id: ORG,
            org_metadata: orgMetadata("openai"),
            deterministic: suggestion(),
            correlation_id: "corr-shape-p",
            authorization: authorize({ provider: "openai" }),
            repository: createRecordingRepository().repository,
        });
        const deterministic = await enrichAttentionSuggestionViaTrustRuntime({
            org_id: ORG,
            org_metadata: orgMetadata("stub"),
            deterministic: suggestion(),
            correlation_id: "corr-shape-d",
            authorization: authorize({ provider: "stub" }),
            repository: createRecordingRepository().repository,
        });

        expect(Object.keys(provider.envelope).sort()).toEqual(Object.keys(deterministic.envelope).sort());
        expect(Object.keys(provider.envelope.enrichment ?? {}).sort()).toEqual(
            Object.keys(deterministic.envelope.enrichment ?? {}).sort(),
        );
    });

    it("an identity outside the operator vocabulary is never renamed into it", () => {
        for (const key of AI_PROVIDER_KEYS) expect(asAiProviderKey(key)).toBe(key);
        expect(asAiProviderKey("some_future_gateway")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 6. Boundaries — the switch did not move authority into the wrong layer
// ---------------------------------------------------------------------------

describe("P28C-6 — boundaries hold across the switch", () => {
    const ROUTE = "app/api/admin/ai/enrich-attention-suggestion/route.ts";

    it("the route names no strategy, no provider and no decision class", () => {
        const src = readFileSync(join(WEB_ROOT, ROUTE), "utf8");
        expect(src).not.toContain("attention_suggestion_enrichment_provider_backed");
        expect(src).not.toContain("small_reasoning");
        expect(src).not.toContain("selectStrategy");
        expect(src).not.toContain("ProviderAdapter");
    });

    it("the route reaches the governed consumer and nothing else", () => {
        const src = readFileSync(join(WEB_ROOT, ROUTE), "utf8");
        expect(src).toContain("enrichAttentionSuggestionViaTrustRuntime");
        expect(src).not.toContain("enrichAttentionSuggestionStubEnvelope");
        expect(src).not.toContain("resolveStructuredAiProvider");
    });

    it("the route's provider branch is an explicit positive, not a fallthrough", () => {
        const src = readFileSync(join(WEB_ROOT, ROUTE), "utf8");
        expect(src).toContain('permitsReasoningMode(authorization, "provider_backed")');
        expect(src).toContain('permitsReasoningMode(authorization, "deterministic_local")');
    });

    it("the capability chooses the class from the authorization decision, not from org policy", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/trust/consumers/attentionSuggestionEnrichment.ts"),
            "utf8",
        );
        expect(src).toContain('permitsReasoningMode(input.authorization, "provider_backed")');
        expect(src).not.toContain("parseAiPolicyFromMetadata");
    });

    it("lib/trust still contains no credential and no vendor name — including in prose", () => {
        for (const rel of [
            "lib/trust/capabilities/attentionSuggestionEnrichment/contribution.ts",
            "lib/trust/capabilities/attentionSuggestionEnrichment/providerBackedStrategy.ts",
            "lib/trust/capabilities/attentionSuggestionEnrichment/keys.ts",
            "lib/trust/consumers/attentionSuggestionEnrichment.ts",
            "lib/trust/consumers/attentionSuggestionEnrichmentEnvelope.ts",
            "lib/trust/provider/governedProviderExecution.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, rel), "utf8");
            expect(src, `${rel} names the vendor`).not.toMatch(/\bopenai\b/i);
            expect(src, `${rel} performs transport`).not.toMatch(/\bfetch\s*\(/);
            expect(src, `${rel} reads a credential`).not.toContain("OPENAI_API_KEY");
        }
    });

    it("the port resolver lives outside lib/trust and is the only thing that names the vendor", () => {
        const port = readFileSync(join(WEB_ROOT, "lib/ai/trust/governedReasoningProviderPort.ts"), "utf8");
        expect(port).toMatch(/\bopenai\b/i);
        const contribution = readFileSync(
            join(WEB_ROOT, "lib/trust/capabilities/attentionSuggestionEnrichment/contribution.ts"),
            "utf8",
        );
        expect(contribution).toContain("resolveGovernedReasoningProviderPort");
    });

    it("an unconfigured provider is refused by AUTHORIZATION, before Trust is asked anything", () => {
        delete process.env.OPENAI_API_KEY;
        expect(resolveGovernedReasoningProviderPort()).toBeNull();

        const decision = authorize({ provider: "openai" });
        expect(decision.permitted).toBe(false);
        if (decision.permitted) return;
        // Availability, not permission — a 503, which is the distinction the
        // authorization contract exists to preserve.
        expect(decision.refusal.category).toBe("provider_unavailable");
        expect(decision.refusal.http_status).toBe(503);
    });

    it("configuration lost AFTER a permit still refuses at the port, and sends nothing", async () => {
        // The race the strategy's null-port branch exists for: authorization saw
        // a configured provider, and by execution time it is gone. Resolving the
        // port per execution rather than at composition is what makes this
        // observable at all.
        const permitted = authorize({ provider: "openai" });
        expect(permitsReasoningMode(permitted, "provider_backed")).toBe(true);

        delete process.env.OPENAI_API_KEY;
        const fetchMock = interceptTransport(VALID_ENRICHMENT);

        const harness = createRecordingRepository();
        const result = await decideAttentionSuggestionEnrichment({
            org_id: ORG,
            deterministic: suggestion(),
            correlation_id: "corr-port-lost",
            initiating_actor: { actor_type: "operator", actor_id: OPERATOR },
            channel: "operator",
            authorization: permitted,
            repository: harness.repository,
            nowIso: "2026-08-10T00:00:00.000Z",
        });

        expect(result.package.outcome).toBe("failed_reasoning");
        expect(result.enrichment).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("no real credential is present in this suite", () => {
        expect(process.env.OPENAI_API_KEY).toBe(FIXTURE_KEY);
    });
});

// ---------------------------------------------------------------------------
// 7. Negative control — this suite can actually go red
// ---------------------------------------------------------------------------

describe("P28C-7 — the switch is falsifiable", () => {
    it("raising the deterministic class's ceiling would be the defect these tests forbid", () => {
        const det = TRUST_REGISTRY.requireDecisionClass(DETERMINISTIC_CLASS);

        // The counterfactual, evaluated against the real selector: had the
        // deterministic class been widened instead of a second class added, the
        // registry would have preferred the provider strategy for the path
        // Phase 1 certified. It is refused today because the class was NOT
        // widened — which is the whole argument for two classes.
        const widened = {
            ...det,
            strategy_preference: ["small_reasoning", "deterministic"] as readonly string[],
            economic_policy: { ...det.economic_policy, max_escalation_level: 3 },
        };
        const chosen = selectStrategy({ ...widened, key: PROVIDER_BACKED_CLASS });
        expect(chosen.ok && chosen.strategy.kind).toBe("small_reasoning");

        // And the real deterministic class still refuses to reach it.
        const real = selectStrategy(det);
        expect(real.ok && real.strategy.kind).toBe("deterministic");
    });

    it("a provider-capable strategy without a governed input refuses, and sends nothing", async () => {
        const fetchMock = interceptTransport(VALID_ENRICHMENT);

        // The consumer builds the governed input from the suggestion. Remove the
        // suggestion's declared facts and the package cannot build, so the
        // runtime's Phase 2.3.1 guard is what answers.
        const broken: AttentionSuggestionV1 = {
            ...suggestion(),
            // A non-scalar where the spec declares a scalar: the package refuses
            // at construction rather than serializing a raw object.
            source: { ...suggestion().source, primary_reason_code: { nested: true } as unknown as string },
        };

        const harness = createRecordingRepository();
        const result = await decideAttentionSuggestionEnrichment({
            org_id: ORG,
            deterministic: broken,
            correlation_id: "corr-nogov",
            initiating_actor: { actor_type: "operator", actor_id: OPERATOR },
            channel: "operator",
            authorization: authorize({ provider: "openai" }),
            repository: harness.repository,
            nowIso: "2026-08-10T00:00:00.000Z",
        });

        expect(result.package.outcome).toBe("refused_policy");
        expect(result.package.explanation).toContain("provider-capable");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
