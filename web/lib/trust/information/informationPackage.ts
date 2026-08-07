/**
 * Trust Information Package.
 *
 * The missing step between canonical Alloy data and privacy-governed reasoning
 * input. Before this module the Trust Runtime took two loose parallel arguments
 * — `resolvedInformation` and `semanticMap` — and `flattenDeclaredElements`
 * spread ONE level of any object value into elements keyed by whatever the
 * source called them. Hand it a `communication_messages` row and every column
 * becomes a reasoning element named after a database field: `body`,
 * `from_address`, `to_address`, `provider_message_id`, `error`, `metadata`.
 *
 * Three things go wrong there, and all three are what this package prevents:
 *
 *  1. **Wholesale serialization.** Nothing declared those columns; they arrived
 *     because they happened to be on the row.
 *  2. **Storage semantics leaking into reasoning.** `body` matches the
 *     structural note rule, so Phase 2.2's content-aware minimizer can clean a
 *     message and the key-name rule still destroys it afterwards. The element's
 *     identity, not its meaning, decided its fate.
 *  3. **No provenance.** Nothing recorded where a reasoning fact came from.
 *
 * So a package is built from an explicit SPEC. Every element is declared, named
 * semantically, classified by meaning, and extracted by a selector the
 * capability wrote. A field nobody declared cannot arrive, because there is no
 * path by which it could.
 *
 * **This is not a second Decision Package and not a second privacy engine.** It
 * produces exactly the inputs the runtime already consumes, so every existing
 * gate still runs on them; and eligibility is computed by calling the real
 * `transformForReasoning`, never by reimplementing it.
 *
 * Pure. No I/O, no clock, no randomness, no provider, no network.
 *
 * @see lib/trust/privacy/privacyEngine.ts — where privacy is actually applied
 * @see lib/trust/execution/decisionPackageFingerprint.ts — the hash precedent
 */

// One-shot `hash()` rather than the incremental `createHash` builder, matching
// `decisionPackageFingerprint.ts`. The boundary suite proves Trust performs no
// durable mutation by scanning `lib/trust` for mutating call syntax, and an
// incremental hash builder uses the same method name as a table write — it
// would defeat that scan for a cosmetic reason. Do not "simplify" this.
import { hash as oneShotHash } from "node:crypto";

