/**
 * Command Runtime Facade — typed preparation contract (P1.S1).
 *
 * Read-only. Does not execute Commands. Domain owners retain mutation ownership.
 *
 * @see qa/missions/commands-implementation-plan-msn_188e8bea6fb6de28dd21.md (P1.S1)
 */

import type {
    CapabilityCatalogVisibility,
    CapabilityConfirmationPolicy,
    CapabilityExecutionOwner,
    CapabilityMaturity,
} from "@/lib/platform/commands/capabilityTypes";
import type { CommandFlowStage } from "@/lib/platform/commands/commandFlow";
import type { RequiredSubject } from "@/lib/platform/commands/invocationContext";

/** Who initiated the Command — distinct from operational surface/context. */
export type CommandInvocationOrigin = "operator" | "bos" | "automation" | "api" | "system";

/**
 * Where the Command is offered / invoked from (product: operational context).
 * Reuses existing surface vocabulary without exposing "placement" as product language.
 */
export type CommandOperationalContext =
    | "workspace"
    | "work_unit"
    | "focus_panel"
    | "queue"
    | "current_work"
    | "work_items"
    | "relationship"
    | "bos"
    | "automation"
    | "public_action_link"
    | "configuration_administration"
    | "open";

export type CommandPreparationIntent = "prepare" | "preview_intent";

/**
 * Server-owned actor context. Client must not supply authoritative operator identity;
 * callers pass values already resolved server-side.
 */
export type CommandActorContext = {
    orgId: string;
    userId?: string | null;
};

export type CommandSubjectRef = {
    entityType: string;
    entityId: string;
};

export type CommandInvocationRequest = {
    /** Requested Command / capability key (may be an alias). */
    commandKey: string;
    origin: CommandInvocationOrigin;
    operationalContext: CommandOperationalContext;
    /** Physical surface string when known (maps via existing logical helpers). */
    surface?: string | null;
    workUnitId?: string | null;
    processKey?: string | null;
    stageKey?: string | null;
    /** Authoritative subject from the surface (Focus Panel / queue row). */
    providedSubject?: CommandSubjectRef | null;
    /** Suggested default — never authoritative. */
    suggestedSubject?: CommandSubjectRef | null;
    inputValues?: Record<string, unknown>;
    preparationIntent?: CommandPreparationIntent;
    /** Already-authenticated actor; never trust raw client identity. */
    actor?: CommandActorContext | null;
};

export type CommandSubjectContract =
    | { kind: "none" }
    | { kind: "one"; requiredSubject: RequiredSubject; mayResolveFromCurrentRecord: boolean };

export type CommandSubjectState =
    | { status: "none_required" }
    | { status: "resolved"; subjectId: string; entityType: string }
    | {
          status: "suggested";
          suggestedSubjectId: string;
          requiredSubject: RequiredSubject;
          authoritative: false;
      }
    | { status: "missing"; requiredSubject: RequiredSubject }
    | {
          status: "incompatible";
          requiredSubject: RequiredSubject;
          providedType: string;
          message: string;
      };

export type CommandEligibilityState =
    | { status: "not_evaluated" }
    | { status: "delegated"; owner: CapabilityExecutionOwner }
    | { status: "blocked"; blockers: readonly { code: string; message: string }[] }
    | { status: "ready" };

export type CommandRequiredInputState =
    | { status: "not_evaluated" }
    | { status: "none_known" }
    | { status: "delegated"; owner: CapabilityExecutionOwner }
    | { status: "missing"; keys: readonly string[] };

/** Lifecycle stages for preparation; includes terminal unavailable / failure markers. */
export type CommandRuntimeLifecycleStage = CommandFlowStage | "unavailable" | "failure";

export type CommandExecutionDestination = {
    owner: CapabilityExecutionOwner;
    /** Human-readable owner label for diagnostics (not operator copy). */
    label: string;
    /** True when a later slice may invoke execute through an adapter. */
    executableViaFacadeLater: boolean;
};

export type CommandRuntimeDiagnostic = {
    code: string;
    message: string;
};

/**
 * Operator-safe projection: never include stack traces, payload dumps, or raw enums
 * beyond stable public strings.
 */
export type CommandOperatorSafeProjection = {
    label: string;
    statusMessage: string;
    canContinue: boolean;
};

export type CommandSnapshot = {
    requestedKey: string;
    canonicalCapabilityKey: string;
    maturity: CapabilityMaturity;
    catalogVisibility: CapabilityCatalogVisibility;
    executionOwner: CapabilityExecutionOwner;
    origin: CommandInvocationOrigin;
    operationalContext: CommandOperationalContext;
    subjectContract: CommandSubjectContract;
    subjectState: CommandSubjectState;
    requiredInputState: CommandRequiredInputState;
    eligibilityState: CommandEligibilityState;
    warnings: readonly { code: string; message: string }[];
    blockers: readonly { code: string; message: string }[];
    confirmationPolicy: CapabilityConfirmationPolicy;
    supportsPreview: boolean;
    currentLifecycleStage: CommandRuntimeLifecycleStage;
    nextLifecycleStage: CommandRuntimeLifecycleStage | null;
    executionDestination: CommandExecutionDestination;
    /** True when preparation asserts the Command is not runnable. */
    runnable: boolean;
    /**
     * Authorization is never implied by availability/catalog visibility.
     * Always false in P1.S1 preparation (no auth evaluation yet).
     */
    authorizationEvaluated: false;
    authorizationGranted: null;
    operatorSafe: CommandOperatorSafeProjection;
    /** Server-log diagnostics — strip before any operator-facing wire format. */
    diagnostics: readonly CommandRuntimeDiagnostic[];
};

export type PrepareCommandInvocationResult =
    | { ok: true; snapshot: CommandSnapshot }
    | { ok: false; snapshot: CommandSnapshot; reason: string };
