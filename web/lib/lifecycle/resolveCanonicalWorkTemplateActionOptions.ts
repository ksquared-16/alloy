/**
 * Canonical Work Template action options — intent-level, domain-neutral.
 *
 * Merges grain-specific aliases, hides implementation umbrellas, and attaches
 * target metadata from configured process/stage context.
 */

import { ACTION_BUTTON_LIBRARY } from "@/lib/admin/actions/actionDefinitionRegistry";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { GENERIC_UMBRELLA_LIFECYCLE_ACTION_KEYS } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActionSurfacePolicy";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import {
    resolveIntentExecutionRef,
    resolveWorkTemplateSubjectGrain,
    workTemplateActionIntentForKey,
    type WorkTemplateActionIntentCategory,
} from "@/lib/lifecycle/workTemplateActionIntentCatalog";
import { getPlatformAction, type PlatformActionGrain } from "@/lib/platform/actions/platformActionCatalog";

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
    const catalog = ACTION_BUTTON_LIBRARY.find((row) => row.key === actionKey);
    if (catalog?.label) return catalog.label;
    const canonical = canonicalActionDefinition(actionKey);
    if (canonical?.label) return canonical.label;
    const platform = getPlatformAction(actionKey);
    if (platform?.defaultLabel) return platform.defaultLabel;
    return actionKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionDescription(actionKey: string): string | undefined {
    const intent = workTemplateActionIntentForKey(actionKey);
    if (intent?.description) return intent.description;
    const catalog = ACTION_BUTTON_LIBRARY.find((row) => row.key === actionKey);
    if (catalog?.description) return catalog.description;
    return canonicalActionDefinition(actionKey)?.description;
}

function rawCategory(actionKey: string): string {
    const canonical = canonicalActionDefinition(actionKey);
    if (canonical?.category) return canonical.category;
    const platform = getPlatformAction(actionKey);
    if (platform?.category) return platform.category;
    const catalog = ACTION_BUTTON_LIBRARY.find((row) => row.key === actionKey);
    return catalog?.category ?? "record";
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
    const canonical = canonicalActionDefinition(key);
    if (canonical && !canonical.runtimeWired) return "Action is not runtime-wired";
    return null;
}

function targetMetadata(actionKey: string, subjectGrain: PlatformActionGrain | "process_subject") {
    const platform = getPlatformAction(actionKey);
    const grain = platform?.grain ?? (subjectGrain === "process_subject" ? undefined : subjectGrain);
    return {
        source: "process_subject",
        ...(grain ? { configuredGrain: grain } : {}),
        selectionMode: platform?.supportsMultiSubject ? "one_or_more" : "configured",
    };
}

function targetDescriptionSuffix(target: CanonicalWorkTemplateActionOption["target"]): string {
    if (target.configuredGrain === "opportunity") return "Uses configured process subject";
    if (target.configuredGrain === "opportunity_customer_member") return "Uses configured related subject";
    return "Uses configured process subject";
}

export function formatCanonicalActionOptionDescription(option: CanonicalWorkTemplateActionOption): string {
    const categoryLabel = CATEGORY_TO_GROUP[option.category] ?? option.category;
    const parts = [categoryLabel, targetDescriptionSuffix(option.target)];
    if (option.executionSurface === "ui_intent") parts.push("Opens inline form");
    if (option.description) parts.push(option.description);
    return parts.filter(Boolean).join(" · ");
}

