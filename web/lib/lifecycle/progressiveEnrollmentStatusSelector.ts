/**
 * Progressive enrollment status selector — current-stage statuses first,
 * then "Move to another stage…" with valid statuses per target stage.
 */

import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import type { StatusOptionVm } from "@/lib/adminV2/viewModel/drawer/types";
import { isExcludedFromProcessStageGrouping } from "@/lib/businessProcesses/processStageMetadata";
import { resolveStatusProcessStageAssignment } from "@/lib/businessProcesses/resolveStatusProcessStageAssignment";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

export type ProgressiveStatusMenuItem =
    | { kind: "status"; status_key: string; label: string; sort_order: number }
    | { kind: "separator"; label: string }
    | { kind: "stage_heading"; stage_key: string; label: string };

export function buildProgressiveEnrollmentStatusMenu(params: {
    statusDefs: StatusDefinitionRow[];
    currentStatusKey: string;
    configuredStages: LifecycleBuilderStageRecord[];
}): ProgressiveStatusMenuItem[] {
    const activeDefs = params.statusDefs.filter((d) => d.is_active);
    const stages = [...params.configuredStages]
        .filter((s) => s.is_active)
        .sort((a, b) => a.sort_order - b.sort_order);
    const stageKeys = stages.map((s) => s.key);

    const currentAssignment = resolveStatusProcessStageAssignment(
        params.currentStatusKey,
        activeDefs.find((d) => d.status_key === params.currentStatusKey)?.metadata ?? null,
        stageKeys,
    );
    const currentStageKey = currentAssignment.stage ?? stageKeys[0] ?? null;

    const byStage = new Map<string, StatusOptionVm[]>();
    for (const def of activeDefs) {
        const meta =
            def.metadata !== null && typeof def.metadata === "object" && !Array.isArray(def.metadata)
                ? (def.metadata as Record<string, unknown>)
                : null;
        const assignment = resolveStatusProcessStageAssignment(def.status_key, meta, stageKeys);
        if (!assignment.stage || assignment.source === "unassigned") continue;
        const label = String(def.status_label ?? def.status_key).trim() || def.status_key;
        const row: StatusOptionVm = {
            status_key: def.status_key,
            label,
            sort_order: def.sort_order ?? 0,
        };
        const bucket = byStage.get(assignment.stage) ?? [];
        bucket.push(row);
        byStage.set(assignment.stage, bucket);
    }

    for (const [, rows] of byStage) {
        rows.sort((a, b) =>
            a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.label.localeCompare(b.label),
        );
    }

    const menu: ProgressiveStatusMenuItem[] = [];
    if (currentStageKey && byStage.has(currentStageKey)) {
        for (const row of byStage.get(currentStageKey)!) {
            menu.push({ kind: "status", ...row });
        }
    }

    const otherStages = stages.filter((s) => s.key !== currentStageKey);
    if (otherStages.length > 0) {
        menu.push({ kind: "separator", label: "Move to another stage…" });
        for (const stage of otherStages) {
            const stageStatuses = byStage.get(stage.key) ?? [];
            if (!stageStatuses.length) continue;
            menu.push({ kind: "stage_heading", stage_key: stage.key, label: stage.label });
            for (const row of stageStatuses) {
                menu.push({ kind: "status", ...row });
            }
        }
    }

    if (!menu.length) {
        for (const def of activeDefs) {
            const label = String(def.status_label ?? def.status_key).trim() || def.status_key;
            menu.push({
                kind: "status",
                status_key: def.status_key,
                label,
                sort_order: def.sort_order ?? 0,
            });
        }
    }

    return menu;
}

export function progressiveMenuToFlatOptions(menu: ProgressiveStatusMenuItem[]): StatusOptionVm[] {
    return menu
        .filter((item): item is Extract<ProgressiveStatusMenuItem, { kind: "status" }> => item.kind === "status")
        .map((item) => ({
            status_key: item.status_key,
            label: item.label,
            sort_order: item.sort_order,
        }));
}

export function isProgressiveEnrollmentStatusEnabled(
    configuredStages: LifecycleBuilderStageRecord[] | null | undefined,
): boolean {
    return Boolean(configuredStages?.filter((s) => s.is_active).length);
}

/** Stage keys that should not appear in progressive grouping. */
export function isExcludedFromProgressiveGrouping(metadata: Record<string, unknown> | null): boolean {
    return isExcludedFromProcessStageGrouping(metadata);
}
