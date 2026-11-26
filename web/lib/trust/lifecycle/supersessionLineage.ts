/**
 * Supersession lineage — the bounded evidence a `superseded` observation carries,
 * and the deterministic identity that makes appending one exactly-once.
 *
 * ## Two ways a governed judgment stops being current
 *
 * Phase 0 modelled only the first:
 *
 * ```text
 * a newer Decision Package replaced it   → superseding_package_id names the successor
 * an authority outside Trust replaced it → no successor package exists at all
 * ```
 *
 * The second is real. When a Processing operator decides a subject's identity
 * directly, the engine's judgment is no longer the authoritative result, but no
 * deterministic replacement package was produced — an operator decision is a
 * Processing act, not reasoning, and minting a package for it would label a human
 * decision as deterministic output. So the observation names its SOURCE and a
 * durable reference into the deciding authority instead of inventing a successor
 * id.
 *
 * `superseding_package_id` is therefore nullable, but never absent-and-unexplained:
 * exactly one of a successor package or a declared external source must be present.
 *
 * ## Deterministic observation identity
 *
 * `trust_decision_observations.id` is a `uuid PRIMARY KEY`. It has a default, but
 * a supplied value is equally legal — so deriving it from the supersession's own
 * identity makes the primary key the exactly-once authority:
 *
 * ```text
 * one supersession identity → one observation id → at most one row (PRIMARY KEY)
 * ```
 *
 * The same mechanism Phase 1.5 used to make the contract id the adoption
 * identity. No second idempotency table, no uniqueness constraint, no migration.
 *
 * This module performs no I/O and owns no capability vocabulary.
 */

// The one-shot `hash()` rather than the streaming digest builder. A Phase 0
// structural control forbids the mutating-call syntax anywhere in `lib/trust`,
// on the principle that a Trust module able to write one is a Trust module able
// to mutate a Decision Package — and the control matches source text, including
// comments. The digest is identical either way.
import { hash } from "node:crypto";

/**
 * Where the replacing authority lives.
 *
 * Closed. An unrecognised value is not interpreted — the projection fails rather
 * than guessing what replaced a governed judgment.
 */
export const SUPERSESSION_SOURCES = [
    /** A newer Decision Package. `superseding_package_id` names it. */
    "replacement_decision_package",
    /**
     * A durable decision by an authority outside Trust — today, a Processing
     * operator decision. No successor package exists and none is invented.
     */
    "external_authority_decision",
] as const;

export type SupersessionSource = (typeof SUPERSESSION_SOURCES)[number];

export function parseSupersessionSource(raw: unknown): SupersessionSource | null {
    return typeof raw === "string" && (SUPERSESSION_SOURCES as readonly string[]).includes(raw)
        ? (raw as SupersessionSource)
        : null;
}

/** Bumped if the detail shape below changes. Read before interpreting a row. */
export const SUPERSESSION_LINEAGE_SCHEMA_VERSION = 1 as const;

/** Longest an external reference may be. Bounds the row; nothing is truncated silently. */
const MAX_REFERENCE_LENGTH = 200;

/** Reference and reason are opaque identifiers and closed categories, never free text. */
const SAFE_TOKEN = /^[A-Za-z0-9_:.-]+$/;

export type SupersessionDetail = {
    readonly lineage_schema_version: typeof SUPERSESSION_LINEAGE_SCHEMA_VERSION;
    readonly supersession_source: SupersessionSource;
    /** The successor package, or `null` when an external authority replaced the judgment. */
    readonly superseding_package_id: string | null;
    /**
     * A durable, opaque reference into the replacing authority's own record —
     * e.g. `processing_resolution:<uuid>`. Required when there is no successor
     * package, so "no package" never means "no evidence".
     */
    readonly superseding_reference: string | null;
    /** A closed category owned by the capability. Never an operator's own words. */
    readonly reason: string;
};

export type SupersessionDetailInput = {
    readonly supersession_source: SupersessionSource;
    readonly superseding_package_id?: string | null;
    readonly superseding_reference?: string | null;
    readonly reason: string;
    /** Extra bounded, capability-owned context. Every value must be a safe token. */
    readonly context?: Readonly<Record<string, string>>;
};

export type SupersessionDetailResult =
    | { readonly ok: true; readonly detail: Readonly<Record<string, unknown>> }
    | { readonly ok: false; readonly reason: string };

function isSafeToken(value: string): boolean {
    return value.length > 0 && value.length <= MAX_REFERENCE_LENGTH && SAFE_TOKEN.test(value);
}

/**
 * Build validated supersession detail, or refuse.
 *
 * Fails CLOSED. A malformed reference, an unbounded reason, or a source that
 * contradicts what it supplies produces no detail at all rather than a row that
 * a later projection has to interpret charitably.
 */
export function buildSupersessionDetail(input: SupersessionDetailInput): SupersessionDetailResult {
    const source = parseSupersessionSource(input.supersession_source);
    if (!source) return { ok: false, reason: "unknown_supersession_source" };

    const packageId = input.superseding_package_id ?? null;
    const reference = input.superseding_reference ?? null;

    if (!isSafeToken(input.reason)) return { ok: false, reason: "unsafe_reason_category" };
    if (packageId !== null && !isSafeToken(packageId)) return { ok: false, reason: "unsafe_superseding_package_id" };
    if (reference !== null && !isSafeToken(reference)) return { ok: false, reason: "unsafe_superseding_reference" };

    if (source === "replacement_decision_package" && !packageId) {
        return { ok: false, reason: "replacement_source_requires_package_id" };
    }
    if (source === "external_authority_decision") {
        if (packageId) return { ok: false, reason: "external_source_may_not_name_a_package" };
        if (!reference) return { ok: false, reason: "external_source_requires_a_reference" };
    }

    const context: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.context ?? {})) {
        if (!isSafeToken(key) || !isSafeToken(value)) {
            return { ok: false, reason: `unsafe_context_value:${key}` };
        }
        context[key] = value;
    }

    const detail: SupersessionDetail & Record<string, unknown> = {
        lineage_schema_version: SUPERSESSION_LINEAGE_SCHEMA_VERSION,
        supersession_source: source,
        superseding_package_id: packageId,
        superseding_reference: reference,
        reason: input.reason,
        ...context,
    };
    return { ok: true, detail };
}

/**
 * The stable identity of one supersession.
 *
 * ```text
 * org + prior package + what replaced it + why
 * ```
 *
 * Retrying the same operator action, or replaying the same replacement capture,
 * derives the same id and therefore cannot append a second row. A genuinely
 * different replacement derives a different id — and the projection then reports
 * `CONTRADICTORY_SUPERSESSION` rather than silently picking one, which is the
 * correct outcome for lineage that cannot be true twice.
 */
export const SUPERSESSION_OBSERVATION_IDENTITY_VERSION = "trust-supersession-observation-v1" as const;

export function supersessionObservationId(input: {
    readonly org_id: string;
    readonly prior_package_id: string;
    readonly superseding_package_id: string | null;
    readonly superseding_reference: string | null;
    readonly reason: string;
}): string {
    // Positional, unit-separated: no component value can impersonate a boundary,
    // and object-key order cannot reach the digest.
    const canonical = [
        SUPERSESSION_OBSERVATION_IDENTITY_VERSION,
        input.org_id,
        input.prior_package_id,
        input.superseding_package_id ?? "",
        input.superseding_reference ?? "",
        input.reason,
    ].join("\u001f");
    const hex = hash("sha256", canonical, "hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
