/**
 * Canonical Action Runtime contract (Phase 2).
 *
 * An **Action** is a configured invocation of a *registered capability*. Config
 * (action_definitions / action_placements) controls presentation and constraints
 * (label, description, placement, order, visibility, process/entity scope,
 * required-input hints, confirmation copy). Config never owns executable behavior.
 *
 * Every executable action maps to a {@link RegisteredAction} whose handlers are
 * code-owned and server-authoritative. Manual UI and BOS-confirmed proposals
 * execute through the *same* registry path.
 *
 * @see docs/sprints/06_2026/actions_runtime_audit.md
 * @see docs/platform/modules/actions-and-workflows.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

export type ActionEntityType =
    | "opportunity"
    | "person"
    | "child"
    | "job"
    | "schedule"
    | "opportunity_customer_member";

/** Where the action runtime was invoked from. The executor path is identical for all. */
export type ActionInvocationOrigin = "manual" | "bos" | "workflow";

export type ActionExecutionMode = "preview" | "execute";

/** Server-authoritative runtime context (org scope, actor, data scope). */
export type ActionRuntimeContext = {
    orgId: string;
    userId?: string | null;
    accessScope?: AdminAccessScopeDimensions | null;
};

export type ActionInvocationContext = {
    surface?: string | null;
    department_id?: string | null;
    work_unit_id?: string | null;
    section_key?: string | null;
    /** Business process key when known (e.g. "enrollment"). Drives process-scoped eligibility. */
    process_key?: string | null;
    origin?: ActionInvocationOrigin;
};

export type ActionInvocation = {
    actionKey: string;
    entityType: string;
    /** May be empty for create-style actions (e.g. create_lead). */
    entityId: string;
    context?: ActionInvocationContext;
    payload?: Record<string, unknown>;
};

export type ActionBlocker = {
    code: string;
    message: string;
    /** Field/requirement key when the blocker is a missing required input. */
    field?: string | null;
};

export type ActionRequiredInputType =
    | "text"
    | "email"
    | "phone"
    | "select"
    | "status"
    | "textarea"
    | "boolean"
    | "date";

export type ActionRequiredInput = {
    key: string;
    label: string;
    type: ActionRequiredInputType;
    required: boolean;
    options?: { value: string; label: string }[];
    hint?: string | null;
    /** True when the requirement originates from config (presentation hint), not a code invariant. */
    fromConfig?: boolean;
};

export type ActionTransitionOption = { key: string; label: string };

/** Result of the read-only eligibility resolver. */
export type ActionEligibility = {
    eligible: boolean;
    blockers: ActionBlocker[];
    /** For status-like actions: destinations available from the current state. */
    availableTransitions: ActionTransitionOption[];
    /** Inputs the operator must supply before execute can succeed. */
    requiredInputs: ActionRequiredInput[];
};

/** Read-only dry-run description of what execute would do. */
export type ActionPreview = {
    summary: string;
    changes: string[];
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
};

export type ActionResultOk = {
    ok: true;
    correlationId: string;
    result: {
        actionKey: string;
        entityType: string;
        entityId: string;
        /** Newly created / primary affected record id (e.g. created opportunity). */
        affectedId: string | null;
        detail: Record<string, unknown>;
    };
};

export type ActionResultError = {
    ok: false;
    correlationId: string;
    status: number;
    error: string;
    blockers?: ActionBlocker[];
    /** Pass-through of existing requirement payloads so UI panels can render. */
    completionRequirements?: unknown;
    actionPreflight?: unknown;
};

export type ActionResult = ActionResultOk | ActionResultError;

export type ActionAuditMetadata = {
    /** workflow_events.event_type emitted on success (status side-effects may add more). */
    eventType: string;
    category:
        | "status_lifecycle"
        | "record"
        | "relationship"
        | "communication"
        | "workflow"
        | "bos_native";
    /** Whether this action mutates operational truth (drives confirmation + audit expectations). */
    mutates: boolean;
};

export type PayloadValidationResult =
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; blockers: ActionBlocker[] };

/** Dependencies passed to every registered-action handler. */
export type ActionHandlerDeps = {
    supabase: SupabaseClient;
    ctx: ActionRuntimeContext;
    invocation: ActionInvocation;
    /** Validated + normalized payload (output of {@link RegisteredAction.validatePayload}). */
    payload: Record<string, unknown>;
};

/**
 * A registered, executable action capability. This is the single source of truth
 * for *what an action is and how it runs*. Mutations themselves are delegated to
 * existing invariant-owning server modules so we never fork business logic.
 */
export type RegisteredAction = {
    actionKey: string;
    defaultLabel: string;
    description: string;
    supportedEntityTypes: readonly ActionEntityType[];
    /** Empty = applies to all business processes. */
    supportedProcessKeys: readonly string[];
    requiredContext: {
        requiresEntityId: boolean;
        requiresOpportunity: boolean;
        requiresCustomer: boolean;
    };
    audit: ActionAuditMetadata;
    confirmationPolicy: "required" | "none" | "destructive";
    bosProposalSupport: boolean;
    /** Code-owned payload schema: validate + normalize incoming payload. */
    validatePayload: (payload: Record<string, unknown> | undefined) => PayloadValidationResult;
    /** Resolve eligibility, blockers, available transitions, and required inputs (read-only). */
    resolveEligibility: (deps: ActionHandlerDeps) => Promise<ActionEligibility>;
    /** Build a dry-run preview (read-only). */
    buildPreview: (deps: ActionHandlerDeps) => Promise<ActionPreview>;
    /** Execute the action. Server-authoritative; delegates to invariant-owning code. */
    execute: (deps: ActionHandlerDeps) => Promise<ActionResult>;
};

export function normalizeActionEntityType(entityType: string): string {
    const raw = (entityType ?? "").trim().toLowerCase();
    if (raw === "opportunities") return "opportunity";
    if (raw === "schedules") return "schedule";
    if (raw === "jobs") return "job";
    if (raw === "children") return "child";
    if (raw === "opportunity_customer_members") return "opportunity_customer_member";
    return raw;
}

/** Narrow the invocation context to the shape existing executor helpers accept. */
export function toDelegateContext(context?: ActionInvocationContext): {
    surface?: string;
    department_id?: string | null;
    work_unit_id?: string | null;
    section_key?: string | null;
} {
    if (!context) return {};
    return {
        surface: context.surface ?? undefined,
        department_id: context.department_id ?? null,
        work_unit_id: context.work_unit_id ?? null,
        section_key: context.section_key ?? null,
    };
}

export function eligible(
    partial: Partial<ActionEligibility> & { eligible: boolean }
): ActionEligibility {
    return {
        eligible: partial.eligible,
        blockers: partial.blockers ?? [],
        availableTransitions: partial.availableTransitions ?? [],
        requiredInputs: partial.requiredInputs ?? [],
    };
}
