/**
 * prepareCommandInvocation — read-only Command Runtime Facade (P1.S1).
 *
 * Side-effect free: does not call Domain Executors, RegisteredAction.execute,
 * eligibility resolvers, or preview builders.
 */

import {
    canonicalCapabilityKeyForAlias,
    getPlatformCapability,
    tryResolvePlatformCapability,
} from "@/lib/platform/commands/capabilityRegistry";
import type {
    CapabilityConfirmationPolicy,
    CapabilityExecutionOwner,
    PlatformCapabilityDefinition,
} from "@/lib/platform/commands/capabilityTypes";
import {
    logicalPlacementForPhysicalSurface,
    resolveCommandSubject,
    resolveContextResolution,
    type RequiredSubject,
} from "@/lib/platform/commands/invocationContext";
import { prepareRegisteredActionMeta } from "@/lib/platform/commands/runtime/adapters/registeredActionPreparationAdapter";
import { assertCommandSnapshotInvariants } from "@/lib/platform/commands/runtime/commandRuntimeInvariants";
import {
    getDestructiveCommandPolicy,
    toDestructivePreparationState,
} from "@/lib/platform/commands/runtime/destructive/destructivePolicyRegistry";
import type {
    CommandExecutionDestination,
    CommandInvocationOrigin,
    CommandInvocationRequest,
    CommandOperationalContext,
    CommandRequiredInputState,
    CommandRuntimeLifecycleStage,
    CommandSnapshot,
    CommandSubjectContract,
    CommandSubjectState,
    PrepareCommandInvocationResult,
} from "@/lib/platform/commands/runtime/commandRuntimeTypes";

const OWNER_LABELS: Record<CapabilityExecutionOwner, string> = {
    registered_action: "Registered Action",
    admin_action: "Admin Action compatibility",
    mutation_runtime: "Mutation Runtime",
    relationship_runtime: "Relationship Runtime",
    tour_domain: "Tour domain",
    processing_identity: "Processing Identity",
    scheduling_domain: "Scheduling domain",
    navigation: "Navigation",
    workflow: "Workflow",
    configuration_runtime: "Configuration Runtime",
    none: "None/unavailable",
};

function destinationFor(owner: CapabilityExecutionOwner): CommandExecutionDestination {
    const executableViaFacadeLater =
        owner !== "none" &&
        owner !== "navigation" &&
        owner !== "workflow" &&
        owner !== "configuration_runtime";
    return {
        owner,
        label: OWNER_LABELS[owner],
        executableViaFacadeLater,
    };
}

function mapSurfaceToOperationalContext(
    request: CommandInvocationRequest
): CommandOperationalContext {
    if (request.operationalContext) return request.operationalContext;
    const surface = (request.surface ?? "").trim();
    if (!surface) return "open";
    const logical = logicalPlacementForPhysicalSurface({
        surface,
        workUnitId: request.workUnitId,
    });
    switch (logical) {
        case "focus_panel_manage":
            return "focus_panel";
        case "queue_row_menu":
            return "queue";
        case "bos_recommendations":
            return "bos";
        case "work_unit_actions":
            return request.workUnitId ? "work_unit" : "workspace";
        default:
            return "open";
    }
}

function mapLogicalPlacement(request: CommandInvocationRequest) {
    const surface = (request.surface ?? "").trim();
    if (surface) {
        return logicalPlacementForPhysicalSurface({
            surface,
            workUnitId: request.workUnitId,
        });
    }
    switch (request.operationalContext) {
        case "focus_panel":
        case "current_work":
            return "focus_panel_manage" as const;
        case "queue":
            return "queue_row_menu" as const;
        case "bos":
            return "bos_recommendations" as const;
        case "work_unit":
        case "workspace":
        case "work_items":
            return "work_unit_actions" as const;
        default:
            return "work_unit_actions" as const;
    }
}

function subjectTypeCompatible(required: RequiredSubject, providedType: string): boolean {
    const t = providedType.trim().toLowerCase();
    switch (required) {
        case "none":
            return true;
        case "opportunity":
            return t === "opportunity" || t === "opportunities";
        case "person":
            return t === "person" || t === "people";
        case "child":
            return t === "child" || t === "children";
        case "case":
            return t === "case" || t === "opportunity";
        case "multiple_opportunities":
            return t === "opportunity" || t === "opportunities";
        default:
            return false;
    }
}

function requiredSubjectFromCapability(capability: PlatformCapabilityDefinition): RequiredSubject {
    const subjects = capability.supportedSubjects;
    if (subjects.includes("none") || subjects.length === 0) return "none";
    if (subjects.includes("opportunity")) return "opportunity";
    if (subjects.includes("person")) return "person";
    if (subjects.includes("child")) return "child";
    if (subjects.includes("opportunity_customer_member")) return "child";
    if (subjects.includes("schedule")) return "opportunity";
    return "opportunity";
}