import type { TextMinimizationClass } from "@/lib/privacy/minimizeTextContent";
import { validateTextMinimizationRequest } from "@/lib/privacy/minimizeTextContent";
import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import { classifyElements } from "@/lib/trust/classification/informationClasses";
import type { PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";
import { transformForReasoning } from "@/lib/trust/privacy/privacyEngine";
import type { TransformationRecord } from "@/lib/trust/privacy/transformationDispatch";
import type { TextMinimizationRecord } from "@/lib/privacy/minimizeTextContent";

/** Values a reasoning element may hold. Deliberately closed — see {@link isAdmissibleValue}. */
export type InformationElementValue = string | number | boolean | null | readonly (string | number | boolean | null)[];

/**
 * One declared reasoning fact.
 *
 * `key` is the element's TRUST-FACING identity and is deliberately independent
 * of `source_field`. That independence is the whole point: a capability may read
 * `communication_messages.body` and present it as `inbound_message_text`,
 * because what reasoning consumes is the meaning of the fact, not the name of
 * the column it was stored in.
 */
export type InformationElementSpecV1<TSource> = {
    readonly key: string;
    /** Meaning, never storage. Drives classification and therefore transformation. */
    readonly information_class: InformationClass;
    /**
     * Where the fact came from, for provenance only — a field NAME, never a
     * value, and never used to derive reasoning semantics.
     */
    readonly source_field: string;
    /**
     * Embedded classes this element needs minimized inside its text. Validated
     * at build time so an unsupported need refuses the package rather than
     * surfacing later as a silent pass-through.
     */
    readonly required_text_minimizers?: readonly TextMinimizationClass[];
    /** Explicit extraction. The only way a value can enter a package. */
    select(source: TSource): unknown;
};

export type InformationPackageSpecV1<TSource> = {
    /** Stable identity, pinned into the package for replay. */
    readonly key: string;
    readonly version: string;
    readonly decision_class_key: string;
    /** The canonical source this spec reads, e.g. a table name. Provenance only. */
    readonly source_kind: string;
    readonly elements: readonly InformationElementSpecV1<TSource>[];
};

/**
 * Where the facts came from — identities and field names, never values.
 *
 * Enough to explain a reasoning input without reproducing the thing that was
 * minimized. Recording the source content here would defeat every transformation
 * applied downstream.
 */
export type InformationPackageProvenanceV1 = {
    readonly source_kind: string;
    /** Opaque identifiers only (row ids, thread ids, org id). Never content. */
    readonly source_refs: Readonly<Record<string, string>>;
    readonly element_sources: readonly { readonly key: string; readonly source_field: string }[];
};

export type TrustInformationPackageV1 = {
    readonly schema_version: 1;
    readonly spec_key: string;
    readonly spec_version: string;
    readonly decision_class_key: string;
    /** Semantic key → admissible scalar value. The runtime's `resolvedInformation`. */
    readonly elements: Readonly<Record<string, InformationElementValue>>;
    /** Semantic key → information class. The runtime's `semanticMap`. */
    readonly semantic_map: Readonly<Record<string, InformationClass>>;
    /** Union of every element's declared need, deduplicated and sorted. */
    readonly required_text_minimizers: readonly TextMinimizationClass[];
    readonly provenance: InformationPackageProvenanceV1;
    /** Deterministic over declared content — see {@link informationPackageHash}. */
    readonly content_hash: string;
};

export const INFORMATION_PACKAGE_REFUSAL_CODES = [
    "INFO_PACKAGE_NON_SCALAR_ELEMENT",
    "INFO_PACKAGE_DUPLICATE_ELEMENT",
    "INFO_PACKAGE_UNSUPPORTED_MINIMIZER",
    "INFO_PACKAGE_EMPTY_SPEC",
] as const;

export type InformationPackageRefusalCode = (typeof INFORMATION_PACKAGE_REFUSAL_CODES)[number];

export type BuildInformationPackageResult =
    | { readonly ok: true; readonly package: TrustInformationPackageV1 }
    | {
          readonly ok: false;
          readonly refusal_code: InformationPackageRefusalCode;
          /** Names keys, classes and limits. Never a selected VALUE. */
          readonly detail: string;
      };

/**
 * Scalars and arrays of scalars only.
 *
 * This is the structural guarantee against wholesale row serialization. A
 * selector that returns a whole row, a nested object, or an array of rows is
 * REFUSED rather than flattened — because flattening is precisely how a
 * database shape used to become a reasoning shape.
 */
function isAdmissibleValue(value: unknown): value is InformationElementValue {
    if (value === null) return true;
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") return true;
    if (Array.isArray(value)) {
        return value.every((v) => v === null || ["string", "number", "boolean"].includes(typeof v));
    }
    return false;
}

/** Stable JSON: keys sorted recursively, so key order cannot change the hash. */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
        .join(",")}}`;
}

/** Prefix so a package hash is never confused with a Decision Package fingerprint. */
export const INFORMATION_PACKAGE_HASH_PREFIX = "tip1" as const;

/**
 * Deterministic over the DECLARED content: spec identity, elements, classes and
 * minimization needs. Provenance is excluded — the same facts read from a
 * different row are the same reasoning input, and including row ids would make
 * an identical input hash differently for a reason reasoning cannot see.
 */
export function informationPackageHash(input: {
    readonly spec_key: string;
    readonly spec_version: string;
    readonly decision_class_key: string;
    readonly elements: Readonly<Record<string, InformationElementValue>>;
    readonly semantic_map: Readonly<Record<string, InformationClass>>;
    readonly required_text_minimizers: readonly TextMinimizationClass[];
}): string {
    return `${INFORMATION_PACKAGE_HASH_PREFIX}:${oneShotHash("sha256", stableStringify(input), "hex")}`;
}

/**
 * Builds one package from a spec and a canonical source.
 *
 * Refusal, never repair. An undeclarable value is not coerced, an unsupported
 * minimization need is not dropped, and a duplicate key does not overwrite —
 * each of those would produce a package that lies about what it contains.
 */
export function buildInformationPackage<TSource>(input: {
    readonly spec: InformationPackageSpecV1<TSource>;
    readonly source: TSource;
    /** Opaque identifiers for provenance. Values are never read from here. */
    readonly sourceRefs: Readonly<Record<string, string>>;
}): BuildInformationPackageResult {
    const { spec } = input;

    if (spec.elements.length === 0) {
        return {
            ok: false,
            refusal_code: "INFO_PACKAGE_EMPTY_SPEC",
            detail: `Information package spec ${spec.key}@${spec.version} declares no elements; reasoning on nothing is not a decision.`,
        };
    }

    const elements: Record<string, InformationElementValue> = {};
    const semantic_map: Record<string, InformationClass> = {};
    const element_sources: { key: string; source_field: string }[] = [];
    const minimizers = new Set<TextMinimizationClass>();

    for (const element of spec.elements) {
        if (Object.prototype.hasOwnProperty.call(elements, element.key)) {
            return {
                ok: false,
                refusal_code: "INFO_PACKAGE_DUPLICATE_ELEMENT",
                detail: `Information package spec ${spec.key}@${spec.version} declares element "${element.key}" more than once. A silent overwrite would make the package's contents depend on declaration order.`,
            };
        }

        const value = element.select(input.source);
        if (!isAdmissibleValue(value)) {
            return {
                ok: false,
                refusal_code: "INFO_PACKAGE_NON_SCALAR_ELEMENT",
                // The VALUE is deliberately absent — it is exactly the raw
                // structure this refusal exists to keep out, and a refusal that
                // quotes it would leak what it just refused.
                detail: `Element "${element.key}" of spec ${spec.key}@${spec.version} selected a non-scalar value (${Array.isArray(value) ? "array with non-scalar members" : typeof value}). A package admits scalars and arrays of scalars only, so a raw row can never be serialized wholesale.`,
            };
        }

        for (const m of element.required_text_minimizers ?? []) minimizers.add(m);

        elements[element.key] = value;
        semantic_map[element.key] = element.information_class;
        element_sources.push({ key: element.key, source_field: element.source_field });
    }

    // Declared needs are validated against what the platform can actually do.
    // Deferring this to reasoning time would let a package look ready and refuse
    // later, which is the failure mode Phase 2.2 was written to remove.
    const required_text_minimizers = [...minimizers].sort();
    const minimizerCheck = validateTextMinimizationRequest(required_text_minimizers);
    if (!minimizerCheck.ok) {
        return {
            ok: false,
            refusal_code: "INFO_PACKAGE_UNSUPPORTED_MINIMIZER",
            detail: `Information package spec ${spec.key}@${spec.version}: ${minimizerCheck.detail}`,
        };
    }

    return {
        ok: true,
        package: {
            schema_version: 1,
            spec_key: spec.key,
            spec_version: spec.version,
            decision_class_key: spec.decision_class_key,
            elements,
            semantic_map,
            required_text_minimizers,
            provenance: {
                source_kind: spec.source_kind,
                source_refs: { ...input.sourceRefs },
                element_sources,
            },
            content_hash: informationPackageHash({
                spec_key: spec.key,
                spec_version: spec.version,
                decision_class_key: spec.decision_class_key,
                elements,
                semantic_map,
                required_text_minimizers,
            }),
        },
    };
}

