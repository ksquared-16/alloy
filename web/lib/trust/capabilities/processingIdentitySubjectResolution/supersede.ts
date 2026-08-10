/**
 * The ONE canonical seam for making a governed identity judgment non-current.
 *
 * Processing owns the decision that a prior judgment stopped being authoritative.
 * Trust owns what that does to the Decision Package — which is nothing to the
 * package itself: an immutable row is never edited, and one append-only
 * `superseded` observation records the consequence.
 *
 * Both lineage kinds converge here so the rules are stated once:
 *
 * ```text
 * replacement engine package  → superseding_package_id names the successor
 * operator decision, no package → external source + durable Processing reference
 * ```
 *
 * ## Exactly-once, using the primary key the schema already declares
 *
 * The deterministic observation id IS the supersession identity, so:
 *
 * ```text
 * one supersession identity → one observation id → at most one row (PRIMARY KEY)
 * ```
 *
 * Three layers, cheapest first — the shape Phase 1.5's capture seam proved:
 *  1. **Pre-check** by reading the package's existing supersession observations;
 *  2. **Primary-key collision** — the database serializes a concurrent append;
 *  3. **Post-conflict resolve** — the loser re-reads and returns the winner.
 *
 * ## What this refuses
 *
 * Self-supersession, a successor in another organization, and a one-step cycle
 * are refused BEFORE the write, not diagnosed afterwards by the projection. A
 * second, materially different supersession claim is refused too: lineage that
 * cannot be true twice must not be appended twice and left for a reader to
 * reconcile.
 *
 * No `lib/trust` module imports Processing. Processing calls this port; the
 * capability vocabulary (which reason category, which reference) is supplied by
 * the caller and validated here as bounded tokens.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import { captureOutcome } from "@/lib/trust/observation/captureOutcome";
import {
    buildSupersessionDetail,
    supersessionObservationId,
    type SupersessionSource,
} from "@/lib/trust/lifecycle/supersessionLineage";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { createSupabaseTrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";

/** The minimum a package must expose for lineage to be checked. */
export type TrustPackageLineageRef = {
    readonly id: string;
    readonly org_id: string;
    readonly contract_id: string;
    readonly supersedes_package_id: string | null;
};

/** One already-persisted supersession claim on a package. */
export type ExistingSupersession = {
    readonly observation_id: string;
    readonly superseding_package_id: string | null;
    readonly superseding_reference: string | null;
    readonly reason: string | null;
};

/**
 * Loads a package by id ALONE, deliberately unscoped by organization.
 *
 * Scoping the read to the caller's org would turn a cross-tenant successor into
 * "not found", and the cross-org rule would then be unreachable — a refusal that
 * looks like enforcement but never fires. The caller compares `org_id` itself,
 * so the two failures stay distinguishable.
 */
export type PackageLineageLookup = (input: {
    package_id: string;
}) => Promise<TrustPackageLineageRef | null>;

export type SupersessionObservationLookup = (input: {
    org_id: string;
    package_id: string;
}) => Promise<readonly ExistingSupersession[]>;

/**
 * Production lookups.
 *
 * They live in `lib/trust` because Processing must never query a `trust_` table,
 * and a structural control asserts it does not.
 */
export function createSupabasePackageLineageLookup(): PackageLineageLookup {
    return async ({ package_id }) => {
        const { data, error } = await createAdminClient()
            .from("trust_decision_packages")
            .select("id, org_id, contract_id, supersedes_package_id")
            .eq("id", package_id)
            .limit(1)
            .maybeSingle();
        if (error) throw new Error(`trust.packageLineageLookup: ${error.message}`);
        return (data as TrustPackageLineageRef | null) ?? null;
    };
}

