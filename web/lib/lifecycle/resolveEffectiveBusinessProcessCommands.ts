/**
 * Effective Business Process Command resolution (P6.S1).
 *
 * Read-only. Does not execute Commands or claim authorization.
 *
 * Authority chain:
 *   Organization catalog (availability input)
 *   → process command selection (command_set_v1 | legacy)
 *   → stage recommendation/evaluation (action_catalog_v1)
 *   → Capability Registry honesty
 */

import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import {
    resolveBusinessProcessCommandSelection,
    type BusinessProcessCommandSelectionAuthority,
} from "@/lib/lifecycle/resolveBusinessProcessCommandSelection";
import {
    getPlatformCapability,
    tryResolvePlatformCapability,
} from "@/lib/platform/commands/capabilityRegistry";
import type { CapabilityMaturity } from "@/lib/platform/commands/capabilityTypes";

export type EffectiveCapabilityStatus =
    | "available"
    | "unavailable"
    | "legacy"
    | "placeholder"
    | "unknown"
    | "processing_only"
    | "configuration_maintenance";

export type EffectiveAvailabilityStatus = "available" | "unavailable" | "context_mismatch" | "unchecked";

export type EffectiveInvocationReadiness =
    | "runnable"
    | "requires_subject"
    | "requires_inputs"
    | "not_executable"
    | "unauthorized_unknown";

export type EffectiveBusinessProcessCommand = {
    requestedKey: string;
    canonicalCapabilityKey: string;
    processSelected: boolean;
    processEnabled: boolean;
    stageRecommended: boolean;
    stageRequired: boolean;
    capabilityStatus: EffectiveCapabilityStatus;
    availabilityStatus: EffectiveAvailabilityStatus;
    invocationReadiness: EffectiveInvocationReadiness;
    variantKey?: string;
    reasons: readonly string[];
};

export type EffectiveBusinessProcessCommandResolution = {
    processId: string;
    processKey: string;
    stageKey: string | null;
    authority: BusinessProcessCommandSelectionAuthority;
    commands: readonly EffectiveBusinessProcessCommand[];
    /** Stage catalog keys that are not process-selected (configuration errors). */
    stageOrphans: readonly EffectiveBusinessProcessCommand[];
    diagnostics: readonly EffectiveCommandDiagnostic[];
};

export type EffectiveCommandDiagnostic = {
    code: string;
    message: string;
};

export type OrganizationCommandCatalogLookup = {
    /** null = not found / unknown; false = explicitly disabled. */
    isEnabled(canonicalCapabilityKey: string): boolean | null;
    /** null = variants not checked / unknown. */
    hasVariant?(canonicalCapabilityKey: string, variantKey: string): boolean | null;
};

function mapMaturity(maturity: CapabilityMaturity | undefined): EffectiveCapabilityStatus {
    switch (maturity) {
        case "executable":
        case "adapted":
            return "available";
        case "legacy":
            return "legacy";
        case "placeholder":
            return "placeholder";
        case "unavailable":
        case "navigation_only":
        case "workflow_only":
            return "unavailable";
        case "processing_only":
            return "processing_only";
        case "configuration_maintenance":
            return "configuration_maintenance";
        default:
            return "unknown";
    }
}

function resolveCanonicalKey(requestedKey: string): {
    canonical: string;
    known: boolean;
    maturity?: CapabilityMaturity;
} {
    const resolved = tryResolvePlatformCapability(requestedKey);
    if (resolved.status === "known") {
        return {
            canonical: resolved.capability.canonicalCommandKey,
            known: true,
            maturity: resolved.capability.maturity,
        };
    }
    return { canonical: requestedKey.trim(), known: false };
}

