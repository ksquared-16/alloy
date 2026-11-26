/**
 * Phase 2.3.2 — privacy evidence survives every terminal outcome (D-16).
 *
 * A Decision Package is immutable evidence. Before this slice, an execution
 * could run privacy, produce real transformation records, then refuse for an
 * unrelated reason downstream and persist a package claiming no privacy had
 * happened at all. The package was not wrong about the refusal; it was wrong
 * about the privacy.
 *
 * The invariant: once privacy has executed, every later terminal package
 * reports what it actually did — and before privacy executes, the package says
 * so honestly rather than inventing evidence.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it, vi } from "vitest";

import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import {
    buildEligibleReasoningInput,
    buildInformationPackage,
    type InformationPackageSpecV1,
} from "@/lib/trust/information/informationPackage";
import { ATTENTION_SUGGESTION_MINIMIZATION_V1 } from "@/lib/trust/platform/platformPrivacyPolicies";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { ReasoningUsageInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";

const WEB_ROOT = process.cwd();
const NOW = "2026-08-07T12:00:00.000Z";
const ORG = "org-1";
const CLASS_KEY = "attention_suggestion_enrichment";
const EMAIL = "jane.doe+tour@example.com";
const PHONE = "(555) 234-5678";

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

function contractFor(classKey: string, correlation: string): DecisionContractV1 {
    return createDecisionContract({
        org_id: ORG,
        decision_class_key: classKey,
        intent: "evidence preservation certification",
        context: { surface: "certification" },
        correlation_id: correlation,
        initiating_actor: { actor_type: "system", actor_id: null },
        channel: "system",
        nowIso: NOW,
    }).contract as DecisionContractV1;
}

/** The six declared elements of the registered attention class. */
const SUGGESTION = {
    primary_reason_code: "no_contact_attempt",
    next_action_key: "send_follow_up",
    template_key: "tpl_1",
    channel: "email",
    reasoning_summary: "No contact attempt recorded.",
    draft_body: `Reach me at ${EMAIL} or ${PHONE}.`,
} as const;

const SEMANTIC_MAP: Record<string, InformationClass> = {
    primary_reason_code: "operational",
    next_action_key: "operational",
    template_key: "operational",
    channel: "communications",
    reasoning_summary: "operational",
    draft_body: "communications",
};

async function run(over: Partial<Parameters<typeof executeDecisionContract>[0]> = {}, correlation = "c1") {
    const harness = makeRepo();
    const execution = await executeDecisionContract({
        contract: contractFor(CLASS_KEY, correlation),
        resolvedInformation: { deterministic_attention_suggestion: SUGGESTION },
        semanticMap: SEMANTIC_MAP,
        repository: harness.repository,
        nowIso: NOW,
        clock: () => 0,
        ...over,
    });
    return { ...harness, execution };
}

// ---------------------------------------------------------------------------
// 1. Before privacy — honest absence
// ---------------------------------------------------------------------------

describe("P232-1 — a refusal BEFORE privacy does not claim privacy ran", () => {
    it("an unregistered decision class reports the not-executed default", async () => {
        const { execution } = await run({ contract: contractFor("definitely_not_registered", "c-unreg") });
        expect(execution.package.outcome).toBe("refused_unsupported_class");
        const r = execution.package.privacy_report;
        // Absent, not empty. Phase 2.1 made the field optional precisely so
        // "no record exists" stays distinguishable from "a record that is empty".
        expect(r.transformations).toBeUndefined();
        expect(r.classes_present).toEqual([]);
        expect(r.redaction_steps).toEqual([]);
        expect(execution.step_trace).not.toContain("apply_privacy_transformations");
    });

    it("a refused authorization reports the not-executed default", async () => {
        const { execution } = await run({
            authorization: { permitted: false, outcome: "refused_permission", detail: "no" },
        }, "c-auth");
        expect(execution.package.outcome).toBe("refused_permission");
        expect(execution.package.privacy_report.transformations).toBeUndefined();
    });

    it("missing required information reports the not-executed default", async () => {
        const { execution } = await run({ resolvedInformation: { deterministic_attention_suggestion: null } }, "c-missing");
        expect(execution.package.outcome).toBe("refused_insufficient_information");
        expect(execution.package.privacy_report.transformations).toBeUndefined();
    });

    it("a provider-capable refusal that occurs BEFORE privacy would not claim privacy ran", () => {
        // The 2.3.1 guard sits AFTER privacy, so its refusal legitimately carries
        // evidence. The honest-absence guarantee is structural: `finish()` reads
        // one variable that is null until privacy produces something.
        const src = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        expect(src).toContain("let privacyEvidence: DecisionPackagePrivacyReport | null = null;");
        expect(src).toContain("privacy_report: privacyEvidence ?? PRIVACY_NOT_EXECUTED,");
        expect(src).not.toContain('privacy_report: { pii_mode: "strict", classes_present: [], redaction_steps: [] }');
    });
});

