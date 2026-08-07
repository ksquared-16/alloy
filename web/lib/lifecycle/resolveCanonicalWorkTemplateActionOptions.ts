/**
 * Canonical Work Template action options — intent-level, domain-neutral.
 *
 * Merges grain-specific aliases, hides implementation umbrellas, and attaches
 * target metadata from configured process/stage context.
 */

import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { GENERIC_UMBRELLA_LIFECYCLE_ACTION_KEYS } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActionSurfacePolicy";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import {
    resolveOutgoingProcessTransitions,
    type OutgoingProcessTransition,
} from "@/lib/lifecycle/resolveOutgoingProcessTransitions";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    isNonCanonicalIntentAlias,
    normalizeActionRefToIntentKey,
    resolveIntentExecutionRef,
    resolveWorkTemplateSubjectGrain,
    workTemplateActionIntentForKey,
    type WorkTemplateActionIntentCategory,
} from "@/lib/lifecycle/workTemplateActionIntentCatalog";
import { getPlatformAction, type PlatformActionGrain } from "@/lib/platform/actions/platformActionCatalog";
import {
    getPlatformCapability,
    isNonRunnableCatalogCapability,
    tryResolvePlatformCapability,
} from "@/lib/platform/commands/capabilityRegistry";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveBusinessProcessCommandSelection } from "@/lib/lifecycle/resolveBusinessProcessCommandSelection";
import { listEnabledCommandKeys } from "@/lib/lifecycle/processCommandSetV1";

export type CanonicalWorkTemplateActionOption = {
    ref: string;
    intentKey: string;
    label: string;
    description?: string;
    icon?: string;
    category: WorkTemplateActionIntentCategory | "transition";
    group: string;
    supported: boolean;
    disabledReason?: string;
    target: {
        source: string;
        configuredGrain?: string;
        selectionMode?: string;
    };
    aliases?: string[];
    executionSurface?: string;
};

const RUNTIME_INTERNAL_ACTION_KEYS = new Set([
    "update_lead_status",
    "update_child_enrollment_status",
    "update_status_add_note",
    "mutation_command",
]);

const HIDDEN_EDITOR_ACTION_KEYS = new Set([
    ...GENERIC_UMBRELLA_LIFECYCLE_ACTION_KEYS,
    ...RUNTIME_INTERNAL_ACTION_KEYS,
    "change_enrollment_status",
    "change_status",
    "update_lead_status",
]);

const CATEGORY_TO_GROUP: Record<string, string> = {
    communication: "Communications",
    workflow: "Workflow",
    relationship: "Relationships",
    lifecycle: "Lifecycle",
    status_lifecycle: "Lifecycle",
    record: "Record actions",
    bos: "BOS",
    bos_native: "BOS",
    transition: "Recommended",
};

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text.length > 0 ? text : null;
}

function mapCategory(raw: string): CanonicalWorkTemplateActionOption["category"] {
    switch (raw) {
        case "communication":
            return "communication";
        case "workflow":
            return "workflow";
        case "relationship":
            return "relationship";
        case "status_lifecycle":
            return "lifecycle";
        case "bos_native":
            return "bos";
        default:
            return "record";
    }
}