function buildSubjectState(input: {
    requiredSubject: RequiredSubject;
    request: CommandInvocationRequest;
    mayResolveFromCurrentRecord: boolean;
}): CommandSubjectState {
    const { requiredSubject, request, mayResolveFromCurrentRecord } = input;
    if (requiredSubject === "none") return { status: "none_required" };

    const provided = request.providedSubject;
    const suggested = request.suggestedSubject;

    if (provided?.entityId?.trim()) {
        if (!subjectTypeCompatible(requiredSubject, provided.entityType)) {
            return {
                status: "incompatible",
                requiredSubject,
                providedType: provided.entityType,
                message: `Subject type "${provided.entityType}" is incompatible with required ${requiredSubject}.`,
            };
        }
        if (mayResolveFromCurrentRecord) {
            return {
                status: "resolved",
                subjectId: provided.entityId.trim(),
                entityType: provided.entityType.trim(),
            };
        }
        // Selection contexts: provided id is still only suggested until operator confirms selection.
        return {
            status: "suggested",
            suggestedSubjectId: provided.entityId.trim(),
            requiredSubject,
            authoritative: false,
        };
    }

    if (suggested?.entityId?.trim()) {
        return {
            status: "suggested",
            suggestedSubjectId: suggested.entityId.trim(),
            requiredSubject,
            authoritative: false,
        };
    }

    return { status: "missing", requiredSubject };
}

function confirmationBlocksAdvance(
    policy: CapabilityConfirmationPolicy,
    origin: CommandInvocationOrigin
): boolean {
    void origin; // origin must not weaken policy
    return policy === "confirm" || policy === "strong_confirm" || policy === "typed_confirm";
}

function computeLifecycle(input: {
    capability: PlatformCapabilityDefinition;
    subjectState: CommandSubjectState;
    runnable: boolean;
}): { current: CommandRuntimeLifecycleStage; next: CommandRuntimeLifecycleStage | null } {
    const { capability, subjectState, runnable } = input;

    if (!runnable || capability.maturity === "unavailable" || capability.maturity === "placeholder") {
        return { current: "unavailable", next: null };
    }

    if (capability.maturity === "navigation_only") {
        return { current: "resolve_context", next: "success" };
    }

    if (subjectState.status === "missing" || subjectState.status === "suggested") {
        return { current: "resolve_subject", next: "resolve_subject" };
    }
    if (subjectState.status === "incompatible") {
        return { current: "resolve_constraints", next: null };
    }

    // Required inputs: RegisteredAction knows schema exists but we do not evaluate live.
    if (capability.executionOwner === "registered_action") {
        const afterInputs: CommandRuntimeLifecycleStage = capability.supportsPreview
            ? "preview"
            : confirmationBlocksAdvance(capability.confirmationPolicy, "operator")
              ? "confirm"
              : "execute";
        return { current: "resolve_required_inputs", next: afterInputs };
    }

    // Adapted domains: delegated — stop before claiming preview readiness falsely.
    if (capability.supportsPreview) {
        return { current: "resolve_constraints", next: "preview" };
    }
    if (confirmationBlocksAdvance(capability.confirmationPolicy, "operator")) {
        return { current: "resolve_constraints", next: "confirm" };
    }
    return { current: "resolve_constraints", next: "execute" };
}

function operatorMessage(snapshotParts: {
    label: string;
    runnable: boolean;
    subjectState: CommandSubjectState;
    maturity: string;
}): { statusMessage: string; canContinue: boolean } {
    if (!snapshotParts.runnable) {
        return {
            statusMessage: `"${snapshotParts.label}" is not available.`,
            canContinue: false,
        };
    }
    if (snapshotParts.subjectState.status === "missing") {
        return { statusMessage: "Choose a record to continue.", canContinue: true };
    }
    if (snapshotParts.subjectState.status === "suggested") {
        return {
            statusMessage: "Confirm the suggested record before continuing.",
            canContinue: true,
        };
    }
    if (snapshotParts.subjectState.status === "incompatible") {
        return {
            statusMessage: snapshotParts.subjectState.message,
            canContinue: false,
        };
    }
    return { statusMessage: `"${snapshotParts.label}" is ready to continue.`, canContinue: true };
}

