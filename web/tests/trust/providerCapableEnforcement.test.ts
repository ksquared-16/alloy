/**
 * Phase 2.3.1 — provider-capable reasoning requires a governed Information Package.
 *
 * Proves the bypass is closed: a provider-capable strategy cannot proceed from
 * raw `resolvedInformation`, however it is dressed up, while the deterministic
 * capabilities certified in Phase 1 keep the compatibility path untouched.
 *
 * There is still no provider. This slice enforces an origin, not an execution.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import {
    buildEligibleReasoningInput,
    buildInformationPackage,
    type EligibleReasoningInputV1,
    type InformationPackageSpecV1,
} from "@/lib/trust/information/informationPackage";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { ReasoningUsageInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import {
    NON_PROVIDER_CAPABLE_KINDS,
    REASONING_EXECUTION_CAPABILITY,
    isProviderCapableStrategyKind,
} from "@/lib/trust/reasoning/executionCapability";
import { REASONING_STRATEGY_KINDS, type ReasoningStrategyKind } from "@/lib/trust/reasoning/reasoningStrategy";
import { executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";
import type { PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";

const WEB_ROOT = process.cwd();
const NOW = "2026-08-07T12:00:00.000Z";
const EMAIL = "jane.doe+tour@example.com";

function makeRepo() {
    const packages: DecisionPackageV1[] = [];
    const usage: ReasoningUsageInput[] = [];
    const repository: TrustRepository = {
        async insertContract() {},
        async advanceContractLifecycle() {},
        async insertPackage(p) { packages.push(p); },
        async insertObservation() {},
        async insertReasoningUsage(u) { usage.push(u); },
    };
    return { repository, packages, usage };
}

/** A realistic-but-raw domain object — the thing the package exists to keep out. */
type RawMessageRow = {
    id: string;
    thread_id: string;
    body: string;
    from_address: string;
    provider_message_id: string;
    metadata: Record<string, unknown>;
};

function rawRow(): RawMessageRow {
    return {
        id: "msg-1",
        thread_id: "thr-1",
        body: `Email me at ${EMAIL} about Friday`,
        from_address: "+15552345678",
        provider_message_id: "SM-secret",
        metadata: { AccountSid: "AC-secret" },
    };
}

const SPEC: InformationPackageSpecV1<RawMessageRow> = {
    key: "test_inbound_message",
    version: "1.0.0",
    decision_class_key: "test_provider_capable_class",
    source_kind: "communication_messages",
    elements: [
        {
            key: "inbound_message_text",
            information_class: "communications",
            source_field: "communication_messages.body",
            required_text_minimizers: ["email", "phone"],
            select: (m) => m.body,
        },
    ],
};

const POLICY: PrivacyPolicyV1 = {
    key: "test_provider_capable_policy",
    pii_mode: "strict",
    prohibited_classes: [],
    required_text_minimizers: ["email", "phone"],
};

function eligibleInput(over: Partial<EligibleReasoningInputV1> = {}): EligibleReasoningInputV1 {
    const built = buildInformationPackage({ spec: SPEC, source: rawRow(), sourceRefs: { message_id: "msg-1" } });
    if (!built.ok) throw new Error("fixture package failed");
    const e = buildEligibleReasoningInput({ package: built.package, policy: POLICY });
    if (!e.ok) throw new Error("fixture eligibility failed");
    return { ...e.input, ...over };
}

// ---------------------------------------------------------------------------
// 1. The classification itself
// ---------------------------------------------------------------------------