// ---------------------------------------------------------------------------
// Eligible reasoning input
// ---------------------------------------------------------------------------

/**
 * The exact reasoning input that WOULD be eligible for provider execution if a
 * governed provider existed.
 *
 * There is still no provider. This artifact is what a provider adapter would
 * one day be handed, computed so it can be asserted today.
 */
export type EligibleReasoningInputV1 = {
    readonly schema_version: 1;
    readonly spec_key: string;
    readonly spec_version: string;
    readonly decision_class_key: string;
    readonly privacy_policy_key: string;
    /** Post-privacy. Semantic keys only; no source column ever appears here. */
    readonly elements: Readonly<Record<string, unknown>>;
    readonly classes_present: readonly InformationClass[];
    readonly pii_mode: string;
    readonly transformations: readonly TransformationRecord[];
    readonly text_minimizations: readonly TextMinimizationRecord[];
    readonly provenance: InformationPackageProvenanceV1;
    /** Deterministic over the eligible content. Distinct prefix from a package. */
    readonly content_hash: string;
};

export const ELIGIBLE_REASONING_INPUT_HASH_PREFIX = "teri1" as const;

export type EligibleReasoningInputResult =
    | { readonly ok: true; readonly input: EligibleReasoningInputV1 }
    | {
          readonly ok: false;
          /** Whatever the privacy engine refused with. Never restated here. */
          readonly refusal_code: string;
          readonly detail: string;
      };

