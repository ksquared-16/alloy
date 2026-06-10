/**
 * Durable lifecycle/process/stage configuration in `departments.metadata.lifecycle_builder_v1`.
 * Operator stage keys remain strings — platform enrollment keys integrate with existing APIs.
 */

import { randomUUID } from "crypto";
import {
    LIFECYCLE_STAGE_LABELS,
    LIFECYCLE_STAGE_ORDER,
    type LifecycleOperatorStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ENROLLMENT_PROCESS_DISPLAY_NAME } from "@/lib/lifecycle/businessProcessUiLabels";
import { parseProcessTracksV1 } from "@/lib/businessProcesses/parseProcessTracksV1";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import type { LifecyclePrimaryEntityKey } from "@/lib/lifecycle/lifecycleConfiguration";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import { parseQueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export const LIFECYCLE_BUILDER_METADATA_KEY = "lifecycle_builder_v1" as const;

export type LifecycleBuilderStageRecord = {
    id: string;
    /** Stable slug — platform enrollment stages use known operator keys. */
    key: string;
    label: string;
    description?: string;
    sort_order: number;
    is_active: boolean;
    /** V2 — family_track | child_track when process uses tracks_v1. */
    track_key?: string;
    /** Phase B — subject-grain queue membership metadata (optional until configured). */
    queue_membership_v1?: QueueMembershipV1;
    /** Stage work plan + outcome rules (metadata only). */
    stage_operating_plan_v1?: StageOperatingPlanV1;
};

export type LifecycleBuilderProcessRecord = {
    id: string;
    key: string;
    name: string;
    /** Shown on /workspace department tile when synced to departments.description. */
    description?: string;
    primary_entity: LifecyclePrimaryEntityKey;
    sort_order: number;
    is_active: boolean;
    /** Tracks and split rules — template-defined, stored as generic metadata. */
    tracks_v1?: ProcessTracksV1;
    stages: LifecycleBuilderStageRecord[];
};

export type LifecycleBuilderV1 = {
    version: 1;
    active_process_id: string | null;
    processes: LifecycleBuilderProcessRecord[];
};

const KEY_REGEX = /^[a-z][a-z0-9_]{1,48}$/;

export function slugifyLifecycleKey(raw: string): string {
    const s = raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
    if (!s) return `stage_${randomUUID().slice(0, 8)}`;
    return KEY_REGEX.test(s) ? s : `stage_${s.slice(0, 40)}`;
}

export function emptyLifecycleBuilderV1(): LifecycleBuilderV1 {
    return { version: 1, active_process_id: null, processes: [] };
}

/** Empty enrollment process shell — operators apply V2 template or add stages in Settings. */
export function defaultLifecycleBuilderV1(): LifecycleBuilderV1 {
    const processId = randomUUID();
    return {
        version: 1,
        active_process_id: processId,
        processes: [
            {
                id: processId,
                key: ENROLLMENT_PROCESS_KEY,
                name: ENROLLMENT_PROCESS_DISPLAY_NAME,
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                stages: [],
            },
        ],
    };
}

export function parseLifecycleBuilderV1(raw: unknown): LifecycleBuilderV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return null;
    if (!Array.isArray(o.processes)) return null;

    const processes: LifecycleBuilderProcessRecord[] = [];
    for (const p of o.processes) {
        if (p == null || typeof p !== "object" || Array.isArray(p)) continue;
        const row = p as Record<string, unknown>;
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const key = typeof row.key === "string" ? row.key.trim() : "";
        const name = typeof row.name === "string" ? row.name.trim() : "";
        if (!id || !key || !name) continue;
        const stagesRaw = Array.isArray(row.stages) ? row.stages : [];
        const stages: LifecycleBuilderStageRecord[] = [];
        for (const s of stagesRaw) {
            if (s == null || typeof s !== "object" || Array.isArray(s)) continue;
            const sr = s as Record<string, unknown>;
            const sid = typeof sr.id === "string" ? sr.id.trim() : "";
            const skey = typeof sr.key === "string" ? sr.key.trim() : "";
            const label = typeof sr.label === "string" ? sr.label.trim() : "";
            if (!sid || !skey || !label) continue;
            const queueMembership = parseQueueMembershipV1(sr.queue_membership_v1);
            const operatingPlan = parseStageOperatingPlanV1(sr.stage_operating_plan_v1);
            const track_key = typeof sr.track_key === "string" ? sr.track_key.trim() : undefined;
            stages.push({
                id: sid,
                key: skey,
                label,
                description: typeof sr.description === "string" ? sr.description.trim() : undefined,
                sort_order: typeof sr.sort_order === "number" ? sr.sort_order : stages.length,
                is_active: sr.is_active !== false,
                ...(track_key ? { track_key } : {}),
                ...(queueMembership ? { queue_membership_v1: queueMembership } : {}),
                ...(operatingPlan ? { stage_operating_plan_v1: operatingPlan } : {}),
            });
        }
        stages.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
        const tracks_v1 = parseProcessTracksV1(row.tracks_v1) ?? undefined;
        processes.push({
            id,
            key,
            name,
            primary_entity: row.primary_entity === "opportunity" ? "opportunity" : "opportunity",
            sort_order: typeof row.sort_order === "number" ? row.sort_order : processes.length,
            is_active: row.is_active !== false,
            ...(tracks_v1 ? { tracks_v1 } : {}),
            stages,
        });
    }

    if (!processes.length) {
        const activeRaw = typeof o.active_process_id === "string" ? o.active_process_id.trim() : "";
        return { version: 1, active_process_id: activeRaw || null, processes: [] };
    }

    const activeRaw = typeof o.active_process_id === "string" ? o.active_process_id.trim() : "";
    const active_process_id =
        activeRaw && processes.some((p) => p.id === activeRaw) ? activeRaw : processes[0]!.id;

    return { version: 1, active_process_id, processes };
}

