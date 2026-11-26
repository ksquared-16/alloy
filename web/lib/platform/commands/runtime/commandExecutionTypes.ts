/**
 * Command Runtime execution contract types (P1.S2 / P2.S1).
 * Server-only consumers; preparation types remain in commandRuntimeTypes.ts.
 */

import type { ActionResult } from "@/lib/adminV2/actions/actionTypes";
import type { RelationshipActionExecutionResult } from "@/lib/admin/relationship/relationshipActionContract";
import type { MutationResult } from "@/lib/mutations/types";
import type { CapabilityExecutionOwner } from "@/lib/platform/commands/capabilityTypes";
import type { CommandImpactPreview } from "@/lib/platform/commands/runtime/destructive/commandImpactPreviewTypes";
import type { MakePrimaryReplacementResult } from "@/lib/platform/commands/runtime/adapters/primaryContactReplacementAdapter";
import type { DeleteLeadReplacementResult } from "@/lib/platform/commands/runtime/adapters/deleteLeadAdapter";
import type { CancelTourResult } from "@/lib/platform/commands/runtime/adapters/cancelTourAdapter";
import type { TourRescheduleResult } from "@/lib/platform/commands/runtime/adapters/tourExecutionAdapter";
import type { TourTerminalResult } from "@/lib/platform/commands/runtime/adapters/tourTerminalTransitionAdapter";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";

export type CommandExecutionMode = "preview" | "execute";

export type CommandExecutionConfirmation = {
    confirmed: boolean;
    confirmationValue?: string;
};

/**
 * Server-owned subject for domain mapping (from authenticated route body).
 * Distinct from prepare-time suggested subjects — this is the API contract entity.
 */
export type CommandExecutionSubject = {
    entityType: string;
    entityId: string;
};

/**
 * Execution request. Actor/org must come from {@link ExecuteCommandInvocationServerContext};
 * any `invocation.actor` is ignored.
 */
export type ExecuteCommandInvocationRequest = {
    /** Client-safe invocation fields (key, origin, context, inputs). Actor ignored. */
    invocation: CommandInvocationRequest;
    mode: CommandExecutionMode;
    confirmation?: CommandExecutionConfirmation;
    /** Correlated destructive/replacement preview token (required for allowlisted commits). */
    previewToken?: string;
    /** Optional client/server correlation hint; server generates when absent. */
    idempotencyKey?: string;
    invocationId?: string;
    /** Authoritative entity for domain mapping (route body). */
    executionSubject: CommandExecutionSubject;
    /** Optional department/work-unit for Mutation Runtime context. */
    departmentId?: string | null;
    workUnitId?: string | null;
};

export type ExecuteCommandInvocationServerContext = {
    orgId: string;
    userId?: string | null;
    /** Portal compatibility role for audit (admin|ops). */
    actorRole?: string | null;
    accessScope?: import("@/lib/admin/accessScope").AdminAccessScopeDimensions | null;
    supabase: import("@supabase/supabase-js").SupabaseClient;
};

export type CommandExecutionFailureStatus =
    | "unavailable"
    | "blocked"
    | "invalid"
    | "confirmation_required"
    | "unauthorized"
    | "failed"
    | "unsupported_owner";

export type CommandExecutionResult =
    | {
          ok: true;
          status: "previewed" | "committed";
          canonicalCapabilityKey: string;
          executionOwner:
              | "registered_action"
              | "mutation_runtime"
              | "relationship_runtime"
              | "admin_action"
              | "tour_domain";
          invocationId: string;
          /** Preserved RegisteredAction result for route compatibility. */
          actionResult?: ActionResult & { ok: true };
          /** Preserved Mutation Runtime result for route compatibility. */
          mutationResult?: MutationResult;
          /** Preserved Relationship Framework result for route compatibility. */
          relationshipResult?: RelationshipActionExecutionResult;
          /** Replacement Command result (P4.S2 make_primary_contact). */
          replacementResult?: MakePrimaryReplacementResult;
          /** Destructive delete result (P4.S3 delete_lead). */
          deleteLeadResult?: DeleteLeadReplacementResult;
          /** Destructive cancel result (P5.S2 cancel_tour). */
          cancelTourResult?: CancelTourResult;
          /** Tour-domain result (P5.S1 reschedule / P5.S3 terminal). */
          tourResult?: TourRescheduleResult | TourTerminalResult;
          /** Lightweight non-destructive preview summary (Tour P5.S1). */
          tourPreview?: {
              kind: "tour";
              summary: Record<string, unknown>;
          };
          /** Operator-safe impact preview (destructive/replacement). */
          impactPreview?: CommandImpactPreview;
          diagnostics: readonly { code: string; message: string }[];
      }
    | {
          ok: false;
          status: CommandExecutionFailureStatus;
          canonicalCapabilityKey?: string;
          executionOwner?: CapabilityExecutionOwner;
          invocationId: string;
          error: {
              code: string;
              operatorMessage: string;
          };
          /** When adapter delegated and RegisteredAction returned structured failure. */
          actionResult?: ActionResult & { ok: false };
          /** When adapter delegated and Mutation Runtime returned blocked. */
          mutationResult?: Extract<MutationResult, { status: "blocked" }>;
          impactPreview?: CommandImpactPreview;
          diagnostics: readonly { code: string; message: string }[];
          /** True once a domain executor was invoked — forbids route fallback. */
          delegated: boolean;
      };

/** Request-scoped delegation guard — exactly-once per invocation, not distributed idempotency. */
export type InvocationDelegationGuard = {
    readonly invocationId: string;
    hasDelegated(): boolean;
    markDelegated(): void;
};