/**
 * Applies the REAL privacy engine to a package and reports what would be
 * eligible.
 *
 * Deliberately delegates: classification and transformation are
 * `classifyElements` and `transformForReasoning`, unchanged. A second privacy
 * implementation here would be a second thing to keep correct, and the first
 * time they disagreed the safer one would not be the one in the provider path.
 *
 * The policy remains the sole privacy authority. The package declares what it
 * NEEDS minimized; the policy decides what IS minimized. Where they disagree,
 * {@link informationPackageNeedsMetByPolicy} makes the gap visible to the
 * caller rather than letting the package assume it was honoured.
 */
export function buildEligibleReasoningInput(input: {
    readonly package: TrustInformationPackageV1;
    readonly policy: PrivacyPolicyV1;
}): EligibleReasoningInputResult {
    const classification = classifyElements(input.package.elements, input.package.semantic_map);
    const transformed = transformForReasoning({ classification, policy: input.policy, knowledge: [] });

    if (!transformed.ok) {
        return { ok: false, refusal_code: transformed.refusal_code, detail: transformed.detail };
    }

    const context = transformed.context;
    const material = {
        spec_key: input.package.spec_key,
        spec_version: input.package.spec_version,
        decision_class_key: input.package.decision_class_key,
        privacy_policy_key: input.policy.key,
        elements: context.transformed,
        classes_present: context.classes_present,
        pii_mode: context.pii_mode,
    };

    return {
        ok: true,
        input: {
            schema_version: 1,
            spec_key: input.package.spec_key,
            spec_version: input.package.spec_version,
            decision_class_key: input.package.decision_class_key,
            privacy_policy_key: input.policy.key,
            elements: context.transformed,
            classes_present: context.classes_present,
            pii_mode: context.pii_mode,
            transformations: context.transformations,
            text_minimizations: context.text_minimizations,
            provenance: input.package.provenance,
            content_hash: `${ELIGIBLE_REASONING_INPUT_HASH_PREFIX}:${oneShotHash("sha256", stableStringify(material), "hex")}`,
        },
    };
}

/**
 * Whether a policy covers every minimization the package declared it needs.
 *
 * Advisory to the caller, NOT an authority — the policy is still the only thing
 * that decides what runs. This exists so a capability can detect that its
 * declared need is unmet and decline to proceed, which is the fail-closed
 * possibility Director decision D-9 requires be preserved: unsupported
 * identity-bearing prose must be able to stop egress rather than pass silently.
 */
export function informationPackageNeedsMetByPolicy(
    pkg: TrustInformationPackageV1,
    policy: PrivacyPolicyV1,
): { readonly met: true } | { readonly met: false; readonly unmet: readonly TextMinimizationClass[] } {
    const covered = new Set(policy.required_text_minimizers ?? []);
    const unmet = pkg.required_text_minimizers.filter((m) => !covered.has(m));
    return unmet.length === 0 ? { met: true } : { met: false, unmet };
}
