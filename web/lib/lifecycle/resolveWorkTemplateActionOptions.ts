/**
 * Pure option resolver for Work Template action configuration in /processes editor.
 *
 * Resolves labels/icons from canonical registry + stage action catalog metadata.
 * Generic umbrella status commands and unsupported mutation commands are excluded.
 */

import { ACTION_BUTTON_LIBRARY } from "@/lib/admin/actions/actionDefinitionRegistry";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { GENERIC_UMBRELLA_LIFECYCLE_ACTION_KEYS } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActionSurfacePolicy";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import { getPlatformAction } from "@/lib/platform/actions/platformActionCatalog";

export type WorkTemplateActionOption = {
    ref: string;
    label: string;
    description?: string;
    icon?: string;
    category: string;
    executionSurface?: string;
    supported: boolean;
    disabledReason?: string;
};

export type WorkTemplateTransitionOption = {
    ref: string;
    label: string;
    description?: string;
    targetStageKey?: string;
    supported: boolean;
    disabledReason?: string;
};

export type WorkTemplateOutcomeOption = {
    ref: string;
    label: string;
    successful?: boolean;
};

const RUNTIME_INTERNAL_ACTION_KEYS = new Set([
    "update_lead_status",
    "update_child_enrollment_status",
    "update_status_add_note",
]);

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text.length > 0 ? text : null;
}

