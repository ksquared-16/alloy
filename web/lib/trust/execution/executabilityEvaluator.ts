/**
 * Executability evaluator — the Trust binding gate.
 *
 * Answers exactly one question: *may this confirmed Decision Package be handed
 * to the Operational Command Runtime at all?* It never answers whether the
 * command will succeed, whether the caller is permitted, or whether the subject
 * is eligible — those are the command runtime's, evaluated AFTER this gate and
 * never duplicated here.
 *
 * Pure and total: every input yields a structured result, never an exception,
 * never a bare boolean. A boolean would have thrown away the reason, and the
 * reason is what an operator and an auditor both need.
 *
 * Fails closed. Every unknown, absent or unverifiable condition refuses.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.5
 */

import type { DecisionPackageLifecycleProjection } from "@/lib/trust/lifecycle/decisionPackageLifecycle";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { TrustCommandCatalogPort } from "@/lib/trust/execution/commandCatalogPort";
import { fingerprintDecisionPackage, fingerprintsMatch } from "@/lib/trust/execution/decisionPackageFingerprint";
import type { TrustExecutionConfirmation, TrustServerActor } from "@/lib/trust/execution/executionConfirmation";
import { verifyExecutionConfirmation } from "@/lib/trust/execution/executionConfirmation";
import type { TrustResolvedExecutionBinding } from "@/lib/trust/execution/proposedCommandBinding";
import { parseProposedCommandBinding, resolveExecutionBinding } from "@/lib/trust/execution/proposedCommandBinding";

export const EXECUTABILITY_REFUSAL_CODES = [
    /** No authoritative package was supplied for the id under consideration. */
    "package_not_found",
    /** The submitted fingerprint does not match the stored package's content. */
    "package_fingerprint_mismatch",
    /** The package carries no recommendation — a refusal was never actionable. */
    "package_not_actionable",
    "package_expired",
    "package_superseded",
    "package_rejected",
    "package_already_executed",
    /** A prior attempt failed and the command declares no retry allowance. */
    "package_execution_failed_no_retry",
    "command_unknown",
    "command_subject_incompatible",
    "command_rejects_trust_proposals",
    "confirmation_missing",
    /** The confirmation exists but names different content, command or actor. */
    "confirmation_stale",
    "unsupported_binding_version",
    "invalid_recommendation_shape",
] as const;

export type ExecutabilityRefusalCode = (typeof EXECUTABILITY_REFUSAL_CODES)[number];

export type ExecutabilityRefusal = {
    readonly code: ExecutabilityRefusalCode;
    readonly detail: string;
};

export type ExecutabilityResult =
    | {
          readonly ok: true;
          readonly binding: TrustResolvedExecutionBinding;
          /** Canonical key after catalog alias resolution. Hand THIS to the runtime. */
          readonly canonical_command_key: string;
          /** Confirmation the catalog required and the operator supplied. */
          readonly confirmed_at_iso: string;
      }
    | { readonly ok: false; readonly refusal: ExecutabilityRefusal };

export type EvaluateExecutabilityInput = {
    /** The authoritative stored package. `null` when the id resolved to nothing. */
    readonly package: DecisionPackageV1 | null;
    /** Slice 0.4's projection over the package's append-only observations. */
    readonly projection: DecisionPackageLifecycleProjection | null;
    readonly catalog: TrustCommandCatalogPort;
    /** Operator confirmation. Absent means unconfirmed. */
    readonly confirmation: TrustExecutionConfirmation | null;
    /** Actor resolved by the server for THIS request. Never from a request body. */
    readonly serverActor: TrustServerActor;
    /**
     * Whether the command runtime permits a retry after a failed attempt.
     * Supplied by the caller from command policy; Trust holds no retry policy.
     */
    readonly retryAfterFailureAllowed?: boolean;
};

function refuse(code: ExecutabilityRefusalCode, detail: string): ExecutabilityResult {
    return { ok: false, refusal: { code, detail } };
}

/**
 * Evaluates whether a package may be executed.
 *
 * Order is deliberate: package existence and integrity first, then lifecycle
 * standing, then the binding itself, then the catalog, then confirmation. A
 * caller learns the most fundamental problem first, and a stale or superseded
 * package is refused before its command key is ever looked up.
 */
