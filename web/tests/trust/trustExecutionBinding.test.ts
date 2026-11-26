/**
 * Phase 0 Slice 0.5 — Trust execution binding contract.
 *
 * Certifies the boundary between an immutable Decision Package that RECOMMENDS
 * an operational action and the Operational Command Runtime that OWNS executing
 * it. Trust names a command and bounded intent; it never carries a payload,
 * never resolves a catalog of its own, and never claims an execution the command
 * runtime has not committed.
 *
 * Every case is synthetic. Nothing here touches a database, a route, a BOS
 * surface, or the real command runtime — the catalog arrives through the
 * injected port, which is the point.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.5
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createTrustCommandCatalogAdapter } from "@/lib/platform/commands/trust/trustCommandCatalogAdapter";
import type { TrustCommandCatalogPort, TrustCommandDescription } from "@/lib/trust/execution/commandCatalogPort";
import { createEmptyTrustCommandCatalog } from "@/lib/trust/execution/commandCatalogPort";
import {
    DECISION_PACKAGE_FINGERPRINT_PREFIX,
    fingerprintDecisionPackage,
    fingerprintsMatch,
} from "@/lib/trust/execution/decisionPackageFingerprint";
import {
    EXECUTABILITY_REFUSAL_CODES,
    evaluateExecutability,
    type ExecutabilityResult,
} from "@/lib/trust/execution/executabilityEvaluator";
import {
    createExecutionConfirmation,
    verifyExecutionConfirmation,
    type TrustServerActor,
} from "@/lib/trust/execution/executionConfirmation";
import {
    ALLOWED_EXECUTION_DETAIL_KEYS,
    planExecutionObservation,
    type AuthoritativeCommandOutcome,
} from "@/lib/trust/execution/executionObservation";
import {
    parseProposedCommandBinding,
    resolveExecutionBinding,
    TRUST_BINDING_VERSION,
} from "@/lib/trust/execution/proposedCommandBinding";
import { projectDecisionPackageLifecycle } from "@/lib/trust/lifecycle/decisionPackageLifecycle";
import type { LifecycleObservationRecord } from "@/lib/trust/lifecycle/lifecycleObservation";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";

const WEB_ROOT = join(__dirname, "..", "..");
const ORG = "org-1";
const PKG = "pkg-1";
const NOW = "2026-08-04T12:00:00.000Z";

const ACTOR: TrustServerActor = { actor_type: "operator", actor_id: "user-1", org_id: ORG };

function proposedCommand(over: Record<string, unknown> = {}) {
    return {
        binding_version: TRUST_BINDING_VERSION,
        command_key: "update_status",
        subject: { entity_type: "opportunities", entity_id: "opp-1" },
        inputs: { status_key: "tour_scheduled" },
        ...over,
    };
}

function pkg(over: Partial<DecisionPackageV1> = {}): DecisionPackageV1 {
    return {
        schema_version: 1,
        id: PKG,
        org_id: ORG,
        contract_id: "contract-1",
        decision_class_key: "cls",
        outcome: "recommended",
        recommendation: { proposed_command: proposedCommand() },
        explanation: "because",
        evidence: [],
        remaining_uncertainty: [],
        confidence: 1,
        trust_vector: null,
        trust_score: 1,
        trust_semantics_version: "v1",
        review_requirement: "operator_review",
        validation: null,
        privacy_report: { pii_mode: "strict", classes_present: [], redaction_steps: [] },
        economics: {
            strategy_key: "s",
            strategy_kind: "deterministic",
            escalation_level: 0,
            latency_ms: 1,
            cache_utilized: false,
            provider_cost_units: 0,
        },
        knowledge_versions: [],
        learning_metadata: { learning_policy_key: "none_v1", eligible_for_learning: false },
        alternatives: [],
        supersedes_package_id: null,
        strategy_key: "s",
        strategy_version: "1.0.0",
        validation_version: "1.0.0",
        runtime_version: "rt",
        registry_version: "reg",
        created_at_iso: "2026-08-04T10:00:00.000Z",
        ...over,
    };
}

let obsSeq = 0;
function obs(kind: string, over: Partial<LifecycleObservationRecord> = {}): LifecycleObservationRecord {
    obsSeq += 1;
    return {
        id: `o-${obsSeq}`,
        org_id: ORG,
        package_id: PKG,
        observation_kind: kind,
        observed_by_actor_type: "operator",
        observed_by_actor_id: "user-1",
        channel: "operator",
        execution_reference: null,
        detail: {},
        observed_at_iso: `2026-08-04T11:0${obsSeq % 10}:00.000Z`,
        ...over,
    };
}

function projectionFor(p: DecisionPackageV1, observations: readonly LifecycleObservationRecord[] = []) {
    const r = projectDecisionPackageLifecycle({
        package: {
            id: p.id,
            org_id: p.org_id,
            outcome: p.outcome,
            created_at_iso: p.created_at_iso,
            supersedes_package_id: p.supersedes_package_id,
        },
        observations,
        projectedAtIso: NOW,
    });
    if (!r.ok) throw new Error(`projection failed: ${r.error.code}`);
    return r.projection;
}

/** A synthetic catalog. Certifies Trust with no command-runtime import at all. */
function catalog(over: Partial<TrustCommandDescription> = {}): TrustCommandCatalogPort {
    return {
        key: "synthetic",
        describe: (k) =>
            k === "update_status"
                ? {
                      canonical_command_key: "update_status",
                      supported_subject_types: ["opportunities"],
                      confirmation_required: true,
                      accepts_trust_proposals: true,
                      catalog_version: "test",
                      ...over,
                  }
                : null,
    };
}

