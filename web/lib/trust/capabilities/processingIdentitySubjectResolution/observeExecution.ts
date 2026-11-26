/**
 * The ONE canonical seam for recording what Processing's executor DID to a
 * governed identity judgment.
 *
 * ## Direction is the whole point
 *
 * ```text
 * authoritative Processing commit result → bounded Trust execution evidence
 * ```
 *
 * Never the reverse. Nothing in this module can invoke a command, approve a
 * plan, or reach the Processing executor: it has no port to do so, and a
 * structural control asserts it imports none. An observation is evidence *after*
 * an execution authority acted; it is never an instruction to act.
 *
 * Phase 0's `planExecutionObservation` maps a *proposed-command* binding, which
 * this slice must not wire as an initiator. The doctrine it encodes is reused —
 * `committed` is the only status that yields `executed`, failures become an
 * `outcome` observation carrying a bounded failure class — but the subject here
 * is a Commit Plan attempt, not a Trust-proposed command.
 *
 * ## Exactly-once, using the primary key the schema already declares
 *
 * The deterministic observation id IS the execution identity, so the primary key
 * refuses an equivalent second append. Three layers, cheapest first — the shape
 * Phase 1.5 and 1.6 proved:
 *  1. **Pre-check** by reading the package's existing execution observations;
 *  2. **Primary-key collision** — the database serializes a concurrent append;
 *  3. **Post-conflict resolve** — the loser re-reads and returns the winner,
 *     which is also how an AMBIGUOUS success is recovered.
 *
 * No second idempotency table, no new constraint, no migration.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import { captureOutcome } from "@/lib/trust/observation/captureOutcome";
import { executionObservationId } from "@/lib/trust/execution/executionObservationIdentity";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { createSupabaseTrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";

/** The minimum a package must expose for execution evidence to be bound to it. */
export type TrustPackageExecutionRef = {
    readonly id: string;
    readonly org_id: string;
    readonly contract_id: string;
};

export type ExecutionPackageLookup = (input: {
    package_id: string;
}) => Promise<TrustPackageExecutionRef | null>;

/** One already-persisted execution observation on a package. */
export type ExistingExecutionObservation = {
    readonly observation_id: string;
    readonly observation_kind: string;
    readonly execution_reference: string | null;
};

export type ExecutionObservationLookup = (input: {
    org_id: string;
    package_id: string;
}) => Promise<readonly ExistingExecutionObservation[]>;

export function createSupabaseExecutionPackageLookup(): ExecutionPackageLookup {
    return async ({ package_id }) => {
        const { data, error } = await createAdminClient()
            .from("trust_decision_packages")
            .select("id, org_id, contract_id")
            .eq("id", package_id)
            .limit(1)
            .maybeSingle();
        if (error) throw new Error(`trust.executionPackageLookup: ${error.message}`);
        return (data as TrustPackageExecutionRef | null) ?? null;
    };
}

export function createSupabaseExecutionObservationLookup(): ExecutionObservationLookup {
    return async ({ org_id, package_id }) => {
        const { data, error } = await createAdminClient()
            .from("trust_decision_observations")
            .select("id, observation_kind, execution_reference")
            .eq("org_id", org_id)
            .eq("package_id", package_id)
            .in("observation_kind", ["executed", "outcome"]);
        if (error) throw new Error(`trust.executionObservationLookup: ${error.message}`);
        return ((data ?? []) as { id: string; observation_kind: string; execution_reference: string | null }[]).map(
            (row) => ({
                observation_id: row.id,
                observation_kind: row.observation_kind,
                execution_reference: row.execution_reference,
            }),
        );
    };
}

/** Keys the execution detail may carry. Anything else is operational content. */
export const ALLOWED_PROCESSING_EXECUTION_DETAIL_KEYS: readonly string[] = [
    "result",
    "failure_class",
    "processing_outcome",
    "subject_operation_outcome",
    "plan_id",
    "plan_version",
    "plan_content_hash",
    "commit_attempt_id",
    "committed_operation_count",
    "contributing_operation_count",
];

const SAFE_TOKEN = /^[A-Za-z0-9_:.-]+$/;
const MAX_TOKEN_LENGTH = 200;

export type ObserveExecutionResult =
    /** This call appended the execution observation. */
    | { readonly status: "observed"; readonly observationId: string }
    /** An equivalent observation already existed. Nothing was appended. */
    | { readonly status: "already_observed"; readonly observationId: string }
    /** Refused on a rule. Deterministic: retrying with the same input refuses identically. */
    | { readonly status: "refused"; readonly reason: string }
    /** Trust could not record it. The caller must persist a durable gap. */
    | { readonly status: "gap_required"; readonly reason: string };