// ---------------------------------------------------------------------------
// 2. Success keeps its report
// ---------------------------------------------------------------------------

describe("P232-2 — a successful decision still reports its privacy", () => {
    it("recommended packages carry classes, transformations and steps", async () => {
        const { execution } = await run({}, "c-ok");
        expect(execution.package.outcome).toBe("recommended");
        const r = execution.package.privacy_report;
        expect(r.classes_present).toEqual(["communications", "operational"]);
        expect(r.transformations?.map((t) => t.key).sort()).toEqual([
            "channel", "draft_body", "next_action_key", "primary_reason_code", "reasoning_summary", "template_key",
        ]);
        expect(r.pii_mode).toBe("strict");
    });

    it("success and refusal read the SAME captured value, so they cannot drift", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        const occurrences = src.split("privacy_report: privacyEvidence ?? PRIVACY_NOT_EXECUTED,").length - 1;
        expect(occurrences).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// 3. Every terminal path AFTER privacy preserves evidence
// ---------------------------------------------------------------------------

/**
 * Drives the real runtime to a chosen post-privacy terminal outcome by
 * overriding strategy selection for this file only. The closed V1 registry is
 * untouched — the same technique `trustCostRepresentability` established.
 */
const override = vi.hoisted(() => ({ strategy: null as unknown, fail: null as null | "unavailable" }));

vi.mock("@/lib/trust/strategy/strategyEngine", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/trust/strategy/strategyEngine")>();
    return {
        ...actual,
        selectStrategy: (dc: Parameters<typeof actual.selectStrategy>[0]) => {
            if (override.fail === "unavailable") {
                return { ok: false as const, refusal_code: "STRATEGY_UNAVAILABLE" as const, detail: "none registered" };
            }
            return override.strategy
                ? { ok: true as const, strategy: override.strategy as never, escalation_level: 0 }
                : actual.selectStrategy(dc);
        },
    };
});

function expectPreserved(pkg: DecisionPackageV1) {
    const r = pkg.privacy_report;
    expect(r.classes_present, "classes_present lost").toEqual(["communications", "operational"]);
    expect(r.transformations?.length, "transformation records lost").toBe(6);
    expect(r.pii_mode).toBe("strict");
    // And it is genuinely the produced evidence, not a fabrication.
    expect(r.transformations?.find((t) => t.key === "draft_body")?.transformation).toBe("summarize");
    expect(r.transformations?.find((t) => t.key === "draft_body")?.support).toBe("compatibility_preserved");
}

describe("P232-3 — every post-privacy terminal outcome preserves the evidence", () => {
    it("strategy unavailable (refused_policy)", async () => {
        override.strategy = null;
        override.fail = "unavailable";
        try {
            const { execution } = await run({}, "c-nostrat");
            expect(execution.package.outcome).toBe("refused_policy");
            expectPreserved(execution.package);
        } finally {
            override.fail = null;
        }
    });

    it("provider-capable without a governed input (Phase 2.3.1 refusal)", async () => {
        override.strategy = {
            key: "synthetic_provider", kind: "large_reasoning", version: "1.0.0",
            decision_class_key: CLASS_KEY,
            reason: () => ({ ok: true, proposal: { recommendation: {}, confidence: null, evidence: [], explanation: "", remaining_uncertainty: [] } }),
        };
        try {
            const { execution } = await run({}, "c-provcap");
            expect(execution.package.outcome).toBe("refused_policy");
            expect(execution.package.explanation).toContain("provider-capable");
            expectPreserved(execution.package);
        } finally {
            override.strategy = null;
        }
    });

    it("failed_reasoning — the strategy declined", async () => {
        override.strategy = {
            key: "declining", kind: "deterministic", version: "1.0.0", decision_class_key: CLASS_KEY,
            reason: () => ({ ok: false, refusal_code: "REASONING_UNABLE", detail: "cannot" }),
        };
        try {
            const { execution } = await run({}, "c-decline");
            expect(execution.package.outcome).toBe("failed_reasoning");
            expectPreserved(execution.package);
        } finally {
            override.strategy = null;
        }
    });

    it("failed_reasoning — an unusable reported cost", async () => {
        override.strategy = {
            key: "bad_cost", kind: "deterministic", version: "1.0.0", decision_class_key: CLASS_KEY,
            reason: () => ({
                ok: true, cost_units: Number.NaN,
                proposal: { recommendation: {}, confidence: null, evidence: [], explanation: "", remaining_uncertainty: [] },
            }),
        };
        try {
            const { execution } = await run({}, "c-badcost");
            expect(execution.package.outcome).toBe("failed_reasoning");
            expectPreserved(execution.package);
        } finally {
            override.strategy = null;
        }
    });

    it("failed_validation — the proposal did not satisfy the validation policy", async () => {
        override.strategy = {
            key: "invalid_shape", kind: "deterministic", version: "1.0.0", decision_class_key: CLASS_KEY,
            reason: () => ({
                ok: true,
                proposal: { recommendation: { not: "an enrichment" }, confidence: null, evidence: [], explanation: "", remaining_uncertainty: [] },
            }),
        };
        try {
            const { execution } = await run({}, "c-badshape");
            expect(execution.package.outcome).toBe("failed_validation");
            expectPreserved(execution.package);
        } finally {
            override.strategy = null;
        }
    });
});

// ---------------------------------------------------------------------------
// 4. Content minimization counts survive, and nothing sensitive leaks
// ---------------------------------------------------------------------------

type Src = { body: string };

const GOVERNED_SPEC: InformationPackageSpecV1<Src> = {
    key: "evidence_preservation_fixture",
    version: "1.0.0",
    decision_class_key: CLASS_KEY,
    source_kind: "communication_messages",
    elements: [{
        key: "draft_body",
        information_class: "communications",
        source_field: "communication_messages.body",
        required_text_minimizers: ["email", "phone"],
        select: (s) => s.body,
    }],
};

/**
 * A test policy carrying the CANONICAL key but requiring text minimization.
 *
 * The registered `ATTENTION_SUGGESTION_MINIMIZATION_V1` declares no
 * `required_text_minimizers`, so a governed input built under it genuinely has
 * zero minimization counts — there would be nothing for this test to preserve.
 * The key must match the decision class's, because the runtime refuses a
 * governed input minimized under a different policy than the class references.
 */
const MINIMIZING_POLICY = {
    ...ATTENTION_SUGGESTION_MINIMIZATION_V1,
    required_text_minimizers: ["email", "phone"] as const,
};

function governedInput() {
    const pkg = buildInformationPackage({
        spec: GOVERNED_SPEC,
        source: { body: `Reach me at ${EMAIL} or ${PHONE}.` },
        sourceRefs: { org_id: ORG },
    });
    if (!pkg.ok) throw new Error("fixture package failed");
    const e = buildEligibleReasoningInput({ package: pkg.package, policy: MINIMIZING_POLICY });
    if (!e.ok) throw new Error("fixture eligibility failed");
    return e.input;
}

describe("P232-4 — minimization counts survive, sensitive content does not appear", () => {
    it("a governed input that passes privacy then fails later keeps its minimization counts", async () => {
        override.strategy = {
            key: "declining_governed", kind: "deterministic", version: "1.0.0", decision_class_key: CLASS_KEY,
            reason: () => ({ ok: false, refusal_code: "REASONING_UNABLE", detail: "cannot" }),
        };
        try {
            const { execution } = await run({ eligibleReasoningInput: governedInput() }, "c-gov");
            expect(execution.package.outcome).toBe("failed_reasoning");
            const r = execution.package.privacy_report;
            expect(r.text_minimizations).toContainEqual({
                detector_key: "email", redaction_kind: "email", replaced_count: 1,
            });
            expect(r.text_minimizations).toContainEqual({
                detector_key: "phone", redaction_kind: "phone", replaced_count: 1,
            });
        } finally {
            override.strategy = null;
        }
    });

    it("preserved evidence carries counts and keys — never the minimized content", async () => {
        override.strategy = {
            key: "declining_governed2", kind: "deterministic", version: "1.0.0", decision_class_key: CLASS_KEY,
            reason: () => ({ ok: false, refusal_code: "REASONING_UNABLE", detail: "cannot" }),
        };
        try {
            const { execution } = await run({ eligibleReasoningInput: governedInput() }, "c-gov2");
            const blob = JSON.stringify(execution.package.privacy_report);
            for (const fragment of ["jane.doe", "example.com", "234-5678", "(555)"]) {
                expect(blob, `leaked ${fragment}`).not.toContain(fragment);
            }
        } finally {
            override.strategy = null;
        }
    });

    it("evidence is never derived from the final reasoning elements", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        // Captured from the transform's own output, and privacy is not re-run.
        const idx = src.indexOf("privacyEvidence = {");
        expect(idx).toBeGreaterThan(-1);
        expect(src.slice(idx, idx + 900)).not.toContain("context.transformed");
        // Exactly two assignment sites: the refusal-of-privacy case and the
        // full-result case. No third place can invent evidence.
        expect(src.split("privacyEvidence = {").length - 1).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// 5. Privacy that RAN AND REFUSED reports what it produced
// ---------------------------------------------------------------------------

describe("P232-5 — refused_privacy reports the records privacy produced before refusing", () => {
    it("an unmapped element (identity ⇒ tokenize, unsupported) refuses and keeps its record", async () => {
        const { execution } = await run({
            resolvedInformation: { deterministic_attention_suggestion: { ...SUGGESTION, smuggled: "x" } },
        }, "c-refprivacy");
        expect(execution.package.outcome).toBe("refused_privacy");
        const r = execution.package.privacy_report;
        // Privacy RAN here — it ran and refused. Real classes, real records.
        expect(r.transformations).toBeDefined();
        expect(r.transformations!.length).toBeGreaterThan(0);
        expect(r.classes_present).toContain("identity");
        // The REFUSED element's record is excluded on purpose: its key is
        // caller-supplied, and preserving it would let a smuggled key write its
        // own name into an immutable package (the Phase 2.1 lesson). Every
        // surviving record describes an admitted, declared element.
        expect(r.transformations!.every((t) => t.disposition !== "refused")).toBe(true);
        expect(JSON.stringify(r)).not.toContain("smuggled");
        // Steps stay empty because structural minimization genuinely never ran.
        expect(r.redaction_steps).toEqual([]);
    });

    it("that refusal still leaks neither the element key nor the value", async () => {
        const { execution } = await run({
            resolvedInformation: { deterministic_attention_suggestion: { ...SUGGESTION, provider_key: "openai" } },
        }, "c-refprivacy2");
        expect(execution.package.outcome).toBe("refused_privacy");
        // The Phase 2.1 guarantee holds: the explanation names the class and the
        // transformation, never the caller-supplied key.
        expect(execution.package.explanation).not.toContain("provider_key");
        expect(JSON.stringify(execution.package).toLowerCase()).not.toContain("openai");
    });
});

// ---------------------------------------------------------------------------
// 6. Nothing else changed
// ---------------------------------------------------------------------------

describe("P232-6 — no privacy rerun, no new authority, no provider", () => {
    it("privacy is not re-run at finish()", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        const finishIdx = src.indexOf("async function finish(");
        expect(finishIdx).toBeGreaterThan(-1);
        const finishBody = src.slice(finishIdx);
        expect(finishBody).not.toContain("transformForReasoning(");
        expect(finishBody).not.toContain("classifyElements(");
    });

    it("exactly one transformForReasoning call site remains", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        expect(src.split("transformForReasoning({").length - 1).toBe(1);
    });

    it("the runtime still reaches no provider, network or credential", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        for (const p of [/\bfetch\s*\(/, /@anthropic-ai/, /\bopenai\b/i, /axios/, /from\s+"node:https?"/, /process\.env/]) {
            expect(src, `matched ${p}`).not.toMatch(p);
        }
    });

    it("the canonical nine-step trace is unchanged on the deterministic path", async () => {
        const { execution } = await run({}, "c-trace");
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
});