function confirmationFor(p: DecisionPackageV1, over: Partial<Parameters<typeof createExecutionConfirmation>[0]> = {}) {
    return createExecutionConfirmation({
        actor: ACTOR,
        package_id: p.id,
        package_fingerprint: fingerprintDecisionPackage(p),
        command_key: "update_status",
        confirmed_at_iso: NOW,
        ...over,
    });
}

function evaluate(over: Partial<Parameters<typeof evaluateExecutability>[0]> = {}): ExecutabilityResult {
    const p = over.package === undefined ? pkg() : over.package;
    return evaluateExecutability({
        package: p,
        projection: over.projection === undefined ? (p ? projectionFor(p) : null) : over.projection,
        catalog: over.catalog ?? catalog(),
        confirmation: over.confirmation === undefined ? (p ? confirmationFor(p) : null) : over.confirmation,
        serverActor: over.serverActor ?? ACTOR,
        retryAfterFailureAllowed: over.retryAfterFailureAllowed,
    });
}

const refusalOf = (r: ExecutabilityResult) => {
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected a refusal");
    return r.refusal;
};

// ---------------------------------------------------------------------------
// Binding validation
// ---------------------------------------------------------------------------

describe("binding validation", () => {
    it("a known, subject-compatible command is accepted", () => {
        const r = evaluate();
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.canonical_command_key).toBe("update_status");
        expect(r.binding.command_key).toBe("update_status");
        expect(r.binding.package_id).toBe(PKG);
        expect(r.binding.contract_id).toBe("contract-1");
    });

    it("an unknown command key is refused — Trust invents no catalog", () => {
        const r = evaluate({ catalog: createEmptyTrustCommandCatalog() });
        expect(refusalOf(r).code).toBe("command_unknown");
    });

    it("an incompatible subject type is refused", () => {
        const r = evaluate({ catalog: catalog({ supported_subject_types: ["children"] }) });
        expect(refusalOf(r).code).toBe("command_subject_incompatible");
    });

    it("a command that does not accept Trust-originated proposals is refused", () => {
        const r = evaluate({ catalog: catalog({ accepts_trust_proposals: false }) });
        expect(refusalOf(r).code).toBe("command_rejects_trust_proposals");
    });

    it("an unsupported binding version is refused", () => {
        const p = pkg({ recommendation: { proposed_command: proposedCommand({ binding_version: 99 }) } });
        expect(refusalOf(evaluate({ package: p, projection: projectionFor(p), confirmation: confirmationFor(p) })).code).toBe(
            "unsupported_binding_version",
        );
    });

    it("a malformed recommendation is refused", () => {
        for (const recommendation of [
            {},
            { proposed_command: "not-an-object" },
            { proposed_command: proposedCommand({ command_key: "  " }) },
            { proposed_command: proposedCommand({ subject: { entity_type: "opportunities" } }) },
            { proposed_command: proposedCommand({ subject: {} }) },
        ]) {
            const p = pkg({ recommendation: recommendation as Record<string, unknown> });
            const r = evaluate({ package: p, projection: projectionFor(p), confirmation: confirmationFor(p) });
            expect(refusalOf(r).code).toBe("invalid_recommendation_shape");
        }
    });

    it("a binding cannot carry a payload, a query, a table name or a credential", () => {
        for (const key of ["sql", "query", "table", "payload", "api_key", "token", "secret", "connection_string"]) {
            const parsed = parseProposedCommandBinding({
                proposed_command: proposedCommand({ inputs: { [key]: "anything" } }),
            });
            expect(parsed.ok).toBe(false);
            if (parsed.ok) continue;
            expect(parsed.code).toBe("FORBIDDEN_INPUT_KEY");
        }
    });

    it("a binding cannot carry a nested object or an unbounded value", () => {
        for (const inputs of [
            { nested: { a: 1 } },
            { deep: [{ a: 1 }] },
            { huge: "x".repeat(1000) },
            { many: Array.from({ length: 100 }, (_, i) => i) },
        ]) {
            const parsed = parseProposedCommandBinding({ proposed_command: proposedCommand({ inputs }) });
            expect(parsed.ok).toBe(false);
            if (parsed.ok) continue;
            expect(parsed.code).toBe("UNBOUNDED_INPUT_VALUE");
        }
    });

    it("a binding carries no executable function anywhere", () => {
        const parsed = parseProposedCommandBinding({ proposed_command: proposedCommand() });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const serialized = JSON.stringify(parsed.binding);
        expect(serialized).not.toContain("function");
        expect(serialized).not.toContain("=>");
        for (const value of Object.values(parsed.binding.inputs)) {
            expect(typeof value).not.toBe("function");
        }
    });

    it("a subject may require resolution instead of naming an id", () => {
        const parsed = parseProposedCommandBinding({
            proposed_command: proposedCommand({ subject: { entity_type: "opportunities", resolution_required: true } }),
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.binding.subject).toEqual({ kind: "resolution_required", entity_type: "opportunities" });
    });

    it("a recommendation that proposes no command is reported, not treated as malformed", () => {
        const parsed = parseProposedCommandBinding({ draft_body: "hello" });
        expect(parsed.ok).toBe(false);
        if (parsed.ok) return;
        expect(parsed.code).toBe("NO_BINDING_DECLARED");
    });
});

