/**
 * The ONE canonical seam for recording that an operator REVIEWED a governed
 * identity judgment without replacing it.
 *
 * Phase 1.6 gave Trust a way to say "an operator replaced this". It had no way
 * to say "an operator agreed with this", so agreement was recorded as
 * replacement — which was false, and which made the reviewed judgment
 * ineligible for the execution binding Phase 1.7 adds.
 *
 * ```text
 * operator agreed with the engine   → accepted
 * operator postponed the decision   → deferred
 * ```
 *
 * Both kinds are already in the Phase 0 vocabulary and both already have
 * projection semantics. **No new observation kind is introduced and none is
 * needed** — which is why this slice writes no SQL.
 *
 * The operator decision itself never becomes a Decision Package: it is a
 * Processing act, and minting a package for it would label a human decision as
 * deterministic reasoning. Only its lifecycle consequence reaches Trust.
 *
 * ## Exactly-once
 *
 * The deterministic observation id IS the review identity, so the primary key
 * refuses an equivalent second append. Pre-check, primary-key collision,
 * post-conflict re-read — the shape Phases 1.5 through 1.7 proved, and the same
 * path by which an ambiguous success is recovered.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import { captureOutcome } from "@/lib/trust/observation/captureOutcome";
import { reviewObservationId } from "@/lib/trust/lifecycle/reviewObservationIdentity";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { createSupabaseTrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";

export type TrustPackageReviewRef = {
    readonly id: string;
    readonly org_id: string;
    readonly contract_id: string;
};

export type ReviewPackageLookup = (input: { package_id: string }) => Promise<TrustPackageReviewRef | null>;

export type ExistingReviewObservation = {
    readonly observation_id: string;
    readonly observation_kind: string;
};

export type ReviewObservationLookup = (input: {
    org_id: string;
    package_id: string;
}) => Promise<readonly ExistingReviewObservation[]>;

/**
 * Production lookups. They live in `lib/trust` because Processing must never
 * query a `trust_` table, and a structural control asserts it does not.
 */
export function createSupabaseReviewPackageLookup(): ReviewPackageLookup {
    return async ({ package_id }) => {
        const { data, error } = await createAdminClient()
            .from("trust_decision_packages")
            .select("id, org_id, contract_id")
            .eq("id", package_id)
            .limit(1)
            .maybeSingle();
        if (error) throw new Error(`trust.reviewPackageLookup: ${error.message}`);
        return (data as TrustPackageReviewRef | null) ?? null;
    };
}

export function createSupabaseReviewObservationLookup(): ReviewObservationLookup {
    return async ({ org_id, package_id }) => {
        const { data, error } = await createAdminClient()
            .from("trust_decision_observations")
            .select("id, observation_kind")
            .eq("org_id", org_id)
            .eq("package_id", package_id)
            .in("observation_kind", ["accepted", "deferred", "rejected", "overridden", "modified", "presented"]);
        if (error) throw new Error(`trust.reviewObservationLookup: ${error.message}`);
        return ((data ?? []) as { id: string; observation_kind: string }[]).map((row) => ({
            observation_id: row.id,
            observation_kind: row.observation_kind,
        }));
    };
}

/** Keys the review detail may carry. Bounded categories and opaque ids only. */
export const ALLOWED_REVIEW_DETAIL_KEYS: readonly string[] = [
    "effect",
    "engine_action",
    "operator_action",
    "processing_case_id",
    "subject_ref",
    "generation_id",
    "processing_resolution_id",
];

const SAFE_TOKEN = /^[A-Za-z0-9_:.-]+$/;
const MAX_TOKEN_LENGTH = 200;

export type ObserveReviewResult =
    | { readonly status: "observed"; readonly observationId: string }
    | { readonly status: "already_observed"; readonly observationId: string }
    /** Deterministically refused. Retrying with the same input refuses identically. */
    | { readonly status: "refused"; readonly reason: string }
    /** Trust could not record it. The caller must persist a durable gap. */
    | { readonly status: "gap_required"; readonly reason: string };

export type ObserveReviewDeps = {
    readonly repository?: TrustRepository;
    readonly reviewPackageLookup?: ReviewPackageLookup;
    readonly reviewObservationLookup?: ReviewObservationLookup;
};