function readinessFor(input: {
    processEnabled: boolean;
    capabilityStatus: EffectiveCapabilityStatus;
    availabilityStatus: EffectiveAvailabilityStatus;
    known: boolean;
}): { readiness: EffectiveInvocationReadiness; reasons: string[] } {
    const reasons: string[] = ["authorization_deferred_to_invocation"];
    if (!input.processEnabled) {
        reasons.push("process_command_disabled");
        return { readiness: "not_executable", reasons };
    }
    if (!input.known || input.capabilityStatus === "unknown") {
        reasons.push("unknown_capability");
        return { readiness: "not_executable", reasons };
    }
    if (
        input.capabilityStatus === "unavailable" ||
        input.capabilityStatus === "placeholder" ||
        input.capabilityStatus === "processing_only" ||
        input.capabilityStatus === "configuration_maintenance"
    ) {
        reasons.push(`capability_${input.capabilityStatus}`);
        return { readiness: "not_executable", reasons };
    }
    if (input.availabilityStatus === "unavailable") {
        reasons.push("organization_disabled");
        return { readiness: "not_executable", reasons };
    }
    if (input.availabilityStatus === "context_mismatch") {
        reasons.push("context_mismatch");
        return { readiness: "not_executable", reasons };
    }
    // Structurally runnable; auth remains server-owned at invocation.
    return { readiness: "runnable", reasons };
}

function stageFlags(
    catalog: StageActionCatalogV1 | null | undefined,
    requestedOrCanonical: string,
    resolveCanon: (k: string) => string
): { recommended: boolean; required: boolean; matchedKey: string | null } {
    if (!catalog) return { recommended: false, required: false, matchedKey: null };
    const want = resolveCanon(requestedOrCanonical);
    for (const row of catalog.candidate_actions) {
        if (resolveCanon(row.action_key) !== want) continue;
        return {
            recommended: row.recommendation === "recommended",
            // Stage catalogs today use recommendation levels; "required" progression
            // remains on operating-plan / during-stage requirements — not invented here.
            required: false,
            matchedKey: row.action_key,
        };
    }
    return { recommended: false, required: false, matchedKey: null };
}

/**
 * Resolve effective Commands for a process (+ optional stage).
 * Read-only — no execution.
 */