export function createSupabaseSupersessionObservationLookup(): SupersessionObservationLookup {
    return async ({ org_id, package_id }) => {
        const { data, error } = await createAdminClient()
            .from("trust_decision_observations")
            .select("id, detail")
            .eq("org_id", org_id)
            .eq("package_id", package_id)
            .eq("observation_kind", "superseded");
        if (error) throw new Error(`trust.supersessionObservationLookup: ${error.message}`);
        return ((data ?? []) as { id: string; detail: Record<string, unknown> | null }[]).map((row) => ({
            observation_id: row.id,
            superseding_package_id:
                typeof row.detail?.superseding_package_id === "string" ? row.detail.superseding_package_id : null,
            superseding_reference:
                typeof row.detail?.superseding_reference === "string" ? row.detail.superseding_reference : null,
            reason: typeof row.detail?.reason === "string" ? row.detail.reason : null,
        }));
    };
}

export type SupersedeIdentityJudgmentResult =
    /** This call appended the supersession observation. */
    | { readonly status: "superseded"; readonly observationId: string }
    /** An equivalent observation already existed. Nothing was appended. */
    | { readonly status: "already_superseded"; readonly observationId: string }
    /**
     * Refused on a lineage rule — self-supersession, cross-org, a cycle, a
     * conflicting prior claim, or malformed detail. Deterministic: retrying with
     * the same input refuses identically, so this is never a transient gap.
     */
    | { readonly status: "refused"; readonly reason: string }
    /** Trust could not record it. The caller must persist a durable lineage gap. */
    | { readonly status: "gap_required"; readonly reason: string };

export type SupersedeIdentityDeps = {
    readonly repository?: TrustRepository;
    readonly packageLookup?: PackageLineageLookup;
    readonly observationLookup?: SupersessionObservationLookup;
};

export type SupersedeIdentityJudgmentInput = {
    readonly org_id: string;
    /** The prior governed engine judgment being made non-current. */
    readonly prior_package_id: string;
    readonly supersession_source: SupersessionSource;
    /** The replacement package. Required for `replacement_decision_package`. */
    readonly superseding_package_id?: string | null;
    /** Durable reference into the deciding authority. Required for an external source. */
    readonly superseding_reference?: string | null;
    /** A closed category owned by the calling capability. Never operator prose. */
    readonly reason: string;
    /** Authoritative actor, from server context. Never client-supplied. */
    readonly actor_type: "operator" | "system" | "automation";
    readonly actor_id?: string | null;
    readonly channel: string;
    readonly correlation_id: string;
    /** Extra bounded, capability-owned context. Every value must be a safe token. */
    readonly context?: Readonly<Record<string, string>>;
};

/**
 * Append exactly one supersession observation, or explain why not.
 *
 * Never throws for an expected condition, and never mutates a Decision Package.
 */