function actionLabel(actionKey: string, overrideLabel?: string | null): string {
    const override = overrideLabel?.trim();
    if (override) return override;
    const intent = workTemplateActionIntentForKey(actionKey);
    if (intent) return intent.label;
    const canonical = canonicalActionDefinition(actionKey);
    if (canonical?.label) return canonical.label;
    const platform = getPlatformAction(actionKey);
    if (platform?.defaultLabel) return platform.defaultLabel;
    return actionKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionDescription(actionKey: string): string | undefined {
    const intent = workTemplateActionIntentForKey(actionKey);
    if (intent?.description) return intent.description;
    return canonicalActionDefinition(actionKey)?.description;
}

function rawCategory(actionKey: string): string {
    const canonical = canonicalActionDefinition(actionKey);
    if (canonical?.category) return canonical.category;
    const platform = getPlatformAction(actionKey);
    if (platform?.category) return platform.category;
    return "record";
}

function executionSurfaceForAction(actionKey: string): string | undefined {
    const canonical = canonicalActionDefinition(actionKey);
    if (!canonical) return undefined;
    switch (canonical.executor.kind) {
        case "admin_execute":
            return "admin_execute";
        case "relationship_execute":
            return "relationship_execute";
        case "dedicated_modal":
            return "dedicated_modal";
        case "ui_intent":
            return "ui_intent";
        default:
            return undefined;
    }
}

function isHiddenFromEditor(actionKey: string): boolean {
    const key = actionKey.trim();
    if (!key) return true;
    if (HIDDEN_EDITOR_ACTION_KEYS.has(key)) return true;
    const platform = getPlatformAction(key);
    if (platform?.runtimeCommandKey && HIDDEN_EDITOR_ACTION_KEYS.has(platform.runtimeCommandKey)) {
        return true;
    }
    const canonical = canonicalActionDefinition(key);
    if (canonical && !canonical.settingsConfigurable && !canonical.runtimeWired) return true;
    const label = actionLabel(key).toLowerCase();
    if (label.includes("change enrollment status") || label.includes("update enrollment status")) {
        return true;
    }
    if (label.includes("update lead status") || label === "change status") return true;
    return false;
}

function isUnsupportedActionKey(actionKey: string): string | null {
    const key = actionKey.trim();
    if (!key) return "Missing action key";
    // P0.S1 honesty: seed stubs / placeholders are not usable process Commands.
    if (isNonRunnableCatalogCapability(key)) {
        const maturity = getPlatformCapability(key)?.maturity ?? "unavailable";
        return `Capability is ${maturity} and is not a runnable Command`;
    }
    const canonical = canonicalActionDefinition(key);
    if (canonical && !canonical.runtimeWired) return "Action is not runtime-wired";
    return null;
}

function targetMetadata(executionKey: string) {
    const platform = getPlatformAction(executionKey);
    return {
        source: "process_subject",
        selectionMode: platform?.supportsMultiSubject ? "one_or_more" : "configured",
    };
}

function targetDescriptionSuffix(): string {
    return "Resolves from process configuration";
}

export function formatCanonicalActionOptionDescription(option: CanonicalWorkTemplateActionOption): string {
    const categoryLabel = CATEGORY_TO_GROUP[option.category] ?? option.category;
    const parts = [categoryLabel, targetDescriptionSuffix()];
    if (option.executionSurface === "ui_intent") parts.push("Opens inline form");
    if (option.description) parts.push(option.description);
    return parts.filter(Boolean).join(" · ");
}

function configuredRegistryKeys(
    registry: unknown,
    stageKey: string,
    catalogKeys: Set<string>,
): string[] {
    if (!Array.isArray(registry)) return [];
    const keys: string[] = [];

    for (const row of registry) {
        if (row == null || typeof row !== "object") continue;
        const record = row as LifecycleConfiguredActionRow;
        const key = trimOrNull(record.key);
        if (!key) continue;

        if (catalogKeys.has(key)) {
            keys.push(key);
            continue;
        }

        if (!("action_scope" in record)) continue;
        if (record.action_scope === "lifecycle") {
            keys.push(key);
            continue;
        }
        if (record.operator_stages?.some((stage) => stage === stageKey)) {
            keys.push(key);
        }
    }

    return keys;
}

function collectCandidateActionKeys(args: {
    actionRegistry: unknown;
    stageActionCatalog?: StageActionCatalogV1 | null;
    stageKey?: string;
}): string[] {
    const keys = new Set<string>();
    const catalogKeys = new Set<string>();

    for (const row of args.stageActionCatalog?.candidate_actions ?? []) {
        const key = row.action_key.trim();
        if (key) {
            keys.add(key);
            catalogKeys.add(key);
        }
    }

    for (const key of configuredRegistryKeys(args.actionRegistry, args.stageKey?.trim() ?? "", catalogKeys)) {
        keys.add(key);
    }

    /**
     * Promote grain-specific aliases (e.g. waitlist_child) to their operator intent
     * (move_to_waitlist) instead of dropping them. mergeByIntent still dedupes.
     */
    const promoted = new Set<string>();
    for (const key of keys) {
        if (!key || isHiddenFromEditor(key)) continue;
        if (isNonCanonicalIntentAlias(key)) {
            const intentKey = normalizeActionRefToIntentKey(key);
            if (intentKey && !isHiddenFromEditor(intentKey)) {
                promoted.add(intentKey);
            }
            continue;
        }
        promoted.add(key);
    }
    return [...promoted];
}

function buildRawOption(
    actionKey: string,
    subjectGrain: PlatformActionGrain | "process_subject",
    overrideLabel?: string | null,
    recommendation?: string | null,
): CanonicalWorkTemplateActionOption | null {
    const ref = actionKey.trim();
    if (!ref || isHiddenFromEditor(ref)) return null;

    const intent = workTemplateActionIntentForKey(ref);
    const executionKey = intent ? resolveIntentExecutionRef(intent, subjectGrain) : ref;
    const disabledReason = isUnsupportedActionKey(executionKey);
    const category = intent?.category ?? mapCategory(rawCategory(executionKey));
    const group =
        recommendation === "recommended" ? "Recommended" : (CATEGORY_TO_GROUP[category] ?? "Record actions");
    const canonicalRef = intent?.intentKey ?? ref;

    return {
        ref: canonicalRef,
        intentKey: canonicalRef,
        label: intent?.label ?? actionLabel(ref, overrideLabel),
        description: intent?.description ?? actionDescription(executionKey),
        category,
        group,
        supported: disabledReason == null,
        ...(disabledReason ? { disabledReason } : {}),
        target: targetMetadata(executionKey),
        ...(intent ? { aliases: [...intent.aliases] } : {}),
        executionSurface: executionSurfaceForAction(executionKey),
    };
}

function mergeByIntent(
    options: CanonicalWorkTemplateActionOption[],
): CanonicalWorkTemplateActionOption[] {
    const byIntent = new Map<string, CanonicalWorkTemplateActionOption>();

    for (const option of options) {
        const existing = byIntent.get(option.intentKey);
        if (!existing) {
            byIntent.set(option.intentKey, option);
            continue;
        }
        const mergedAliases = [...new Set([...(existing.aliases ?? []), ...(option.aliases ?? []), existing.ref, option.ref])];
        byIntent.set(option.intentKey, {
            ...existing,
            aliases: mergedAliases,
            supported: existing.supported || option.supported,
            ...(existing.supported ? {} : option.supported ? { disabledReason: undefined } : {}),
        });
    }

    return [...byIntent.values()].filter((row) => row.supported);
}

/** Best-effort narrowing of the opaque action registry to configured-action rows. */
function asConfiguredActionRows(registry: unknown): LifecycleConfiguredActionRow[] | null {
    if (!Array.isArray(registry)) return null;
    const rows = registry.filter(
        (row): row is LifecycleConfiguredActionRow =>
            row != null
            && typeof row === "object"
            && typeof (row as { key?: unknown }).key === "string"
            && Array.isArray((row as { placements?: unknown }).placements)
    );
    return rows.length ? rows : null;
}

function processSelectionKeySet(
    process: LifecycleBuilderProcessRecord | null | undefined,
    actionRegistry: unknown
): Set<string> | null {
    if (!process) return null;
    // The configured registry must be on BOTH sides of its own gate. Omitting it here meant the
    // legacy migration derived its selection from stage catalogs alone, so configured actions were
    // collected as candidates and then filtered out by a set that could never contain them.
    const selection = resolveBusinessProcessCommandSelection({
        process,
        lifecycleConfiguredActions: asConfiguredActionRows(actionRegistry),
    });
    const keys = listEnabledCommandKeys(selection.commands, (key) => {
        const resolved = tryResolvePlatformCapability(key);
        return resolved.status === "known" ? resolved.capability.canonicalCommandKey : key.trim();
    });
    const out = new Set<string>();
    for (const key of keys) {
        out.add(key);
        out.add(normalizeActionRefToIntentKey(key));
    }
    // A DERIVED-empty legacy migration is not an operator saying "no Commands" — treating it as one
    // emptied the picker and left the work item unconfigurable. Only an explicit `command_set_v1`
    // selection may gate to nothing.
    if (out.size === 0 && selection.authority !== "command_set_v1") return null;
    return out;
}

function keyInSelection(selection: Set<string>, key: string): boolean {
    const trimmed = key.trim();
    if (!trimmed) return false;
    return (
        selection.has(trimmed) ||
        selection.has(normalizeActionRefToIntentKey(trimmed))
    );
}

export function resolveCanonicalWorkTemplateActionOptions(input: {
    processDefinition?: unknown;
    stageDefinition?: unknown;
    actionRegistry: unknown;
    stageActionCatalog?: StageActionCatalogV1 | null;
    processTransitions?: unknown;
    stageKey?: string;
    /**
     * P6.S3: when provided, option membership is gated to process Command selection
     * (command_set_v1 or deterministic legacy migrate). Stage catalogs remain recommendation-only.
     */
    process?: LifecycleBuilderProcessRecord | null;
}): CanonicalWorkTemplateActionOption[] {
    const subjectGrain = resolveWorkTemplateSubjectGrain({
        processDefinition: input.processDefinition,
        stageDefinition: input.stageDefinition,
    });

    const catalogRecommendations = new Map<string, string>();
    for (const row of input.stageActionCatalog?.candidate_actions ?? []) {
        catalogRecommendations.set(row.action_key, row.recommendation ?? "");
    }

    let candidateKeys = collectCandidateActionKeys({
        actionRegistry: input.actionRegistry,
        stageActionCatalog: input.stageActionCatalog ?? null,
        stageKey: input.stageKey,
    });

    const selection = processSelectionKeySet(input.process ?? null, input.actionRegistry);
    if (selection) {
        candidateKeys = candidateKeys.filter((key) => keyInSelection(selection, key));
    }

    const rawOptions = candidateKeys
        .map((key) =>
            buildRawOption(
                key,
                subjectGrain,
                input.stageActionCatalog?.candidate_actions.find((row) => row.action_key === key)?.override_label
                    ?? null,
                catalogRecommendations.get(key) ?? null,
            ),
        )
        .filter((row): row is CanonicalWorkTemplateActionOption => row != null);

    return mergeByIntent(rawOptions);
}

function canonicalOptionFromTransition(
    row: OutgoingProcessTransition,
    currentStageKey: string,
    currentStageLabel?: string,
): CanonicalWorkTemplateActionOption {
    const fromLabel = currentStageLabel?.trim() || currentStageKey.replace(/_/g, " ");
    return {
        ref: row.transition_ref,
        intentKey: row.transition_ref,
        label: row.label,
        description: `Transition · ${fromLabel} → ${row.target_stage_label}`,
        category: "transition",
        group: "Recommended",
        supported: true,
        target: { source: "process_subject", selectionMode: "configured" },
        executionSurface: "stage_transition",
    };
}

export function resolveCanonicalTransitionOptions(input: {
    currentStageKey: string;
    currentStageLabel?: string;
    stageOperatingPlan?: StageOperatingPlanV1 | null;
    processTracks?: unknown;
    processStages?: ReadonlyArray<{ key: string; label: string }>;
    /** @deprecated Legacy callers pass stage inventory — ignored; use configured edges only. */
    processTransitions?: unknown;
}): CanonicalWorkTemplateActionOption[] {
    const transitions = resolveOutgoingProcessTransitions({
        currentStageKey: input.currentStageKey,
        stageOperatingPlan: input.stageOperatingPlan ?? null,
        processTracks: input.processTracks ?? null,
        processStages: input.processStages ?? [],
    });

    return transitions.map((row) =>
        canonicalOptionFromTransition(row, input.currentStageKey, input.currentStageLabel),
    );
}

export function resolveCanonicalWorkTemplateAlternatePathOptions(input: {
    processDefinition?: unknown;
    stageDefinition?: unknown;
    actionRegistry: unknown;
    stageActionCatalog?: StageActionCatalogV1 | null;
    stageOperatingPlan?: StageOperatingPlanV1 | null;
    processTracks?: unknown;
    processStages?: ReadonlyArray<{ key: string; label: string }>;
    stageKey: string;
    stageLabel?: string;
    /** @deprecated Legacy callers pass stage inventory — ignored. */
    processTransitions?: unknown;
}): CanonicalWorkTemplateActionOption[] {
    return resolveCanonicalTransitionOptions({
        currentStageKey: input.stageKey,
        currentStageLabel: input.stageLabel,
        stageOperatingPlan: input.stageOperatingPlan ?? null,
        processTracks: input.processTracks ?? null,
        processStages: input.processStages ?? [],
    });
}

export { CATEGORY_TO_GROUP as WORK_TEMPLATE_ACTION_GROUP_LABELS };