export function resolveEffectiveBusinessProcessCommands(input: {
    process: LifecycleBuilderProcessRecord;
    stageKey?: string | null;
    stageActionCatalog?: StageActionCatalogV1 | null;
    lifecycleConfiguredActions?: readonly LifecycleConfiguredActionRow[] | null;
    organizationCommandCatalog?: OrganizationCommandCatalogLookup | null;
    /** Optional operational context keys to match entry availability.contexts. */
    operationalContext?: string | null;
}): EffectiveBusinessProcessCommandResolution {
    const selection = resolveBusinessProcessCommandSelection({
        process: input.process,
        lifecycleConfiguredActions: input.lifecycleConfiguredActions,
    });

    const stageKey = input.stageKey?.trim() || null;
    const stage =
        stageKey != null
            ? input.process.stages.find((s) => s.key === stageKey) ?? null
            : null;
    const catalog =
        input.stageActionCatalog ??
        stage?.action_catalog_v1 ??
        null;

    const diagnostics: EffectiveCommandDiagnostic[] = [
        ...selection.diagnostics.map((d) => ({ code: d.code, message: d.message })),
    ];

    const selectedByCanonical = new Map<
        string,
        { requestedKey: string; enabled: boolean; variantKey?: string; contexts?: readonly string[] }
    >();

    for (const entry of selection.commands.commands) {
        const { canonical, known } = resolveCanonicalKey(entry.capability_key);
        if (!canonical) continue;
        if (!selectedByCanonical.has(canonical)) {
            selectedByCanonical.set(canonical, {
                requestedKey: entry.capability_key,
                enabled: entry.enabled,
                variantKey: entry.variant_key,
                contexts: entry.availability?.contexts,
            });
        }
        if (!known) {
            diagnostics.push({
                code: "unknown_capability",
                message: `process=${selection.processKey} capability=${entry.capability_key}`,
            });
        }
        if (entry.variant_key && input.organizationCommandCatalog?.hasVariant) {
            const has = input.organizationCommandCatalog.hasVariant(canonical, entry.variant_key);
            if (has === false) {
                diagnostics.push({
                    code: "missing_variant",
                    message: `process=${selection.processKey} capability=${canonical} variant=${entry.variant_key}`,
                });
            }
        }
    }

    const commands: EffectiveBusinessProcessCommand[] = [];

    for (const [canonical, sel] of selectedByCanonical) {
        const resolved = resolveCanonicalKey(sel.requestedKey);
        const capabilityStatus = resolved.known
            ? mapMaturity(resolved.maturity ?? getPlatformCapability(canonical)?.maturity)
            : "unknown";

        let availabilityStatus: EffectiveAvailabilityStatus = "unchecked";
        if (input.organizationCommandCatalog) {
            const enabled = input.organizationCommandCatalog.isEnabled(canonical);
            if (enabled === false) availabilityStatus = "unavailable";
            else if (enabled === true) availabilityStatus = "available";
            else availabilityStatus = "unchecked";
        }

        if (
            availabilityStatus !== "unavailable" &&
            sel.contexts?.length &&
            input.operationalContext
        ) {
            const ctx = input.operationalContext.trim();
            if (ctx && !sel.contexts.includes(ctx)) {
                availabilityStatus = "context_mismatch";
                diagnostics.push({
                    code: "context_mismatch",
                    message: `process=${selection.processKey} capability=${canonical} context=${ctx}`,
                });
            }
        }

        const flags = stageFlags(catalog, canonical, (k) => resolveCanonicalKey(k).canonical);
        const { readiness, reasons } = readinessFor({
            processEnabled: sel.enabled,
            capabilityStatus,
            availabilityStatus,
            known: resolved.known,
        });

        if (availabilityStatus === "unavailable") {
            diagnostics.push({
                code: "organization_disabled",
                message: `process=${selection.processKey} capability=${canonical}`,
            });
        }
        if (capabilityStatus === "unavailable" || capabilityStatus === "placeholder") {
            diagnostics.push({
                code: "unavailable_capability",
                message: `process=${selection.processKey} capability=${canonical} status=${capabilityStatus}`,
            });
        }

        commands.push({
            requestedKey: sel.requestedKey,
            canonicalCapabilityKey: canonical,
            processSelected: true,
            processEnabled: sel.enabled,
            stageRecommended: flags.recommended,
            stageRequired: flags.required,
            capabilityStatus,
            availabilityStatus,
            invocationReadiness: readiness,
            ...(sel.variantKey ? { variantKey: sel.variantKey } : {}),
            reasons,
        });
    }

    const stageOrphans: EffectiveBusinessProcessCommand[] = [];
    if (catalog) {
        for (const row of catalog.candidate_actions) {
            const { canonical, known, maturity } = resolveCanonicalKey(row.action_key);
            if (selectedByCanonical.has(canonical)) continue;
            diagnostics.push({
                code: "stage_reference_unselected",
                message: `process=${selection.processKey} stage=${stageKey ?? "?"} capability=${row.action_key}`,
            });
            const capabilityStatus = known ? mapMaturity(maturity) : "unknown";
            stageOrphans.push({
                requestedKey: row.action_key,
                canonicalCapabilityKey: canonical,
                processSelected: false,
                processEnabled: false,
                stageRecommended: row.recommendation === "recommended",
                stageRequired: false,
                capabilityStatus,
                availabilityStatus: "unchecked",
                invocationReadiness: "not_executable",
                reasons: [
                    "stage_reference_not_process_selected",
                    "authorization_deferred_to_invocation",
                ],
            });
        }
    }

    return {
        processId: selection.processId,
        processKey: selection.processKey,
        stageKey,
        authority: selection.authority,
        commands,
        stageOrphans,
        diagnostics,
    };
}