export type ObserveReviewInput = {
    readonly org_id: string;
    readonly package_id: string;
    readonly observation_kind: "accepted" | "deferred";
    /** Durable reference into the deciding Processing authority. */
    readonly processing_reference: string;
    /** The bounded effect category. Never operator prose. */
    readonly effect: string;
    readonly detail: Readonly<Record<string, string>>;
    /** Authoritative actor, from server context. Never client-supplied. */
    readonly actor_type: "operator" | "system" | "automation";
    readonly actor_id?: string | null;
    readonly channel: string;
    readonly correlation_id: string;
};

/**
 * Append exactly one review observation, or explain why not.
 *
 * Never throws for an expected condition, and never mutates a Decision Package.
 */
export async function observeProcessingIdentityOperatorReview(
    input: ObserveReviewInput,
    deps: ObserveReviewDeps = {},
): Promise<ObserveReviewResult> {
    const packageLookup = deps.reviewPackageLookup ?? createSupabaseReviewPackageLookup();
    const observationLookup = deps.reviewObservationLookup ?? createSupabaseReviewObservationLookup();
    const repository = deps.repository ?? createSupabaseTrustRepository();

    // ---- 1. bounded detail — fail closed ------------------------------------
    if (!isSafeToken(input.processing_reference)) {
        return { status: "refused", reason: "unsafe_processing_reference" };
    }
    if (!isSafeToken(input.effect)) return { status: "refused", reason: "unsafe_effect_category" };
    for (const [key, value] of Object.entries(input.detail)) {
        if (!ALLOWED_REVIEW_DETAIL_KEYS.includes(key)) {
            return { status: "refused", reason: `detail_key_not_allowed:${key}` };
        }
        if (!isSafeToken(value)) return { status: "refused", reason: `unsafe_detail_value:${key}` };
    }

    // ---- 2. the package must exist, in this org -----------------------------
    let pkg: TrustPackageReviewRef | null;
    try {
        // Read unscoped by org so a cross-tenant package is REFUSED as such
        // rather than reported as "not found".
        pkg = await packageLookup({ package_id: input.package_id });
    } catch (e) {
        // A failed read must NOT fall through to an append.
        return { status: "gap_required", reason: `review_package_lookup_failed: ${message(e)}` };
    }
    if (!pkg) return { status: "refused", reason: "package_not_found" };
    if (pkg.org_id !== input.org_id) return { status: "refused", reason: "package_org_mismatch" };

    const observationId = reviewObservationId({
        org_id: input.org_id,
        package_id: input.package_id,
        observation_kind: input.observation_kind,
        processing_reference: input.processing_reference,
        effect: input.effect,
    });

    // ---- 3. pre-check -------------------------------------------------------
    const existing = await readExisting(observationLookup, input.org_id, input.package_id);
    if (existing.status === "failed") {
        return { status: "gap_required", reason: `review_observation_lookup_failed: ${existing.reason}` };
    }
    if (existing.rows.some((r) => r.observation_id === observationId)) {
        return { status: "already_observed", observationId };
    }

    // ---- 4. append, through the ONE observation writer ----------------------
    try {
        await captureOutcome({
            repository,
            id: observationId,
            org_id: input.org_id,
            package_id: input.package_id,
            contract_id: pkg.contract_id,
            decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
            correlation_id: input.correlation_id,
            observation_kind: input.observation_kind,
            observed_by_actor_type: input.actor_type,
            observed_by_actor_id: input.actor_id ?? null,
            channel: input.channel,
            // A review is not an execution. Nothing acted on the world here.
            execution_reference: null,
            detail: { ...input.detail, effect: input.effect } as Record<string, unknown>,
        });
        return { status: "observed", observationId };
    } catch (e) {
        // Lost on the primary key, or an ambiguous success. Re-read: if the
        // winner landed, both callers converge.
        const reason = message(e);
        const after = await readExisting(observationLookup, input.org_id, input.package_id);
        if (after.status === "ok" && after.rows.some((r) => r.observation_id === observationId)) {
            return { status: "already_observed", observationId };
        }
        return { status: "gap_required", reason };
    }
}

function isSafeToken(value: string): boolean {
    return typeof value === "string" && value.length > 0 && value.length <= MAX_TOKEN_LENGTH && SAFE_TOKEN.test(value);
}

function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

async function readExisting(
    lookup: ReviewObservationLookup,
    org_id: string,
    package_id: string,
): Promise<{ status: "ok"; rows: readonly ExistingReviewObservation[] } | { status: "failed"; reason: string }> {
    try {
        return { status: "ok", rows: await lookup({ org_id, package_id }) };
    } catch (e) {
        return { status: "failed", reason: message(e) };
    }
}