// ---------------------------------------------------------------------------
// Fingerprint and stale protection
// ---------------------------------------------------------------------------

describe("fingerprint and stale protection", () => {
    it("identical package content yields an identical fingerprint", () => {
        expect(fingerprintDecisionPackage(pkg())).toBe(fingerprintDecisionPackage(pkg()));
        expect(fingerprintDecisionPackage(pkg()).startsWith(`${DECISION_PACKAGE_FINGERPRINT_PREFIX}:`)).toBe(true);
    });

    it("an execution-relevant recommendation change changes the fingerprint", () => {
        const base = fingerprintDecisionPackage(pkg());
        for (const changed of [
            pkg({ recommendation: { proposed_command: proposedCommand({ command_key: "confirm_tour" }) } }),
            pkg({ recommendation: { proposed_command: proposedCommand({ inputs: { status_key: "enrolled" } }) } }),
            pkg({
                recommendation: {
                    proposed_command: proposedCommand({ subject: { entity_type: "opportunities", entity_id: "opp-2" } }),
                },
            }),
            pkg({ decision_class_key: "other" }),
            pkg({ outcome: "refused_policy", recommendation: null }),
            pkg({ review_requirement: "compliance_review" }),
        ]) {
            expect(fingerprintDecisionPackage(changed)).not.toBe(base);
        }
    });

    it("presentation-only data does not change the fingerprint", () => {
        const base = fingerprintDecisionPackage(pkg());
        for (const cosmetic of [
            pkg({ explanation: "entirely different prose" }),
            pkg({ evidence: [{ kind: "policy", reference: "r", detail: "d" }] }),
            pkg({ remaining_uncertainty: ["something"] }),
            pkg({ confidence: 0.2 }),
            pkg({ trust_score: 0.1 }),
            pkg({ created_at_iso: "2020-01-01T00:00:00.000Z" }),
            pkg({ economics: { ...pkg().economics, latency_ms: 9999 } }),
        ]) {
            expect(fingerprintDecisionPackage(cosmetic)).toBe(base);
        }
    });

    it("object key order does not alter the fingerprint", () => {
        const a = pkg({ recommendation: { proposed_command: { ...proposedCommand() } } });
        const reordered = {
            inputs: { status_key: "tour_scheduled" },
            subject: { entity_id: "opp-1", entity_type: "opportunities" },
            command_key: "update_status",
            binding_version: TRUST_BINDING_VERSION,
        };
        const b = pkg({ recommendation: { proposed_command: reordered } });
        expect(fingerprintDecisionPackage(b)).toBe(fingerprintDecisionPackage(a));
    });

    it("a client-supplied mismatched fingerprint fails", () => {
        const p = pkg();
        const r = evaluate({
            package: p,
            projection: projectionFor(p),
            confirmation: confirmationFor(p, { package_fingerprint: "tdpf1:deadbeef" }),
        });
        expect(refusalOf(r).code).toBe("package_fingerprint_mismatch");
    });

    it("fingerprintsMatch refuses non-strings and length mismatches", () => {
        expect(fingerprintsMatch(null, "a")).toBe(false);
        expect(fingerprintsMatch("a", undefined)).toBe(false);
        expect(fingerprintsMatch("abc", "abcd")).toBe(false);
        expect(fingerprintsMatch("abc", "abc")).toBe(true);
    });

    it("fingerprinting does not mutate the package", () => {
        const p = pkg();
        const before = JSON.stringify(p);
        fingerprintDecisionPackage(p);
        resolveExecutionBinding(p, parseProposedCommandBinding(p.recommendation).ok ? (parseProposedCommandBinding(p.recommendation) as { ok: true; binding: never }).binding : (null as never));
        expect(JSON.stringify(p)).toBe(before);
    });
});