function actionLabel(actionKey: string, overrideLabel?: string | null): string {
    const override = overrideLabel?.trim();
    if (override) return override;
    const catalog = ACTION_BUTTON_LIBRARY.find((row) => row.key === actionKey);
    if (catalog?.label) return catalog.label;
    const canonical = canonicalActionDefinition(actionKey);
    if (canonical?.label) return canonical.label;
    const platform = getPlatformAction(actionKey);
    if (platform?.defaultLabel) return platform.defaultLabel;
    return actionKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionCategory(actionKey: string): string {
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

function isUnsupportedActionKey(actionKey: string): string | null {
    const key = actionKey.trim();
    if (!key) return "Missing action key";
    if (GENERIC_UMBRELLA_LIFECYCLE_ACTION_KEYS.has(key)) {
        return "Generic status umbrella actions are not selectable for Current Work";
    }
    if (RUNTIME_INTERNAL_ACTION_KEYS.has(key)) {
        return "Runtime-internal mutation commands are not operator-selectable";
    }
    const platform = getPlatformAction(key);
    if (platform?.runtimeCommandKey && RUNTIME_INTERNAL_ACTION_KEYS.has(platform.runtimeCommandKey)) {
        return "Runtime-internal mutation commands are not operator-selectable";
    }
    const canonical = canonicalActionDefinition(key);
    if (canonical && !canonical.runtimeWired) {
        return "Action is not runtime-wired";
    }
    return null;
}

function buildActionOption(actionKey: string, overrideLabel?: string | null): WorkTemplateActionOption {
    const ref = actionKey.trim();
    const disabledReason = isUnsupportedActionKey(ref);
    const catalog = ACTION_BUTTON_LIBRARY.find((row) => row.key === ref);
    const canonical = canonicalActionDefinition(ref);
    return {
        ref,
        label: actionLabel(ref, overrideLabel),
        description: catalog?.description ?? canonical?.description,
        category: actionCategory(ref),
        executionSurface: executionSurfaceForAction(ref),
        supported: disabledReason == null,
        ...(disabledReason ? { disabledReason } : {}),
    };
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

    return [...keys];
}

function buildTransitionOptions(processTransitions: unknown, stageKey: string): WorkTemplateTransitionOption[] {
    if (!Array.isArray(processTransitions)) return [];
    const current = stageKey.trim();
    const options: WorkTemplateTransitionOption[] = [];
    const seen = new Set<string>();

    for (const row of processTransitions) {
        if (row == null || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const targetStageKey = trimOrNull(record.key);
        if (!targetStageKey || targetStageKey === current || seen.has(targetStageKey)) continue;
        seen.add(targetStageKey);
        const label =
            trimOrNull(record.label)
            ?? targetStageKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        options.push({
            ref: `move_to_stage:${targetStageKey}`,
            label: `Move to ${label}`,
            description: `Advance record to ${label}`,
            targetStageKey,
            supported: true,
        });
    }

    return options;
}

export function resolveWorkTemplateActionOptions(input: {
    actionRegistry: unknown;
    stageActionCatalog?: StageActionCatalogV1 | null;
    processTransitions: unknown;
    stageKey: string;
    stageOutcomes?: Array<{ outcome_key: string; label: string; work_template_key?: string | null; successful?: boolean }>;
    workTemplateKey?: string | null;
}): {
    primaryActionOptions: WorkTemplateActionOption[];
    helpfulActionOptions: WorkTemplateActionOption[];
    alternatePathOptions: WorkTemplateActionOption[];
    transitionOptions: WorkTemplateTransitionOption[];
    outcomeOptions: WorkTemplateOutcomeOption[];
} {
    const candidateKeys = collectCandidateActionKeys({
        actionRegistry: input.actionRegistry,
        stageActionCatalog: input.stageActionCatalog ?? null,
    });

    const primaryActionOptions = candidateKeys.map((key) => {
        const catalogRow = input.stageActionCatalog?.candidate_actions.find((row) => row.action_key === key);
        return buildActionOption(key, catalogRow?.override_label ?? null);
    });

    const helpfulKeys =
        input.stageActionCatalog?.candidate_actions?.length
            ? [
                  ...new Set(
                      input.stageActionCatalog.candidate_actions
                          .map((row) => row.action_key.trim())
                          .filter(Boolean),
                  ),
              ]
            : candidateKeys;

    const helpfulActionOptions = helpfulKeys
        .map((key) => {
            const catalogRow = input.stageActionCatalog?.candidate_actions.find((row) => row.action_key === key);
            return buildActionOption(key, catalogRow?.override_label ?? null);
        })
        .filter((row) => row.supported);

    const transitionOptions = buildTransitionOptions(input.processTransitions, input.stageKey);

    const alternatePathOptions = [
        ...transitionOptions.map((row) => ({
            ref: row.ref,
            label: row.label,
            description: row.description,
            category: "transition",
            executionSurface: "stage_transition",
            supported: row.supported,
            ...(row.disabledReason ? { disabledReason: row.disabledReason } : {}),
        })),
        ...primaryActionOptions.filter(
            (row) => row.category === "status_lifecycle" && row.supported,
        ),
    ];

    const workTemplateKey = input.workTemplateKey?.trim() ?? null;
    const outcomeOptions: WorkTemplateOutcomeOption[] = (input.stageOutcomes ?? [])
        .filter((row) => {
            const tplKey = row.work_template_key?.trim();
            if (!workTemplateKey) return true;
            if (!tplKey) return true;
            return tplKey === workTemplateKey;
        })
        .map((row) => ({
            ref: row.outcome_key,
            label: row.label,
            ...(row.successful === true ? { successful: true } : {}),
        }));

    return {
        primaryActionOptions,
        helpfulActionOptions,
        alternatePathOptions,
        transitionOptions,
        outcomeOptions,
    };
}

/** Resolve transition ref to operator label. */
export function transitionRefLabel(
    transitionRef: string,
    processTransitions: unknown,
): string {
    const ref = transitionRef.trim();
    if (!ref.startsWith("move_to_stage:")) {
        return ref.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    const targetKey = ref.slice("move_to_stage:".length);
    if (!Array.isArray(processTransitions)) {
        return `Move to ${targetKey.replace(/_/g, " ")}`;
    }
    for (const row of processTransitions) {
        if (row == null || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        if (trimOrNull(record.key) === targetKey) {
            const label =
                trimOrNull(record.label)
                ?? targetKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            return `Move to ${label}`;
        }
    }
    return `Move to ${targetKey.replace(/_/g, " ")}`;
}
