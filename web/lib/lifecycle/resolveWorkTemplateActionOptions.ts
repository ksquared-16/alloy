/**
 * Pure option resolver for Work Template action configuration in /processes editor.
 *
 * Delegates to canonical intent-level options — generic umbrellas and grain duplicates
 * are merged or hidden before reaching the editor.
 */

import {
    formatCanonicalActionOptionDescription,
    resolveCanonicalTransitionOptions,
    resolveCanonicalWorkTemplateActionOptions,
    resolveCanonicalWorkTemplateAlternatePathOptions,
    type CanonicalWorkTemplateActionOption,
} from "@/lib/lifecycle/resolveCanonicalWorkTemplateActionOptions";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";

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

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text.length > 0 ? text : null;
}

function toWorkTemplateActionOption(row: CanonicalWorkTemplateActionOption): WorkTemplateActionOption {
    return {
        ref: row.ref,
        label: row.label,
        description: formatCanonicalActionOptionDescription(row),
        category: row.category,
        executionSurface: row.executionSurface,
        supported: row.supported,
        ...(row.disabledReason ? { disabledReason: row.disabledReason } : {}),
    };
}

function buildTransitionOptions(processTransitions: unknown, stageKey: string): WorkTemplateTransitionOption[] {
    return resolveCanonicalTransitionOptions({ processTransitions, stageKey }).map((row) => ({
        ref: row.ref,
        label: row.label,
        description: row.description,
        targetStageKey: row.ref.startsWith("move_to_stage:") ? row.ref.slice("move_to_stage:".length) : undefined,
        supported: row.supported,
        ...(row.disabledReason ? { disabledReason: row.disabledReason } : {}),
    }));
}

export function resolveWorkTemplateActionOptions(input: {
    actionRegistry: unknown;
    stageActionCatalog?: StageActionCatalogV1 | null;
    processTransitions: unknown;
    stageKey: string;
    stageOutcomes?: Array<{ outcome_key: string; label: string; work_template_key?: string | null; successful?: boolean }>;
    workTemplateKey?: string | null;
    processDefinition?: unknown;
    stageDefinition?: unknown;
}): {
    primaryActionOptions: WorkTemplateActionOption[];
    helpfulActionOptions: WorkTemplateActionOption[];
    alternatePathOptions: WorkTemplateActionOption[];
    transitionOptions: WorkTemplateTransitionOption[];
    outcomeOptions: WorkTemplateOutcomeOption[];
} {
    const canonicalInput = {
        processDefinition: input.processDefinition,
        stageDefinition: input.stageDefinition,
        actionRegistry: input.actionRegistry,
        stageActionCatalog: input.stageActionCatalog ?? null,
        processTransitions: input.processTransitions,
        stageKey: input.stageKey,
    };

    const primaryActionOptions = resolveCanonicalWorkTemplateActionOptions(canonicalInput).map(toWorkTemplateActionOption);

    const helpfulActionOptions = resolveCanonicalWorkTemplateActionOptions(canonicalInput).map(toWorkTemplateActionOption);

    const transitionOptions = buildTransitionOptions(input.processTransitions, input.stageKey);

    const alternatePathOptions = resolveCanonicalWorkTemplateAlternatePathOptions(canonicalInput).map(
        toWorkTemplateActionOption,
    );

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