// ---------------------------------------------------------------------------
// Lifecycle standing
// ---------------------------------------------------------------------------

describe("lifecycle standing gates execution", () => {
    it("a superseded package is refused", () => {
        const p = pkg();
        const projection = projectionFor(p, [
            obs("superseded", { detail: { superseding_package_id: "pkg-2", reason: "newer" } }),
        ]);
        expect(refusalOf(evaluate({ package: p, projection })).code).toBe("package_superseded");
    });

    it("an expired package is refused", () => {
        const p = pkg();
        const projection = projectionFor(p, [obs("expired", { detail: { expiry_kind: "scheduled" } })]);
        expect(refusalOf(evaluate({ package: p, projection })).code).toBe("package_expired");
    });

    it("a rejected package is refused", () => {
        const p = pkg();
        const projection = projectionFor(p, [obs("rejected")]);
        expect(refusalOf(evaluate({ package: p, projection })).code).toBe("package_rejected");
    });

    it("an already-executed package is refused", () => {
        const p = pkg();
        const projection = projectionFor(p, [obs("accepted"), obs("executed", { execution_reference: "inv-1" })]);
        expect(refusalOf(evaluate({ package: p, projection })).code).toBe("package_already_executed");
    });

    it("a previously failed package is refused unless retry is explicitly allowed", () => {
        const p = pkg();
        const projection = projectionFor(p, [obs("outcome", { detail: { result: "failed" } })]);
        expect(refusalOf(evaluate({ package: p, projection })).code).toBe("package_execution_failed_no_retry");
        expect(evaluate({ package: p, projection, retryAfterFailureAllowed: true }).ok).toBe(true);
    });

    it("a non-recommended package is not actionable", () => {
        const p = pkg({ outcome: "refused_policy", recommendation: null });
        expect(refusalOf(evaluate({ package: p, projection: projectionFor(p), confirmation: null })).code).toBe(
            "package_not_actionable",
        );
    });

    it("a missing package and a missing projection both fail closed", () => {
        expect(refusalOf(evaluate({ package: null, projection: null, confirmation: null })).code).toBe(
            "package_not_found",
        );
        const p = pkg();
        expect(refusalOf(evaluate({ package: p, projection: null })).code).toBe("package_not_actionable");
    });

    it("a projection describing another package fails closed", () => {
        const other = pkg({ id: "pkg-other" });
        expect(
            refusalOf(evaluate({ package: pkg(), projection: projectionFor(other) })).code,
        ).toBe("package_not_found");
    });

    it("every refusal code is reachable", () => {
        const seen = new Set<string>();
        const record = (r: ExecutabilityResult) => {
            if (!r.ok) seen.add(r.refusal.code);
        };
        const p = pkg();

        record(evaluate({ package: null, projection: null, confirmation: null }));
        record(evaluate({ package: p, projection: projectionFor(p), confirmation: confirmationFor(p, { package_fingerprint: "tdpf1:x" }) }));
        record(evaluate({ package: pkg({ outcome: "refused_policy", recommendation: null }), projection: projectionFor(pkg({ outcome: "refused_policy", recommendation: null })), confirmation: null }));
        record(evaluate({ package: p, projection: projectionFor(p, [obs("expired", { detail: { expiry_kind: "policy" } })]) }));
        record(evaluate({ package: p, projection: projectionFor(p, [obs("superseded", { detail: { superseding_package_id: "pkg-9" } })]) }));
        record(evaluate({ package: p, projection: projectionFor(p, [obs("rejected")]) }));
        record(evaluate({ package: p, projection: projectionFor(p, [obs("executed")]) }));
        record(evaluate({ package: p, projection: projectionFor(p, [obs("outcome", { detail: { result: "failed" } })]) }));
        record(evaluate({ catalog: createEmptyTrustCommandCatalog() }));
        record(evaluate({ catalog: catalog({ supported_subject_types: ["children"] }) }));
        record(evaluate({ catalog: catalog({ accepts_trust_proposals: false }) }));
        record(evaluate({ confirmation: null }));
        record(evaluate({ confirmation: confirmationFor(p, { command_key: "confirm_tour" }) }));
        const v99 = pkg({ recommendation: { proposed_command: proposedCommand({ binding_version: 99 }) } });
        record(evaluate({ package: v99, projection: projectionFor(v99), confirmation: confirmationFor(v99) }));
        const bad = pkg({ recommendation: {} });
        record(evaluate({ package: bad, projection: projectionFor(bad), confirmation: confirmationFor(bad) }));

        expect([...seen].sort()).toEqual([...EXECUTABILITY_REFUSAL_CODES].sort());
    });
});

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