function buildSnapshot(input: {
    request: CommandInvocationRequest;
    capability: PlatformCapabilityDefinition;
    requestedKey: string;
}): CommandSnapshot {
    const { request, capability, requestedKey } = input;
    const registeredMeta =
        capability.executionOwner === "registered_action"
            ? prepareRegisteredActionMeta(capability)
            : null;

    const requiredSubject =
        registeredMeta?.requiredSubject ?? requiredSubjectFromCapability(capability);
    const placement = mapLogicalPlacement(request);
    const contextResolution = resolveContextResolution({ placement, requiredSubject });
    const mayResolveFromCurrentRecord = contextResolution === "current_record";

    // Keep shared subject helper in sync for registered paths (suggested never authoritative).
    if (registeredMeta) {
        resolveCommandSubject({
            contextResolution,
            requiredSubject,
            inheritedSubjectId: request.providedSubject?.entityId,
            suggestedSubjectId: request.suggestedSubject?.entityId,
        });
    }

    const subjectContract: CommandSubjectContract =
        requiredSubject === "none"
            ? { kind: "none" }
            : {
                  kind: "one",
                  requiredSubject,
                  mayResolveFromCurrentRecord,
              };

    const subjectState = buildSubjectState({
        requiredSubject,
        request,
        mayResolveFromCurrentRecord,
    });

    const runnable =
        capability.maturity !== "unavailable" &&
        capability.maturity !== "placeholder" &&
        capability.maturity !== "workflow_only" &&
        capability.maturity !== "configuration_maintenance" &&
        !(capability.executionOwner === "registered_action" && !registeredMeta);

    const blockers: { code: string; message: string }[] = [];
    if (subjectState.status === "incompatible") {
        blockers.push({ code: "subject_incompatible", message: subjectState.message });
    }
    if (!runnable) {
        blockers.push({
            code: "capability_not_runnable",
            message: `Capability is ${capability.maturity}.`,
        });
    }
    if (capability.executionOwner === "registered_action" && !registeredMeta) {
        blockers.push({
            code: "registered_handler_missing",
            message: "RegisteredAction handler is missing.",
        });
    }

    const requiredInputState: CommandRequiredInputState =
        capability.executionOwner === "registered_action"
            ? { status: "delegated", owner: "registered_action" }
            : capability.maturity === "adapted"
              ? { status: "delegated", owner: capability.executionOwner }
              : { status: "none_known" };

    const eligibilityState =
        !runnable
            ? { status: "blocked" as const, blockers }
            : capability.executionOwner === "registered_action"
              ? { status: "delegated" as const, owner: "registered_action" as const }
              : capability.maturity === "adapted"
                ? { status: "delegated" as const, owner: capability.executionOwner }
                : { status: "not_evaluated" as const };

    const { current, next } = computeLifecycle({
        capability,
        subjectState,
        runnable,
    });

    // BOS cannot weaken confirmation: if policy requires confirm, next must not skip to execute
    // when claiming preparation complete for mutation owners.
    let nextLifecycleStage = next;
    if (
        runnable &&
        request.origin === "bos" &&
        confirmationBlocksAdvance(capability.confirmationPolicy, request.origin) &&
        nextLifecycleStage === "execute"
    ) {
        nextLifecycleStage = "confirm";
    }

    const label = registeredMeta?.defaultLabel ?? capability.operatorLabel;
    const destructivePolicy = getDestructiveCommandPolicy(capability.canonicalCommandKey);
    const destructivePreparation = destructivePolicy
        ? toDestructivePreparationState(destructivePolicy)
        : null;

    // Destructive policy confirmation cannot be weaker than capability — use the stronger of the two.
    const confirmationPolicy: CapabilityConfirmationPolicy = destructivePolicy
        ? destructivePolicy.confirmation
        : capability.confirmationPolicy;

    const supportsPreview =
        Boolean(destructivePolicy?.requiresPreview) ||
        capability.supportsPreview ||
        Boolean(registeredMeta?.supportsPreview);

    const op = operatorMessage({
        label,
        runnable,
        subjectState,
        maturity: capability.maturity,
    });

    const diagnostics = [
        {
            code: "preparation_only",
            message: "prepareCommandInvocation is side-effect free; no execute path.",
        },
        {
            code: "execution_destination",
            message: `owner=${capability.executionOwner}`,
        },
        ...(destructivePreparation
            ? [
                  {
                      code: "destructive_preparation",
                      message: `impact=${destructivePreparation.impactClass} commit_enabled=false`,
                  },
              ]
            : []),
    ];

    // Recompute next when destructive requires preview (cannot skip to execute).
    if (
        runnable &&
        destructivePreparation &&
        (nextLifecycleStage === "execute" || nextLifecycleStage === "confirm")
    ) {
        if (supportsPreview && nextLifecycleStage === "execute") {
            nextLifecycleStage = "preview";
        } else if (
            confirmationBlocksAdvance(confirmationPolicy, request.origin) &&
            nextLifecycleStage === "execute"
        ) {
            nextLifecycleStage = "confirm";
        }
    }

    // BOS / automation / api / system cannot weaken destructive confirmation.
    if (
        runnable &&
        destructivePreparation &&
        request.origin !== "operator" &&
        nextLifecycleStage === "execute"
    ) {
        nextLifecycleStage = supportsPreview ? "preview" : "confirm";
    }

    const snapshot: CommandSnapshot = {
        requestedKey,
        canonicalCapabilityKey: capability.canonicalCommandKey,
        maturity: capability.maturity,
        catalogVisibility: capability.catalogVisibility,
        executionOwner: capability.executionOwner,
        origin: request.origin,
        operationalContext: mapSurfaceToOperationalContext(request),
        subjectContract,
        subjectState,
        requiredInputState,
        eligibilityState,
        warnings: [],
        blockers,
        confirmationPolicy,
        supportsPreview,
        destructivePreparation,
        currentLifecycleStage: current,
        nextLifecycleStage,
        executionDestination: destinationFor(capability.executionOwner),
        runnable,
        authorizationEvaluated: false,
        authorizationGranted: null,
        operatorSafe: {
            label,
            statusMessage: destructivePreparation
                ? destructivePreparation.operatorSummary
                : op.statusMessage,
            canContinue: op.canContinue,
        },
        diagnostics,
    };

    assertCommandSnapshotInvariants(snapshot, capability);
    return snapshot;
}

