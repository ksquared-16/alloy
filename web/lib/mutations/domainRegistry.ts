/**
 * Mutation Domain Registry — maps command keys to domain handlers.
 *
 * Each domain handler owns the domain-specific logic for Phase 1 (Resolve)
 * and Phase 4 (Commit). Phase 2 (Evaluate) is generic but uses the handler's
 * entityType for status-definition and transition-rule lookups.
 *
 * To add a new domain:
 *   1. Create web/lib/mutations/domains/<domainName>.ts
 *   2. Export a DomainHandler
 *   3. Register it in COMMAND_DOMAIN_MAP below
 *
 * Doctrine: docs/platform/modules/operational-mutation-platform.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    MutationDomain,
    MutationDomainKey,
    DecisionIntent,
    EvaluationWarning,
    MutationResult,
} from "@/lib/mutations/types";

// ─── Domain Handler interface ────────────────────────────────────────────────

export type ResolvedState = {
    /** The domain this resolution belongs to. */
    domain: MutationDomain;
    /** entityType string used by assertAllowedStatusKey + validateStatusTransition. */
    entityType: string;
    /** Current status key on the subject record. */
    currentState: string;
    /** Status keys available as transition targets (excludes current). */
    availableTargets: string[];
};

export type DomainResolveContext = {
    supabase: SupabaseClient;
    orgId: string;
};

export type DomainCommitContext = {
    supabase: SupabaseClient;
    orgId: string;
    departmentId?: string | null;
    workUnitId?: string | null;
};

export type DomainHandler = {
    domain: MutationDomain;
    /** entity_type string passed to status definition and transition rule checks. */
    entityType: string;
    /**
     * Phase 1: load current state and available targets for this domain's subject.
     * Must ONLY read from the domain's canonical table and field.
     */
    resolve: (
        ctx: DomainResolveContext,
        intent: DecisionIntent
    ) => Promise<{ currentState: string; availableTargets: string[] } | { error: string }>;
    /**
     * Optional Phase 2 extension: domain-specific readiness/required-information check.
     * Called after generic evaluation passes. Returns readiness gaps as warning messages.
     * A non-empty array blocks the mutation and is surfaced in the command panel UI.
     */
    evaluateReadiness?: (
        ctx: DomainResolveContext,
        intent: DecisionIntent,
        resolved: ResolvedState
    ) => Promise<EvaluationWarning[]>;
    /**
     * Phase 4: atomically commit the state change to the domain's canonical field
     * and write a mutation_events outbox record.
     * Must NEVER write to any other domain's canonical field.
     */
    commit: (
        ctx: DomainCommitContext,
        intent: DecisionIntent,
        resolved: ResolvedState,
        warnings: EvaluationWarning[]
    ) => Promise<MutationResult>;
};

// ─── Domain registrations ─────────────────────────────────────────────────────

import { leadStatusHandler } from "@/lib/mutations/domains/leadStatus";
import { enrollmentStatusHandler } from "@/lib/mutations/domains/enrollmentStatus";

const COMMAND_DOMAIN_MAP: Record<string, DomainHandler> = {
    update_lead_status: leadStatusHandler,
    update_child_enrollment_status: enrollmentStatusHandler,
};

// ─── Registry lookup ──────────────────────────────────────────────────────────

export function getDomainHandlerForCommand(commandKey: string): DomainHandler | null {
    return COMMAND_DOMAIN_MAP[commandKey] ?? null;
}

/** Convenience: just the MutationDomain (for callers that only need domain metadata). */
export function resolveDomainForCommand(commandKey: string): MutationDomain | null {
    return COMMAND_DOMAIN_MAP[commandKey]?.domain ?? null;
}

/** All registered command keys. Used for validation and documentation. */
export function registeredCommandKeys(): string[] {
    return Object.keys(COMMAND_DOMAIN_MAP);
}

export type { MutationDomain, MutationDomainKey };