export function lifecycleBuilderFromDepartmentMetadata(metadata: unknown): LifecycleBuilderV1 {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
        return emptyLifecycleBuilderV1();
    }
    const nested = (metadata as Record<string, unknown>)[LIFECYCLE_BUILDER_METADATA_KEY];
    return parseLifecycleBuilderV1(nested) ?? emptyLifecycleBuilderV1();
}

export function mergeLifecycleBuilderIntoMetadata(
    metadata: Record<string, unknown>,
    config: LifecycleBuilderV1
): Record<string, unknown> {
    return { ...metadata, [LIFECYCLE_BUILDER_METADATA_KEY]: config };
}

export function activeLifecycleProcess(config: LifecycleBuilderV1): LifecycleBuilderProcessRecord | null {
    if (!config.active_process_id) return null;
    const found = config.processes.find((p) => p.id === config.active_process_id && p.is_active);
    return found ?? config.processes.find((p) => p.is_active) ?? null;
}

export function activeStagesForProcess(process: LifecycleBuilderProcessRecord): LifecycleBuilderStageRecord[] {
    return [...process.stages].filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);
}

export function stageKeysForProcess(process: LifecycleBuilderProcessRecord): string[] {
    return activeStagesForProcess(process).map((s) => s.key);
}

export function isOperatorStageKey(key: string): key is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(key);
}

export function asOperatorStageKey(key: string): LifecycleOperatorStage | null {
    return isOperatorStageKey(key) ? key : null;
}

export function createLifecycleProcess(
    name: string,
    config: LifecycleBuilderV1,
    opts?: { primary_entity?: LifecyclePrimaryEntityKey; description?: string }
): LifecycleBuilderV1 {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Lifecycle name is required");
    const description = opts?.description?.trim() || undefined;
    const id = randomUUID();
    const key = slugifyLifecycleKey(trimmed);
    const existingKeys = new Set(config.processes.map((p) => p.key));
    let uniqueKey = key;
    let n = 2;
    while (existingKeys.has(uniqueKey)) {
        uniqueKey = `${key}_${n}`;
        n++;
    }
    const process: LifecycleBuilderProcessRecord = {
        id,
        key: uniqueKey,
        name: trimmed,
        description,
        primary_entity: opts?.primary_entity ?? "opportunity",
        sort_order: config.processes.length,
        is_active: true,
        stages: [],
    };
    return {
        ...config,
        active_process_id: id,
        processes: [...config.processes, process],
    };
}

export function updateProcessName(config: LifecycleBuilderV1, processId: string, name: string): LifecycleBuilderV1 {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Lifecycle name is required");
    return {
        ...config,
        processes: config.processes.map((p) => (p.id === processId ? { ...p, name: trimmed } : p)),
    };
}

export function updateProcessDescription(
    config: LifecycleBuilderV1,
    processId: string,
    description: string
): LifecycleBuilderV1 {
    const trimmed = description.trim();
    return {
        ...config,
        processes: config.processes.map((p) =>
            p.id === processId ? { ...p, description: trimmed || undefined } : p
        ),
    };
}

/** Max length for lifecycle description (workspace tile). */
export const LIFECYCLE_DESCRIPTION_MAX_CHARS = 120 as const;

export function clampLifecycleDescription(input: string): string {
    return input.trim().slice(0, LIFECYCLE_DESCRIPTION_MAX_CHARS);
}

/** Workspace tile copy from lifecycle builder process (minimal fallback when empty). */
export function lifecycleWorkspaceTileDescription(
    processDescription: string | undefined | null,
    lifecycleName: string
): string {
    const fromProcess = clampLifecycleDescription(processDescription ?? "");
    if (fromProcess) return fromProcess;
    const name = lifecycleName.trim();
    return name || "Configured lifecycle workspace.";
}