export type ObserveExecutionDeps = {
    readonly repository?: TrustRepository;
    readonly packageLookup?: ExecutionPackageLookup;
    readonly observationLookup?: ExecutionObservationLookup;
};

export type ObserveExecutionInput = {
    readonly org_id: string;
    /** The governed judgment whose real-world outcome this records. */
    readonly package_id: string;
    readonly observation_kind: "executed" | "outcome";
    /** The DURABLE commit-attempt row id. Its existence proves the result persisted. */
    readonly commit_attempt_id: string;
    readonly plan_id: string;
    readonly plan_version: number;
    readonly plan_content_hash: string;
    /**
     * Evidence that an execution authority acted. Never an instruction to act.
     * The authoritative commit-attempt identifier, and nothing derived from it.
     */
    readonly execution_reference: string;
    /** Bounded, capability-owned detail. Every value must be a safe token. */
    readonly detail: Readonly<Record<string, string | number>>;
    /** Authoritative actor, from server context. Never client-supplied. */
    readonly actor_type: "operator" | "system" | "automation";
    readonly actor_id?: string | null;
    readonly channel: string;
    readonly correlation_id: string;
};

/**
 * Append exactly one execution observation, or explain why not.
 *
 * Never throws for an expected condition, and never mutates a Decision Package.
 */
export async function observeProcessingIdentityExecution(
    input: ObserveExecutionInput,
    deps: ObserveExecutionDeps = {},
): Promise<ObserveExecutionResult> {
    const packageLookup = deps.packageLookup ?? createSupabaseExecutionPackageLookup();
    const observationLookup = deps.observationLookup ?? createSupabaseExecutionObservationLookup();
    const repository = deps.repository ?? createSupabaseTrustRepository();

    // ---- 1. bounded detail — fail closed ------------------------------------
    if (!isSafeToken(input.execution_reference)) {
        return { status: "refused", reason: "unsafe_execution_reference" };
    }
    if (!isSafeToken(input.commit_attempt_id)) {
        return { status: "refused", reason: "unsafe_commit_attempt_id" };
    }
    for (const [key, value] of Object.entries(input.detail)) {
        if (!ALLOWED_PROCESSING_EXECUTION_DETAIL_KEYS.includes(key)) {
            return { status: "refused", reason: `detail_key_not_allowed:${key}` };
        }
        if (typeof value === "number") {
            if (!Number.isFinite(value)) return { status: "refused", reason: `unsafe_detail_value:${key}` };
            continue;
        }
        if (!isSafeToken(value)) return { status: "refused", reason: `unsafe_detail_value:${key}` };
    }

    // ---- 2. the package must exist, in this org -----------------------------
    let pkg: TrustPackageExecutionRef | null;
    try {
        // Read unscoped by org so a cross-tenant package is REFUSED as such
        // rather than reported as "not found" — enforcement that never fires is
        // not enforcement.
        pkg = await packageLookup({ package_id: input.package_id });
    } catch (e) {
        // A failed read must NOT fall through to an append: the package's
        // existing execution evidence is unknown, and appending blind risks a
        // contradictory lifecycle.
        return { status: "gap_required", reason: `package_lookup_failed: ${message(e)}` };
    }
    if (!pkg) return { status: "refused", reason: "package_not_found" };
    if (pkg.org_id !== input.org_id) return { status: "refused", reason: "package_org_mismatch" };

    const observationId = executionObservationId({
        org_id: input.org_id,
        package_id: input.package_id,
        plan_id: input.plan_id,
        plan_version: input.plan_version,
        plan_content_hash: input.plan_content_hash,
        commit_attempt_id: input.commit_attempt_id,
        observation_kind: input.observation_kind,
    });

    // ---- 3. pre-check ------------------------------------------------------
    const existing = await readExisting(observationLookup, input.org_id, input.package_id);
    if (existing.status === "failed") {
        return { status: "gap_required", reason: `execution_observation_lookup_failed: ${existing.reason}` };
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
            execution_reference: input.execution_reference,
            detail: input.detail as Record<string, unknown>,
        });
        return { status: "observed", observationId };
    } catch (e) {
        // An append that raced an equivalent append lost on the primary key.
        // Re-read: if the winner landed, both callers converge — which is also
        // how an ambiguous success (the row committed, the response did not
        // arrive) is recovered.
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
    lookup: ExecutionObservationLookup,
    org_id: string,
    package_id: string,
): Promise<
    { status: "ok"; rows: readonly ExistingExecutionObservation[] } | { status: "failed"; reason: string }
> {
    try {
        return { status: "ok", rows: await lookup({ org_id, package_id }) };
    } catch (e) {
        return { status: "failed", reason: message(e) };
    }
}