describe("confirmation", () => {
    it("a correct confirmation is accepted", () => {
        expect(evaluate().ok).toBe(true);
    });

    it("a missing confirmation is refused when the command requires one", () => {
        expect(refusalOf(evaluate({ confirmation: null })).code).toBe("confirmation_missing");
    });

    it("a command needing no confirmation executes without one", () => {
        expect(evaluate({ catalog: catalog({ confirmation_required: false }), confirmation: null }).ok).toBe(true);
    });

    it("a confirmation for a different command is refused", () => {
        const r = evaluate({ confirmation: confirmationFor(pkg(), { command_key: "confirm_tour" }) });
        expect(refusalOf(r).code).toBe("confirmation_stale");
    });

    it("a confirmation for a different package is refused", () => {
        const r = evaluate({ confirmation: confirmationFor(pkg(), { package_id: "pkg-other" }) });
        expect(refusalOf(r).code).toBe("confirmation_stale");
    });

    it("a confirmation cannot be reused across packages even with a valid shape", () => {
        const other = pkg({ id: "pkg-other", recommendation: { proposed_command: proposedCommand() } });
        const stolen = confirmationFor(other);
        expect(refusalOf(evaluate({ confirmation: stolen })).code).toBe("confirmation_stale");
    });

    it("actor identity comes from the server context, not the confirmation", () => {
        const impostor = createExecutionConfirmation({
            actor: { actor_type: "operator", actor_id: "someone-else", org_id: ORG },
            package_id: PKG,
            package_fingerprint: fingerprintDecisionPackage(pkg()),
            command_key: "update_status",
            confirmed_at_iso: NOW,
        });
        const r = evaluate({ confirmation: impostor, serverActor: ACTOR });
        expect(refusalOf(r).code).toBe("confirmation_stale");
        expect(refusalOf(r).detail).toContain("server-resolved actor");
    });

    it("a confirmation from another organization is refused", () => {
        const crossOrg = createExecutionConfirmation({
            actor: { actor_type: "operator", actor_id: "user-1", org_id: "other-org" },
            package_id: PKG,
            package_fingerprint: fingerprintDecisionPackage(pkg()),
            command_key: "update_status",
            confirmed_at_iso: NOW,
        });
        expect(refusalOf(evaluate({ confirmation: crossOrg })).code).toBe("confirmation_stale");
    });

    it("verifyExecutionConfirmation names which field disagreed", () => {
        const p = pkg();
        const check = verifyExecutionConfirmation({
            confirmation: confirmationFor(p, { command_key: "other" }),
            package_id: p.id,
            authoritativeFingerprint: fingerprintDecisionPackage(p),
            command_key: "update_status",
            serverActor: ACTOR,
        });
        expect(check.ok).toBe(false);
        if (check.ok) return;
        expect(check.reason).toBe("command_key");
    });
});