export function addStageToProcess(
    config: LifecycleBuilderV1,
    processId: string,
    label: string,
    opts?: { description?: string; track_key?: string }
): LifecycleBuilderV1 {
    const trimmed = label.trim() || "New stage";
    const description = opts?.description?.trim() || undefined;
    const track_key = opts?.track_key?.trim() || undefined;
    const keyBase = slugifyLifecycleKey(trimmed);
    return {
        ...config,
        processes: config.processes.map((p) => {
            if (p.id !== processId) return p;
            const keys = new Set(p.stages.map((s) => s.key));
            let key = keyBase;
            let n = 2;
            while (keys.has(key)) {
                key = `${keyBase}_${n}`;
                n++;
            }
            const sort_order = p.stages.length ? Math.max(...p.stages.map((s) => s.sort_order)) + 1 : 0;
            return {
                ...p,
                stages: [
                    ...p.stages,
                    {
                        id: randomUUID(),
                        key,
                        label: trimmed,
                        description,
                        sort_order,
                        is_active: true,
                        ...(track_key ? { track_key } : {}),
                    },
                ],
            };
        }),
    };
}

export function updateStageDescription(
    config: LifecycleBuilderV1,
    processId: string,
    stageId: string,
    description: string
): LifecycleBuilderV1 {
    const trimmed = description.trim();
    return {
        ...config,
        processes: config.processes.map((p) => {
            if (p.id !== processId) return p;
            return {
                ...p,
                stages: p.stages.map((s) =>
                    s.id === stageId ? { ...s, description: trimmed || undefined } : s
                ),
            };
        }),
    };
}

export function renameStage(
    config: LifecycleBuilderV1,
    processId: string,
    stageId: string,
    label: string
): LifecycleBuilderV1 {
    const trimmed = label.trim();
    if (!trimmed) throw new Error("Stage name is required");
    return {
        ...config,
        processes: config.processes.map((p) => {
            if (p.id !== processId) return p;
            return {
                ...p,
                stages: p.stages.map((s) => (s.id === stageId ? { ...s, label: trimmed } : s)),
            };
        }),
    };
}

export function reorderStage(
    config: LifecycleBuilderV1,
    processId: string,
    stageId: string,
    direction: "up" | "down"
): LifecycleBuilderV1 {
    return {
        ...config,
        processes: config.processes.map((p) => {
            if (p.id !== processId) return p;
            const stages = activeStagesForProcess(p);
            const idx = stages.findIndex((s) => s.id === stageId);
            if (idx < 0) return p;
            const swapIdx = direction === "up" ? idx - 1 : idx + 1;
            if (swapIdx < 0 || swapIdx >= stages.length) return p;
            const reordered = [...stages];
            const tmp = reordered[idx]!;
            reordered[idx] = reordered[swapIdx]!;
            reordered[swapIdx] = tmp;
            const withOrder = reordered.map((s, i) => ({ ...s, sort_order: i }));
            const inactive = p.stages.filter((s) => !s.is_active);
            return { ...p, stages: [...withOrder, ...inactive] };
        }),
    };
}

export function removeProcessFromConfig(config: LifecycleBuilderV1, processId: string): LifecycleBuilderV1 {
    const processes = config.processes.filter((p) => p.id !== processId);
    const active_process_id =
        config.active_process_id && processes.some((p) => p.id === config.active_process_id)
            ? config.active_process_id
            : processes[0]?.id ?? null;
    return { ...config, processes, active_process_id };
}

export function removeStageFromProcess(
    config: LifecycleBuilderV1,
    processId: string,
    stageId: string
): LifecycleBuilderV1 {
    return {
        ...config,
        processes: config.processes.map((p) => {
            if (p.id !== processId) return p;
            return { ...p, stages: p.stages.filter((s) => s.id !== stageId) };
        }),
    };
}

export function setActiveProcess(config: LifecycleBuilderV1, processId: string | null): LifecycleBuilderV1 {
    if (processId === null) {
        return { ...config, active_process_id: null };
    }
    if (!config.processes.some((p) => p.id === processId)) {
        throw new Error("Lifecycle not found");
    }
    return { ...config, active_process_id: processId };
}

export function findStage(
    process: LifecycleBuilderProcessRecord,
    stageKey: string
): LifecycleBuilderStageRecord | null {
    return process.stages.find((s) => s.key === stageKey && s.is_active) ?? null;
}

/** Stage keys allowed for status / requirements APIs for a department. */
export function configuredStageKeysForMetadata(metadata: unknown): string[] {
    const config = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = activeLifecycleProcess(config);
    if (!process) return [];
    return stageKeysForProcess(process);
}

export function isConfiguredStageKey(metadata: unknown, stageKey: string): boolean {
    return configuredStageKeysForMetadata(metadata).includes(stageKey);
}