/**
 * Prepare a Command invocation snapshot. Never executes.
 */
export function prepareCommandInvocation(
    request: CommandInvocationRequest
): PrepareCommandInvocationResult {
    const requestedKey = (request.commandKey ?? "").trim();
    if (!requestedKey) {
        const emptyCap = null;
        const snapshot = unavailableSnapshot(request, requestedKey, "Empty command key");
        assertCommandSnapshotInvariants(snapshot, emptyCap);
        return { ok: false, snapshot, reason: "Empty command key" };
    }

    const resolved = tryResolvePlatformCapability(requestedKey);
    if (resolved.status !== "known") {
        const snapshot = unavailableSnapshot(request, requestedKey, `Unknown capability "${requestedKey}"`);
        assertCommandSnapshotInvariants(snapshot, null);
        return { ok: false, snapshot, reason: `Unknown capability "${requestedKey}"` };
    }

    const canonical = canonicalCapabilityKeyForAlias(requestedKey) ?? resolved.capability.canonicalCommandKey;
    const capability =
        getPlatformCapability(canonical) ??
        getPlatformCapability(resolved.capability.capabilityKey) ??
        resolved.capability;

    const snapshot = buildSnapshot({ request, capability, requestedKey });
    const ok = snapshot.runnable && snapshot.subjectState.status !== "incompatible";
    return ok
        ? { ok: true, snapshot }
        : { ok: false, snapshot, reason: snapshot.blockers[0]?.message ?? "Command not preparable" };
}

function unavailableSnapshot(
    request: CommandInvocationRequest,
    requestedKey: string,
    reason: string
): CommandSnapshot {
    return {
        requestedKey,
        canonicalCapabilityKey: requestedKey || "unknown",
        maturity: "unavailable",
        catalogVisibility: "hidden",
        executionOwner: "none",
        origin: request.origin,
        operationalContext: mapSurfaceToOperationalContext(request),
        subjectContract: { kind: "none" },
        subjectState: { status: "none_required" },
        requiredInputState: { status: "none_known" },
        eligibilityState: {
            status: "blocked",
            blockers: [{ code: "unknown_capability", message: reason }],
        },
        warnings: [],
        blockers: [{ code: "unknown_capability", message: reason }],
        confirmationPolicy: "confirm",
        supportsPreview: false,
        destructivePreparation: null,
        currentLifecycleStage: "unavailable",
        nextLifecycleStage: null,
        executionDestination: destinationFor("none"),
        runnable: false,
        authorizationEvaluated: false,
        authorizationGranted: null,
        operatorSafe: {
            label: requestedKey || "Unknown",
            statusMessage: "This command is not available.",
            canContinue: false,
        },
        diagnostics: [{ code: "unknown_capability", message: reason }],
    };
}

/**
 * P1.S1 preparation remains side-effect free.
 * Execution enablement is owner-gated in commandRuntimeExecutionGate.ts (P1.S2).
 */
export {
    COMMAND_RUNTIME_EXECUTION_ENABLED,
    COMMAND_RUNTIME_EXECUTION_BY_OWNER,
    isCommandRuntimeFacadeExecutionSupported,
} from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