export async function supersedeGovernedIdentityJudgment(
    input: SupersedeIdentityJudgmentInput,
    deps: SupersedeIdentityDeps = {},
): Promise<SupersedeIdentityJudgmentResult> {
    const packageLookup = deps.packageLookup ?? createSupabasePackageLineageLookup();
    const observationLookup = deps.observationLookup ?? createSupabaseSupersessionObservationLookup();
    const repository = deps.repository ?? createSupabaseTrustRepository();

    const supersedingId = input.superseding_package_id ?? null;
    const reference = input.superseding_reference ?? null;

    // ---- 1. bounded, validated detail — fail closed -------------------------
    const built = buildSupersessionDetail({
        supersession_source: input.supersession_source,
        superseding_package_id: supersedingId,
        superseding_reference: reference,
        reason: input.reason,
        context: input.context,
    });
    if (!built.ok) return { status: "refused", reason: `malformed_detail:${built.reason}` };

    // ---- 2. lineage rules that do not need a read ---------------------------
    if (supersedingId && supersedingId === input.prior_package_id) {
        return { status: "refused", reason: "self_supersession" };
    }

    // ---- 3. the prior package must exist, in this org -----------------------
    let prior: TrustPackageLineageRef | null;
    try {
        prior = await packageLookup({ package_id: input.prior_package_id });
    } catch (e) {
        // A failed read must NOT fall through to an append: the package's
        // existing lineage is unknown, and appending blind risks a contradiction.
        return { status: "gap_required", reason: `prior_package_lookup_failed: ${message(e)}` };
    }
    if (!prior) return { status: "refused", reason: "prior_package_not_found" };
    if (prior.org_id !== input.org_id) return { status: "refused", reason: "prior_package_org_mismatch" };

    // ---- 4. the replacement must exist, in the SAME org, without a cycle ----
    if (supersedingId) {
        let successor: TrustPackageLineageRef | null;
        try {
            successor = await packageLookup({ package_id: supersedingId });
        } catch (e) {
            return { status: "gap_required", reason: `superseding_package_lookup_failed: ${message(e)}` };
        }
        if (!successor) return { status: "refused", reason: "superseding_package_not_found" };
        // Read unscoped above precisely so this fires instead of "not found".
        if (successor.org_id !== prior.org_id) {
            return { status: "refused", reason: "cross_org_supersession" };
        }
        // A successor that already declares the subject as its predecessor while
        // the subject declares the successor as its own is a cycle.
        if (prior.supersedes_package_id === successor.id && successor.supersedes_package_id === prior.id) {
            return { status: "refused", reason: "supersession_cycle" };
        }
    }

    const observationId = supersessionObservationId({
        org_id: input.org_id,
        prior_package_id: input.prior_package_id,
        superseding_package_id: supersedingId,
        superseding_reference: reference,
        reason: input.reason,
    });

    // ---- 5. pre-check: an equivalent claim, or a conflicting one ------------
    const existing = await readExisting(observationLookup, input.org_id, input.prior_package_id);
    if (existing.status === "failed") {
        return { status: "gap_required", reason: `supersession_lookup_failed: ${existing.reason}` };
    }
    const decided = decideAgainstExisting(existing.rows, observationId);
    if (decided) return decided;

    // ---- 6. append, through the ONE observation writer ----------------------
    try {
        await captureOutcome({
            repository,
            id: observationId,
            org_id: input.org_id,
            package_id: input.prior_package_id,
            contract_id: prior.contract_id,
            decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
            correlation_id: input.correlation_id,
            observation_kind: "superseded",
            observed_by_actor_type: input.actor_type,
            observed_by_actor_id: input.actor_id ?? null,
            channel: input.channel,
            // Supersession is not an execution. Nothing acted on the world here.
            execution_reference: null,
            detail: built.detail as Record<string, unknown>,
        });
        return { status: "superseded", observationId };
    } catch (e) {
        // An append that raced an equivalent append lost on the primary key.
        // Re-read: if the winner landed, both callers converge immediately —
        // which is also how an AMBIGUOUS success (the row committed, the
        // response did not arrive) is recovered.
        const reason = message(e);
        const after = await readExisting(observationLookup, input.org_id, input.prior_package_id);
        if (after.status === "ok") {
            const resolved = decideAgainstExisting(after.rows, observationId);
            if (resolved) return resolved;
        }
        return { status: "gap_required", reason };
    }
}

function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

async function readExisting(
    lookup: SupersessionObservationLookup,
    org_id: string,
    package_id: string,
): Promise<{ status: "ok"; rows: readonly ExistingSupersession[] } | { status: "failed"; reason: string }> {
    try {
        return { status: "ok", rows: await lookup({ org_id, package_id }) };
    } catch (e) {
        return { status: "failed", reason: message(e) };
    }
}

/**
 * What the already-persisted claims mean for this append.
 *
 * `null` means "nothing already recorded stands in the way". Anything else is
 * the final answer.
 */
function decideAgainstExisting(
    rows: readonly ExistingSupersession[],
    observationId: string,
): SupersedeIdentityJudgmentResult | null {
    const equivalent = rows.find((r) => r.observation_id === observationId);
    if (equivalent) return { status: "already_superseded", observationId };
    if (rows.length > 0) {
        // A different supersession is already recorded. Appending a second one
        // would make the package's lineage ambiguous, which the projection would
        // then have to report as contradictory history. Refuse instead.
        return { status: "refused", reason: "conflicting_supersession_already_recorded" };
    }
    return null;
}