describe("P231-1 — execution capability comes from the strategy ladder", () => {
    it("covers every strategy kind, with no default", () => {
        for (const kind of REASONING_STRATEGY_KINDS) {
            expect(REASONING_EXECUTION_CAPABILITY[kind], kind).toBeDefined();
            expect(typeof REASONING_EXECUTION_CAPABILITY[kind].provider_capable).toBe("boolean");
        }
        expect(Object.keys(REASONING_EXECUTION_CAPABILITY).sort()).toEqual([...REASONING_STRATEGY_KINDS].sort());
    });

    it("exemption is an allowlist — only deterministic and human_review are exempt", () => {
        // Polarity matters: a NEW kind defaults to provider-capable and inherits
        // enforcement rather than silently escaping it.
        expect([...NON_PROVIDER_CAPABLE_KINDS].sort()).toEqual(["deterministic", "human_review"]);
        for (const kind of REASONING_STRATEGY_KINDS) {
            const exempt = (NON_PROVIDER_CAPABLE_KINDS as readonly string[]).includes(kind);
            expect(isProviderCapableStrategyKind(kind), kind).toBe(!exempt);
        }
    });

    it("capability is NOT derived from async, and NOT from local-vs-remote", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/reasoning/executionCapability.ts"), "utf8");
        // No behavioural dependence on either concept.
        expect(src).not.toMatch(/\bPromise\b/);
        expect(src).not.toMatch(/\basync\s+\w+\s*\(/);
        expect(src).not.toMatch(/isLocal|is_local|locality|remote_execution/);
        // Every registered strategy today is deterministic, so nothing existing
        // becomes provider-capable by accident.
        for (const rel of [
            "lib/trust/reasoning/strategies/processingSourceClassificationDeterministic.ts",
            "lib/trust/reasoning/strategies/attentionSuggestionEnrichmentDeterministic.ts",
            "lib/trust/reasoning/strategies/processingIdentitySubjectResolutionDeterministic.ts",
        ]) {
            expect(readFileSync(join(WEB_ROOT, rel), "utf8")).toContain('kind: "deterministic"');
        }
    });

    it("an ASYNC deterministic strategy is still exempt — async is a calling convention", () => {
        // The async seam (Phase 0.6) lets a deterministic strategy await work it
        // owns. That must not promote it to provider-capable.
        expect(isProviderCapableStrategyKind("deterministic")).toBe(false);
    });

    it("human_review is exempt despite sitting at the TOP of the escalation ladder", () => {
        // Escalation level is cost, not egress. A person is not a provider.
        expect(REASONING_STRATEGY_KINDS[REASONING_STRATEGY_KINDS.length - 1]).toBe("human_review");
        expect(isProviderCapableStrategyKind("human_review")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 2. Runtime enforcement — registered classes, via the real runtime
// ---------------------------------------------------------------------------

/**
 * Uses the REGISTERED attention-enrichment class, whose strategy is
 * `deterministic`, to prove the compatibility path is untouched end to end.
 */
async function runDeterministicCompatibility() {
    const { repository, packages } = makeRepo();
    const built = createDecisionContract({
        org_id: "org-1",
        decision_class_key: "attention_suggestion_enrichment",
        intent: "compatibility path",
        context: { surface: "test" },
        correlation_id: "corr-1",
        initiating_actor: { actor_type: "system", actor_id: null },
        channel: "system",
        nowIso: NOW,
    });
    const execution = await executeDecisionContract({
        contract: built.contract as DecisionContractV1,
        resolvedInformation: {
            deterministic_attention_suggestion: {
                primary_reason_code: "no_contact_attempt",
                next_action_key: "send_follow_up",
                template_key: "tpl_1",
                channel: "email",
                reasoning_summary: "No contact attempt recorded.",
                draft_body: "Hello, following up.",
            },
        },
        semanticMap: {
            primary_reason_code: "operational" as InformationClass,
            next_action_key: "operational" as InformationClass,
            template_key: "operational" as InformationClass,
            channel: "communications" as InformationClass,
            reasoning_summary: "operational" as InformationClass,
            draft_body: "communications" as InformationClass,
        },
        repository,
        nowIso: NOW,
        clock: () => 0,
    });
    return { execution, packages };
}

describe("P231-2 — deterministic compatibility path is unchanged", () => {
    it("a registered deterministic class still accepts raw resolvedInformation and recommends", async () => {
        const { execution } = await runDeterministicCompatibility();
        expect(execution.package.outcome).toBe("recommended");
        expect(execution.step_trace).toContain("execute_reasoning");
    });

    it("its step trace is the full canonical order — no step was skipped or added", async () => {
        const { execution } = await runDeterministicCompatibility();
        expect(execution.step_trace).toEqual([
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

    it("privacy evidence is still produced on the compatibility path", async () => {
        const { execution } = await runDeterministicCompatibility();
        expect(execution.package.privacy_report.transformations?.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// 3. Governed-input validation on the real runtime
// ---------------------------------------------------------------------------

async function runWithEligible(over: Partial<EligibleReasoningInputV1>) {
    const { repository } = makeRepo();
    const built = createDecisionContract({
        org_id: "org-1",
        decision_class_key: "attention_suggestion_enrichment",
        intent: "governed input",
        context: { surface: "test" },
        correlation_id: "corr-2",
        initiating_actor: { actor_type: "system", actor_id: null },
        channel: "system",
        nowIso: NOW,
    });
    return executeDecisionContract({
        contract: built.contract as DecisionContractV1,
        resolvedInformation: { deterministic_attention_suggestion: { primary_reason_code: "x" } },
        semanticMap: { primary_reason_code: "operational" as InformationClass },
        repository,
        nowIso: NOW,
        clock: () => 0,
        eligibleReasoningInput: eligibleInput(over),
    });
}

describe("P231-3 — a governed input must belong to this decision", () => {
    it("a mismatched decision class is refused", async () => {
        const execution = await runWithEligible({ decision_class_key: "some_other_class" });
        expect(execution.package.outcome).toBe("refused_policy");
        expect(execution.step_trace).not.toContain("execute_reasoning");
    });

    it("a mismatched privacy policy is refused", async () => {
        const execution = await runWithEligible({
            decision_class_key: "attention_suggestion_enrichment",
            privacy_policy_key: "some_other_policy",
        });
        expect(execution.package.outcome).toBe("refused_policy");
        expect(execution.step_trace).not.toContain("execute_reasoning");
    });

    it("neither refusal leaks the source content", async () => {
        const execution = await runWithEligible({ decision_class_key: "some_other_class" });
        const blob = JSON.stringify(execution.package);
        for (const fragment of ["jane.doe", "example.com", "SM-secret", "AccountSid", "+1555"]) {
            expect(blob, `leaked ${fragment}`).not.toContain(fragment);
        }
    });

    it("a matching governed input is ACCEPTED — execution proceeds past the guard to reasoning", async () => {
        const execution = await runWithEligible({
            decision_class_key: "attention_suggestion_enrichment",
            privacy_policy_key: "attention_suggestion_minimization_v1",
        });
        // It reaches reasoning and validation. It then fails VALIDATION, because
        // this fixture's governed element deliberately does not satisfy the
        // attention class's recommendation shape — which is the correct outcome
        // and proves the guard admitted it rather than refusing it.
        expect(execution.step_trace).toContain("execute_reasoning");
        expect(execution.package.outcome).not.toBe("refused_policy");
    });

    it("privacy is NOT re-run: the eligible input carries the evidence, produced once", () => {
        const e = eligibleInput();
        expect(e.text_minimizations).toContainEqual({
            detector_key: "email", redaction_kind: "email", replaced_count: 1,
        });
        expect(e.transformations.map((t) => t.key)).toEqual(["inbound_message_text"]);
        // The runtime consumes these records; it does not recompute them.
        const src = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        const idx = src.indexOf("if (eligible) {\n        // Privacy is NOT re-run");
        expect(idx).toBeGreaterThan(-1);
        const branch = src.slice(idx, idx + 700);
        expect(branch).toContain("transformations: eligible.transformations");
        expect(branch).not.toContain("transformForReasoning(");
    });

    it("the governed elements reach reasoning already minimized — the raw address never appears", async () => {
        const execution = await runWithEligible({
            decision_class_key: "attention_suggestion_enrichment",
            privacy_policy_key: "attention_suggestion_minimization_v1",
        });
        expect(JSON.stringify(execution.package)).not.toContain(EMAIL);
        expect(JSON.stringify(eligibleInput().elements)).not.toContain(EMAIL);
        expect(String(eligibleInput().elements.inbound_message_text)).toContain("[email removed]");
    });
});

// ---------------------------------------------------------------------------
// 4. Negative controls — attempts to bypass the package
// ---------------------------------------------------------------------------

describe("P231-4 — bypass attempts", () => {
    it("the enforcement reads capability from the ladder, not from the caller", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        expect(src).toContain("isProviderCapableStrategyKind(selection.strategy.kind)");
        // A caller-supplied "this is deterministic, trust me" flag would be the
        // whole hole reopened.
        expect(src).not.toMatch(/input\.(is)?[Pp]rovider[A-Za-z]*\b/);
    });

    it("the guard sits BEFORE execute_reasoning in the source order", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        const guard = src.indexOf("isProviderCapableStrategyKind(selection.strategy.kind)");
        const execute = src.indexOf('trace.push("execute_reasoning")');
        expect(guard).toBeGreaterThan(-1);
        expect(execute).toBeGreaterThan(-1);
        expect(guard).toBeLessThan(execute);
    });

    it("a raw domain row cannot become a governed input — the package refuses it", () => {
        const bad: InformationPackageSpecV1<RawMessageRow> = {
            ...SPEC,
            elements: [{ key: "row", information_class: "communications", source_field: "*", select: (m) => m }],
        };
        const r = buildInformationPackage({ spec: bad, source: rawRow(), sourceRefs: {} });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("INFO_PACKAGE_NON_SCALAR_ELEMENT");
    });

    it("a governed input built from a package carries no undeclared source field", () => {
        const e = eligibleInput();
        const blob = JSON.stringify(e);
        for (const forbidden of ["from_address", "provider_message_id", "SM-secret", "AccountSid", "metadata"]) {
            expect(blob, `leaked ${forbidden}`).not.toContain(forbidden);
        }
        expect(Object.keys(e.elements)).toEqual(["inbound_message_text"]);
    });

    it("the eligible input retains privacy and provenance metadata", () => {
        const e = eligibleInput();
        expect(e.provenance.source_kind).toBe("communication_messages");
        expect(e.provenance.source_refs.message_id).toBe("msg-1");
        expect(e.transformations.length).toBeGreaterThan(0);
        expect(e.text_minimizations.length).toBeGreaterThan(0);
        expect(e.content_hash.startsWith("teri1:")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 5. Still no provider
// ---------------------------------------------------------------------------

describe("P231-5 — the enforcement introduces no provider", () => {
    it("the capability module reaches nothing", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/reasoning/executionCapability.ts"), "utf8");
        for (const p of [
            /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /@anthropic-ai/, /\bopenai\b/i, /axios/,
            /from\s+"node:https?"/, /process\.env/, /Date\.now/, /new Date\(/, /Math\.random/,
        ]) {
            expect(src, `matched ${p}`).not.toMatch(p);
        }
    });

    it("the runtime still performs no network call and reads no provider credential", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        for (const p of [/\bfetch\s*\(/, /@anthropic-ai/, /\bopenai\b/i, /axios/, /from\s+"node:https?"/, /process\.env/]) {
            expect(src, `matched ${p}`).not.toMatch(p);
        }
    });

    it("no provider-capable strategy is registered, so nothing existing is refused", () => {
        const registry = readFileSync(join(WEB_ROOT, "lib/trust/registry/trustRegistry.ts"), "utf8");
        expect(registry).not.toContain("small_reasoning");
        expect(registry).not.toContain("large_reasoning");
    });

    it("no Communications module is touched by the enforcement", () => {
        for (const rel of ["lib/trust/reasoning/executionCapability.ts", "lib/trust/runtime/trustRuntime.ts"]) {
            expect(readFileSync(join(WEB_ROOT, rel), "utf8")).not.toMatch(/lib\/communications/);
        }
    });
});

// ---------------------------------------------------------------------------
// 6. The invariant, stated directly
// ---------------------------------------------------------------------------

describe("P231-6 — provider-capable reasoning cannot originate from raw information", () => {
    it.each(REASONING_STRATEGY_KINDS.filter((k) => isProviderCapableStrategyKind(k as ReasoningStrategyKind)))(
        "%s is classified provider-capable and therefore requires a governed input",
        (kind) => {
            expect(isProviderCapableStrategyKind(kind as ReasoningStrategyKind)).toBe(true);
            expect(REASONING_EXECUTION_CAPABILITY[kind as ReasoningStrategyKind].rationale.length).toBeGreaterThan(10);
        },
    );

    it("the refusal explanation names the kind and the reason, never caller data", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        const idx = src.indexOf("provider-capable and may only proceed");
        expect(idx).toBeGreaterThan(-1);
        const window = src.slice(idx - 400, idx + 600);
        // The explanation interpolates the strategy KIND and the platform's own
        // rationale — never `resolvedInformation` or any element value.
        expect(window).toContain("selection.strategy.kind");
        expect(window).not.toContain("resolvedInformation}");
        expect(window).not.toMatch(/\$\{input\.resolvedInformation/);
    });
});
