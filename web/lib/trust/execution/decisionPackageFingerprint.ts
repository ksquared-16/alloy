/**
 * Decision Package fingerprint.
 *
 * A confirmation must bind to the exact immutable package content an operator
 * reviewed. No authoritative package hash existed before this slice, so this is
 * the smallest deterministic one that can do that job.
 *
 * Modelled on the repository's existing precedent — `stableStringify` +
 * SHA-256 over an explicitly selected material set
 * (`lib/operationalExpectations/intake/authoringFingerprint.ts`,
 * `lib/pos/processingIdentity/plan/planHash.ts`). Nothing cryptographic is
 * claimed beyond what that gives: this detects a different or altered package,
 * it is not a signature and it does not authenticate a caller.
 *
 * Pure. No I/O, no clock, no randomness, no provider.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.5
 */

// The ONE-SHOT `hash()` rather than the incremental `createHash` builder,
// deliberately. The boundary suite proves the Trust Runtime performs no durable
// mutation by scanning `lib/trust` source for mutating call syntax, and an
// incremental hash builder uses the same method name as a table write — so it
// would defeat that scan for a purely cosmetic reason. Do not "simplify" this
// back to the streaming form.
import { hash as oneShotHash } from "node:crypto";

import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";

/**
 * Stable JSON: object keys sorted recursively, so key ordering can never change
 * the fingerprint. Identical to the authoring-intake precedent.
 */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * The subset of a Decision Package the fingerprint covers.
 *
 * INCLUDED — identity, and everything that decides what would be executed:
 * the recommendation itself, the class that governs it, the outcome that makes
 * it actionable, the lineage it declares, the review requirement that decides
 * whether a human must confirm, and the version pins that make it reproducible.
 *
 * EXCLUDED — operator-facing prose and evaluation metadata: explanation,
 * evidence, remaining uncertainty, confidence, trust vector and score, the
 * validation report, privacy report, economics, knowledge versions, learning
 * metadata, alternatives and creation time. None of them changes WHAT would be
 * executed, and a presentation layer that decorates a package must not be able
 * to invalidate a confirmation.
 *
 * The selection is explicit, so a field added to the package later does not
 * silently join or silently miss the fingerprint — it must be placed on purpose.
 */
export type DecisionPackageFingerprintMaterial = {
    readonly schema_version: number;
    readonly package_id: string;
    readonly contract_id: string;
    readonly org_id: string;
    readonly decision_class_key: string;
    readonly outcome: string;
    readonly recommendation: unknown;
    readonly review_requirement: string;
    readonly supersedes_package_id: string | null;
    readonly strategy_key: string | null;
    readonly strategy_version: string | null;
    readonly validation_version: string | null;
    readonly runtime_version: string;
    readonly registry_version: string;
};

/** The package fields the fingerprint reads. Exported so tests can assert the selection. */
export const FINGERPRINT_MATERIAL_FIELDS = [
    "schema_version",
    "package_id",
    "contract_id",
    "org_id",
    "decision_class_key",
    "outcome",
    "recommendation",
    "review_requirement",
    "supersedes_package_id",
    "strategy_key",
    "strategy_version",
    "validation_version",
    "runtime_version",
    "registry_version",
] as const;

export function decisionPackageFingerprintMaterial(
    pkg: DecisionPackageV1,
): DecisionPackageFingerprintMaterial {
    return {
        schema_version: pkg.schema_version,
        package_id: pkg.id,
        contract_id: pkg.contract_id,
        org_id: pkg.org_id,
        decision_class_key: pkg.decision_class_key,
        outcome: pkg.outcome,
        recommendation: pkg.recommendation,
        review_requirement: pkg.review_requirement,
        supersedes_package_id: pkg.supersedes_package_id,
        strategy_key: pkg.strategy_key,
        strategy_version: pkg.strategy_version,
        validation_version: pkg.validation_version,
        runtime_version: pkg.runtime_version,
        registry_version: pkg.registry_version,
    };
}

/** Prefix so a fingerprint is never confused with another hash in a log or a column. */
export const DECISION_PACKAGE_FINGERPRINT_PREFIX = "tdpf1" as const;

/**
 * Deterministic fingerprint of a Decision Package's execution-relevant content.
 *
 * Same content → same fingerprint, in any key order, in any process. The
 * package is read, never written.
 */
export function fingerprintDecisionPackage(pkg: DecisionPackageV1): string {
    const digest = oneShotHash("sha256", stableStringify(decisionPackageFingerprintMaterial(pkg)), "hex");
    return `${DECISION_PACKAGE_FINGERPRINT_PREFIX}:${digest}`;
}

/**
 * Constant-time-ish equality for two fingerprints.
 *
 * Both sides are server-computed or server-stored values, so this guards
 * against an accidental loose comparison rather than against a timing attacker.
 * A client-supplied fingerprint is never trusted: callers compare a submitted
 * value against one recomputed from the authoritative package.
 */
export function fingerprintsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