// ---------------------------------------------------------------------------
// Execution result mapping
// ---------------------------------------------------------------------------

describe("execution result mapping", () => {
    const bindingOf = (p = pkg()) => {
        const parsed = parseProposedCommandBinding(p.recommendation);
        if (!parsed.ok) throw new Error("binding parse failed");
        return resolveExecutionBinding(p, parsed.binding);
    };

    it("a committed result produces exactly one executed observation with the authoritative id", () => {
        const plan = planExecutionObservation({
            binding: bindingOf(),
            outcome: {
                status: "committed",
                invocation_id: "inv-42",
                canonical_command_key: "update_status",
                execution_owner: "registered_action",
            },
            actor: ACTOR,
            channel: "operator",
        });
        expect(plan.observation).not.toBeNull();
        expect(plan.observation!.observation_kind).toBe("executed");
        expect(plan.observation!.execution_reference).toBe("inv-42");
        expect(plan.observation!.org_id).toBe(ORG);
        expect(plan.observation!.package_id).toBe(PKG);
    });

    it("a refused command does not produce an executed observation", () => {
        const plan = planExecutionObservation({
            binding: bindingOf(),
            outcome: { status: "refused", invocation_id: "inv-9", failure_status: "blocked", error_code: "E_BLOCKED" },
            actor: ACTOR,
            channel: "operator",
        });
        expect(plan.observation!.observation_kind).toBe("outcome");
        expect(plan.observation!.detail).toMatchObject({ result: "failed", failure_class: "command_refused" });
    });

    it("command refusal and infrastructure failure stay distinct", () => {
        const refused = planExecutionObservation({
            binding: bindingOf(),
            outcome: { status: "refused", invocation_id: "i", failure_status: "invalid", error_code: "E" },
            actor: ACTOR,
            channel: "operator",
        });
        const infra = planExecutionObservation({
            binding: bindingOf(),
            outcome: { status: "infrastructure_failure", invocation_id: "i", error_code: "ETIMEDOUT" },
            actor: ACTOR,
            channel: "operator",
        });
        expect(refused.observation!.detail.failure_class).toBe("command_refused");
        expect(infra.observation!.detail.failure_class).toBe("infrastructure_failure");
        expect(infra.reason).toContain("unknown to Trust");
    });

    it("the full operational result is never copied into Trust", () => {
        const plan = planExecutionObservation({
            binding: bindingOf(),
            outcome: {
                status: "committed",
                invocation_id: "inv-1",
                canonical_command_key: "update_status",
                execution_owner: "registered_action",
            },
            actor: ACTOR,
            channel: "operator",
        });
        for (const key of Object.keys(plan.observation!.detail)) {
            expect(ALLOWED_EXECUTION_DETAIL_KEYS).toContain(key);
        }
    });

    it("execution is not inferred from acceptance — the projection reports executed only once an observation exists", () => {
        const p = pkg();
        expect(projectionFor(p, [obs("accepted")]).execution.state).toBe("not_bound");
        expect(projectionFor(p, [obs("accepted"), obs("executed", { execution_reference: "inv-1" })]).execution.state).toBe(
            "executed",
        );
    });

    it("only a committed outcome can produce an executed observation", () => {
        const outcomes: AuthoritativeCommandOutcome[] = [
            { status: "refused", invocation_id: "i", failure_status: "blocked", error_code: "E" },
            { status: "infrastructure_failure", invocation_id: "i", error_code: "E" },
        ];
        for (const outcome of outcomes) {
            const plan = planExecutionObservation({ binding: bindingOf(), outcome, actor: ACTOR, channel: "operator" });
            expect(plan.observation!.observation_kind).not.toBe("executed");
        }
    });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("idempotency", () => {
    it("the invocation seed is deterministic across identical packages", () => {
        const parsedA = parseProposedCommandBinding(pkg().recommendation);
        const parsedB = parseProposedCommandBinding(pkg().recommendation);
        if (!parsedA.ok || !parsedB.ok) throw new Error("binding parse failed");
        expect(resolveExecutionBinding(pkg(), parsedA.binding).invocation_seed).toBe(
            resolveExecutionBinding(pkg(), parsedB.binding).invocation_seed,
        );
    });

    it("a different command or package yields a different seed", () => {
        const parse = (p: DecisionPackageV1) => {
            const r = parseProposedCommandBinding(p.recommendation);
            if (!r.ok) throw new Error("parse failed");
            return resolveExecutionBinding(p, r.binding).invocation_seed;
        };
        const base = parse(pkg());
        expect(parse(pkg({ id: "pkg-2" }))).not.toBe(base);
        expect(
            parse(pkg({ recommendation: { proposed_command: proposedCommand({ command_key: "confirm_tour" }) } })),
        ).not.toBe(base);
    });

    it("replaying a confirmed execution cannot produce a second success", () => {
        const p = pkg();
        // First attempt is executable.
        expect(evaluate({ package: p, projection: projectionFor(p) }).ok).toBe(true);
        // Once the executed observation exists, the identical request is refused.
        const after = projectionFor(p, [obs("executed", { execution_reference: "inv-1" })]);
        expect(refusalOf(evaluate({ package: p, projection: after })).code).toBe("package_already_executed");
    });

    it("Trust holds no idempotency store of its own", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/execution/proposedCommandBinding.ts"), "utf8");
        for (const forbidden of [".from(", "insert", "upsert", "Map(", "Set("]) {
            expect(`seed module contains ${src.includes(forbidden) ? forbidden : "no store"}`).toBe(
                "seed module contains no store",
            );
        }
    });
});

// ---------------------------------------------------------------------------
// Boundary
// ---------------------------------------------------------------------------

describe("boundary", () => {
    function walk(dir: string, out: string[] = []): string[] {
        let entries: string[];
        try {
            entries = readdirSync(dir);
        } catch {
            return out;
        }
        for (const entry of entries) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) walk(full, out);
            else if (full.endsWith(".ts")) out.push(full);
        }
        return out;
    }

    /**
     * `[^;]*?` rather than `[\s\S]*?` on purpose: an import statement ends at
     * its semicolon, so this cannot lazily span from one statement's `import`
     * keyword to a later statement's `from` clause and mis-attribute which one
     * carried `type`.
     */
    const IMPORT_STATEMENT = (target: string) =>
        new RegExp(String.raw`^import\s+(type\s+)?[^;]*?from\s+"(${target}[^"]*)";`, "gm");

    it("lib/trust has no value import from lib/adminV2/actions", () => {
        const offenders: string[] = [];
        for (const file of walk(join(WEB_ROOT, "lib/trust"))) {
            const src = readFileSync(file, "utf8");
            for (const m of src.matchAll(IMPORT_STATEMENT(String.raw`@/lib/adminV2/actions`))) {
                if (!m[1]) offenders.push(`${file.replace(WEB_ROOT, "")} -> ${m[2]}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("the import scanner can actually detect a value import", () => {
        // A boundary scanner that silently matches nothing proves nothing.
        const planted = 'import { thing } from "@/lib/adminV2/actions/actionTypes";';
        const matches = [...planted.matchAll(IMPORT_STATEMENT(String.raw`@/lib/adminV2/actions`))];
        expect(matches).toHaveLength(1);
        expect(matches[0]![1]).toBeUndefined();

        const typed = 'import type { thing } from "@/lib/adminV2/actions/actionTypes";';
        const typedMatches = [...typed.matchAll(IMPORT_STATEMENT(String.raw`@/lib/adminV2/actions`))];
        expect(typedMatches[0]![1]?.trim()).toBe("type");
    });

    it("lib/trust/execution imports no command-runtime module at all", () => {
        const offenders: string[] = [];
        for (const file of walk(join(WEB_ROOT, "lib/trust/execution"))) {
            const src = readFileSync(file, "utf8");
            for (const m of src.matchAll(/from\s+"(@\/lib\/[^"]+)"/g)) {
                const target = m[1]!;
                if (!target.startsWith("@/lib/trust/")) offenders.push(`${file.replace(WEB_ROOT, "")} -> ${target}`);
            }
        }
        // The execution contract is Trust-internal by construction.
        expect(offenders).toEqual([]);
    });

    it("the synthetic catalog certifies Trust with no command-runtime import", () => {
        // This whole suite's evaluator cases run on `catalog()`, which is local.
        const r = evaluateExecutability({
            package: pkg(),
            projection: projectionFor(pkg()),
            catalog: catalog(),
            confirmation: confirmationFor(pkg()),
            serverActor: ACTOR,
        });
        expect(r.ok).toBe(true);
    });

    it("the production adapter is narrow and lives outside lib/trust", () => {
        const adapterPath = "lib/platform/commands/trust/trustCommandCatalogAdapter.ts";
        const src = readFileSync(join(WEB_ROOT, adapterPath), "utf8");
        // It may import the Trust port only as a type, so the edge is erased.
        const trustImports = [...src.matchAll(IMPORT_STATEMENT(String.raw`@/lib/trust`))];
        expect(trustImports.length).toBeGreaterThan(0);
        for (const m of trustImports) {
            expect(`${m[2]} imported as ${m[1] ? "type" : "value"}`).toBe(`${m[2]} imported as type`);
        }
        // And it exposes exactly the port's four facts.
        const described = createTrustCommandCatalogAdapter().describe("create_lead");
        expect(described).not.toBeNull();
        expect(Object.keys(described!).sort()).toEqual(
            [
                "accepts_trust_proposals",
                "canonical_command_key",
                "catalog_version",
                "confirmation_required",
                "supported_subject_types",
            ].sort(),
        );
    });

    it("the production adapter refuses an unknown key rather than inventing one", () => {
        const adapter = createTrustCommandCatalogAdapter();
        expect(adapter.describe("definitely_not_a_command")).toBeNull();
        expect(adapter.describe("")).toBeNull();
    });

    it("no command registry exists inside lib/trust", () => {
        for (const file of walk(join(WEB_ROOT, "lib/trust"))) {
            const src = readFileSync(file, "utf8");
            for (const forbidden of ["REGISTERED_ACTION_CAPABILITY_KEYS", "capabilityRegistry", "actionRegistry"]) {
                expect(`${file.replace(WEB_ROOT, "")}: ${src.includes(forbidden) ? forbidden : "clean"}`).toBe(
                    `${file.replace(WEB_ROOT, "")}: clean`,
                );
            }
        }
    });

    it("the empty catalog fails closed", () => {
        expect(createEmptyTrustCommandCatalog().describe("anything")).toBeNull();
    });
});
