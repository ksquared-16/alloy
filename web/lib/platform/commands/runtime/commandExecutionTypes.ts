/**
 * Command Runtime execution contract types (P1.S2).
 * Server-only consumers; preparation types remain in commandRuntimeTypes.ts.
 */

import type { ActionResult } from "@/lib/adminV2/actions/actionTypes";
import type { CapabilityExecutionOwner } from "@/lib/platform/commands/capabilityTypes";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";

export type CommandExecutionMode = "preview" | "execute";

export type CommandExecutionConfirmation = {
    confirmed: boolean;
    confirmationValue?: string;
};

/**
 * Server-owned subject for RegisteredAction mapping (from authenticated route body).
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
    /** Optional client/server correlation hint; server generates when absent. */
    idempotencyKey?: string;
    invocationId?: string;
    /** Authoritative entity for RegisteredAction (route body). */
    executionSubject: CommandExecutionSubject;
};

export type ExecuteCommandInvocationServerContext = {
    orgId: string;
    userId?: string | null;
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
          executionOwner: "registered_action";
          invocationId: string;
          /** Preserved RegisteredAction result for route compatibility. */
          actionResult: ActionResult & { ok: true };
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
          diagnostics: readonly { code: string; message: string }[];
          /** True once runRegisteredAction was invoked — forbids route fallback. */
          delegated: boolean;
      };

/** Request-scoped delegation guard — exactly-once per invocation, not distributed idempotency. */
export type InvocationDelegationGuard = {
    readonly invocationId: string;
    hasDelegated(): boolean;
    markDelegated(): void;
};