function collectCandidateActionKeys(args: {
    actionRegistry: unknown;
    stageActionCatalog?: StageActionCatalogV1 | null;
}): string[] {
    const keys = new Set<string>();

    for (const row of args.stageActionCatalog?.candidate_actions ?? []) {
        const key = row.action_key.trim();
        if (key) keys.add(key);
    }

    if (Array.isArray(args.actionRegistry)) {
        for (const row of args.actionRegistry) {
            if (row == null || typeof row !== "object") continue;
            const key = trimOrNull((row as Record<string, unknown>).key);
            if (key) keys.add(key);
        }
    }

    for (const row of ACTION_BUTTON_LIBRARY) {
        if (row.settingsConfigurable) keys.add(row.key);
    }

    return [...keys].filter((key) => !isHiddenFromEditor(key));
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
    const resolvedRef = intent ? resolveIntentExecutionRef(intent, subjectGrain) : ref;
    const disabledReason = isUnsupportedActionKey(resolvedRef);
    const category = intent?.category ?? mapCategory(rawCategory(resolvedRef));
    const group =
        recommendation === "recommended" ? "Recommended" : (CATEGORY_TO_GROUP[category] ?? "Record actions");

    return {
        ref: resolvedRef,
        intentKey: intent?.intentKey ?? resolvedRef,
        label: intent?.label ?? actionLabel(resolvedRef, overrideLabel),
        description: actionDescription(resolvedRef),
        category,
        group,
        supported: disabledReason == null,
        ...(disabledReason ? { disabledReason } : {}),
        target: targetMetadata(resolvedRef, subjectGrain),
        ...(intent ? { aliases: [...intent.aliases] } : {}),
        executionSurface: executionSurfaceForAction(resolvedRef),
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

export function resolveCanonicalWorkTemplateActionOptions(input: {
    processDefinition?: unknown;
    stageDefinition?: unknown;
    actionRegistry: unknown;
    stageActionCatalog?: StageActionCatalogV1 | null;
    processTransitions?: unknown;
    stageKey?: string;
}): CanonicalWorkTemplateActionOption[] {
    const subjectGrain = resolveWorkTemplateSubjectGrain({
        processDefinition: input.processDefinition,
        stageDefinition: input.stageDefinition,
    });

    const catalogRecommendations = new Map<string, string>();
    for (const row of input.stageActionCatalog?.candidate_actions ?? []) {
        catalogRecommendations.set(row.action_key, row.recommendation ?? "");
    }

    const candidateKeys = collectCandidateActionKeys({
        actionRegistry: input.actionRegistry,
        stageActionCatalog: input.stageActionCatalog ?? null,
    });

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

export function resolveCanonicalTransitionOptions(input: {
    processTransitions: unknown;
    stageKey: string;
}): CanonicalWorkTemplateActionOption[] {
    if (!Array.isArray(input.processTransitions)) return [];
    const current = input.stageKey.trim();
    const options: CanonicalWorkTemplateActionOption[] = [];
    const seen = new Set<string>();

    for (const row of input.processTransitions) {
        if (row == null || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const targetStageKey = trimOrNull(record.key);
        if (!targetStageKey || targetStageKey === current || seen.has(targetStageKey)) continue;
        seen.add(targetStageKey);
        const label =
            trimOrNull(record.label)
            ?? targetStageKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const ref = `move_to_stage:${targetStageKey}`;
        options.push({
            ref,
            intentKey: ref,
            label: `Move to ${label}`,
            description: `Advance record to ${label}`,
            category: "transition",
            group: "Recommended",
            supported: true,
            target: { source: "process_subject", selectionMode: "configured" },
            executionSurface: "stage_transition",
        });
    }

    return options;
}

export function resolveCanonicalWorkTemplateAlternatePathOptions(input: {
    processDefinition?: unknown;
    stageDefinition?: unknown;
    actionRegistry: unknown;
    stageActionCatalog?: StageActionCatalogV1 | null;
    processTransitions: unknown;
    stageKey: string;
}): CanonicalWorkTemplateActionOption[] {
    const transitions = resolveCanonicalTransitionOptions({
        processTransitions: input.processTransitions,
        stageKey: input.stageKey,
    });

    const lifecycleActions = resolveCanonicalWorkTemplateActionOptions(input).filter(
        (row) => row.category === "lifecycle",
    );

    return [...transitions, ...lifecycleActions];
}

export { CATEGORY_TO_GROUP as WORK_TEMPLATE_ACTION_GROUP_LABELS };
