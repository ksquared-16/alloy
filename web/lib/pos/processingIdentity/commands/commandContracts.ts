/**
 * Processing Identity Resolution — D0 Registered Identity Command contracts.
 *
 * These typed contracts are the ONLY semantic operations an approved Processing
 * Commit Plan may target. Commands express intent ("create a household") and own
 * the physical mapping to canonical tables internally. Processing never names a
 * physical table, transitional storage (OCM / process_instances), or raw SQL.
 *
 * Frozen invariants (RFC §7.1, §7.13, Decisions A/B/C/G/H/J):
 *  - semantic keys only; physical storage is a handler concern;
 *  - every command is org-scoped and rejects cross-tenant references;
 *  - every command requires a stable operation idempotency key;
 *  - preview never mutates;
 *  - merge is propose-only in V1 (no execution);
 *  - communication side effects are classified asynchronous and never roll back identity.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentityCommandPorts } from "./ports";

/** Atomicity classification (RFC §7.14 / Decision G). */
export type CommandAtomicity =
    | "atomic" // part of the identity group; must commit in one DB transaction
    | "dependent" // sequences after the atomic identity group
    | "asynchronous"; // outbox-driven side effect; failure never rolls back identity

/** Reversibility / compensation classification. */
export type CommandReversibility = "reversible" | "compensatable" | "irreversible";

/** How the command achieves idempotency. */
export type CommandIdempotencyKind =
    | "natural_key" // find-or-create / upsert on a natural key; safe to repeat
    | "operation_key"; // dedup on the caller-provided operation idempotency key

/** Semantic target type a command affects. Never a physical table name. */
export type CommandTargetType =
    | "person"
    | "household"
    | "child"
    | "lead"
    | "participation"
    | "document"
    | "communication_preferences"
    | "merge_candidate"
    | "safeguarding_restriction";

/** Registered, immutable command metadata (RFC §8). */
export type CommandMetadata = {
    key: string;
    version: string;
    requiredPermission: string;
    targetType: CommandTargetType;
    atomicity: CommandAtomicity;
    reversibility: CommandReversibility;
    idempotency: CommandIdempotencyKind;
    /** Downstream events emitted after commit (async outbox). */
    downstreamEvents: string[];
    /** Payload fields carrying PII / sensitive data (kept out of logs + AI prompts). */
    sensitiveFields: string[];
    /** V1 executability. `propose_merge` is registered but NOT executable (Decision H). */
    executableInV1: boolean;
};

/** Server-side execution context. Org + actor are authoritative and server-stamped. */
export type CommandContext = {
    supabase: SupabaseClient;
    orgId: string;
    actorId?: string | null;
    /** Stable per-operation idempotency key (plan_id + op_id at commit time). Required. */
    idempotencyKey: string;
    /**
     * Domain ports. Production wiring provides real adapters over canonical helpers
     * (`createDefaultIdentityCommandPorts`); tests inject fakes. Commands never touch
     * physical tables directly outside these adapters.
     */
    ports: IdentityCommandPorts;
};

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
    code: string;
    message: string;
    severity: ValidationSeverity;
    field?: string;
};

export type ValidationResult = {
    ok: boolean;
    issues: ValidationIssue[];
};

export type CommandPreview = {
    targetType: CommandTargetType;
    /** Existing record reference when the op targets/links an existing record. */
    targetRef?: string | null;
    summary: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    /** Human-readable downstream effect descriptions. */
    effects: string[];
};

/** Reference to a created / affected canonical record (semantic, not physical). */
export type CommandRecordRef = {
    targetType: CommandTargetType;
    recordId: string;
    /** True when this execution created the record; false when it resolved an existing one. */
    created: boolean;
};

export type CommandResult<TResult = Record<string, unknown>> = {
    ok: boolean;
    /** Semantic references to created/affected records. */
    refs: CommandRecordRef[];
    /** Typed result payload (deterministic metadata). */
    result: TResult;
    /** True when a prior equivalent operation was detected (idempotent replay). */
    idempotentReplay: boolean;
    error?: string;
};

export type ProcessingIdentityCommand<
    TPayload = Record<string, unknown>,
    TResult = Record<string, unknown>,
> = {
    readonly metadata: CommandMetadata;
    validate(input: TPayload, context: CommandContext): Promise<ValidationResult> | ValidationResult;
    preview(input: TPayload, context: CommandContext): Promise<CommandPreview> | CommandPreview;
    execute(input: TPayload, context: CommandContext): Promise<CommandResult<TResult>>;
};

export function ok(issues: ValidationIssue[] = []): ValidationResult {
    return { ok: issues.every((i) => i.severity !== "error"), issues };
}

export function invalid(
    code: string,
    message: string,
    field?: string,
): ValidationResult {
    return { ok: false, issues: [{ code, message, severity: "error", field }] };
}