export function evaluateExecutability(input: EvaluateExecutabilityInput): ExecutabilityResult {
    const pkg = input.package;
    if (!pkg) {
        return refuse("package_not_found", "No authoritative Decision Package was found for this request.");
    }
    if (!input.projection) {
        return refuse(
            "package_not_actionable",
            "No lifecycle projection was supplied, so the package's standing is unknown. Unknown standing is not executable.",
        );
    }
    if (input.projection.package_id !== pkg.id) {
        return refuse(
            "package_not_found",
            `The supplied projection describes package ${input.projection.package_id}, not ${pkg.id}.`,
        );
    }

    // ---- 1. the recommendation must be actionable at all --------------------
    if (pkg.outcome !== "recommended" || pkg.recommendation === null) {
        return refuse(
            "package_not_actionable",
            `The package outcome is "${pkg.outcome}", so it carries no recommendation to execute.`,
        );
    }

    // ---- 2. lifecycle standing ---------------------------------------------
    const projection = input.projection;
    if (projection.execution.state === "executed") {
        return refuse(
            "package_already_executed",
            `This package was already executed (reference ${projection.execution.reference ?? "unknown"}). A Decision Package executes at most once.`,
        );
    }
    if (projection.execution.state === "failed" && input.retryAfterFailureAllowed !== true) {
        return refuse(
            "package_execution_failed_no_retry",
            "A prior execution attempt failed and no retry allowance was declared for this command.",
        );
    }
    if (projection.supersession.superseded) {
        return refuse(
            "package_superseded",
            `A newer Decision Package (${projection.supersession.superseding_package_id}) replaced this one.`,
        );
    }
    if (projection.expiry.expired) {
        return refuse("package_expired", `The recommendation expired (${projection.expiry.kind}).`);
    }
    if (projection.review.state === "rejected") {
        return refuse("package_rejected", "An operator rejected this recommendation.");
    }

    // ---- 3. the binding the recommendation declares -------------------------
    const parsed = parseProposedCommandBinding(pkg.recommendation);
    if (!parsed.ok) {
        if (parsed.code === "UNSUPPORTED_BINDING_VERSION") {
            return refuse("unsupported_binding_version", parsed.detail);
        }
        return refuse("invalid_recommendation_shape", parsed.detail);
    }
    const binding = resolveExecutionBinding(pkg, parsed.binding);

    // ---- 4. the catalog ------------------------------------------------------
    const described = input.catalog.describe(binding.command_key);
    if (!described) {
        return refuse(
            "command_unknown",
            `Command "${binding.command_key}" is not registered. Trust holds no command catalog and never invents one.`,
        );
    }
    if (!described.accepts_trust_proposals) {
        return refuse(
            "command_rejects_trust_proposals",
            `Command "${described.canonical_command_key}" does not accept Decision-Package-originated proposals.`,
        );
    }
    if (
        described.supported_subject_types.length > 0 &&
        !described.supported_subject_types.includes(binding.subject.entity_type)
    ) {
        return refuse(
            "command_subject_incompatible",
            `Command "${described.canonical_command_key}" does not act on subject type "${binding.subject.entity_type}". Supported: ${described.supported_subject_types.join(", ")}.`,
        );
    }

    // ---- 5. confirmation -----------------------------------------------------
    if (described.confirmation_required) {
        if (!input.confirmation) {
            return refuse(
                "confirmation_missing",
                `Command "${described.canonical_command_key}" requires an explicit operator confirmation.`,
            );
        }
        // The authoritative fingerprint is recomputed from the stored package.
        // A client-supplied value is only ever an input to this comparison.
        const authoritative = fingerprintDecisionPackage(pkg);
        if (!fingerprintsMatch(binding.package_fingerprint, authoritative)) {
            return refuse(
                "package_fingerprint_mismatch",
                "The resolved binding's fingerprint disagrees with the stored package. Refusing rather than guessing.",
            );
        }
        const check = verifyExecutionConfirmation({
            confirmation: input.confirmation,
            package_id: pkg.id,
            authoritativeFingerprint: authoritative,
            command_key: binding.command_key,
            serverActor: input.serverActor,
        });
        if (!check.ok) {
            return refuse(
                check.reason === "package_fingerprint" ? "package_fingerprint_mismatch" : "confirmation_stale",
                check.detail,
            );
        }
    } else if (input.confirmation) {
        // A confirmation was supplied for a command that needs none. It must
        // still be coherent, or the caller is confused about what it confirmed.
        const check = verifyExecutionConfirmation({
            confirmation: input.confirmation,
            package_id: pkg.id,
            authoritativeFingerprint: fingerprintDecisionPackage(pkg),
            command_key: binding.command_key,
            serverActor: input.serverActor,
        });
        if (!check.ok) {
            return refuse(
                check.reason === "package_fingerprint" ? "package_fingerprint_mismatch" : "confirmation_stale",
                check.detail,
            );
        }
    }

    return {
        ok: true,
        binding,
        canonical_command_key: described.canonical_command_key,
        confirmed_at_iso: input.confirmation?.confirmed_at_iso ?? "",
    };
}
