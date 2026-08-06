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
import type { PerspectiveConfigV1Stored } from "@/lib/lifecycle/perspectiveConfigV1";
import { parsePerspectivesV1 } from "@/lib/lifecycle/perspectiveConfigV1";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import { parseWorkViewsV1 } from "@/lib/lifecycle/workViewsConfigV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { EnrollmentManualTransitionPolicyV1 } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionPolicy";
import { parseEnrollmentManualTransitionPolicy } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionPolicy";
import { parseStatusRollupV1, type StatusRollupV1 } from "@/lib/lifecycle/statusRollupV1";
import { parseStageActionCatalogV1, type StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import {
    emptyProcessCommandSetV1,
    parseProcessCommandSetV1OrNull,
    type BusinessProcessCommandSetV1,
} from "@/lib/lifecycle/processCommandSetV1";
import { tryResolvePlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import { parseParticipationConfigV1, type ParticipationConfigV1 } from "@/lib/process/participationConfig";
import {
    parseStageGrain,
    parseSubjectResolutionStrategy,
    type StageGrain,
    type StageSubjectResolutionStrategy,
} from "@/lib/lifecycle/stageGrainV1";
import { journeySegmentForStageGrain } from "@/lib/lifecycle/grainVocabulary";

import {
    captureUnknownFields,
    serializeWithUnknownFields,
    withUnknownFields,
} from "@/lib/config/preserveUnknownFields";

export const LIFECYCLE_BUILDER_METADATA_KEY = "lifecycle_builder_v1" as const;

/**
 * Keys each level of the builder owns. Anything else was authored by a newer writer and must
 * survive the round trip untouched (Law 1/Law 7 — see configuration-integrity-laws.md).
 */
const BUILDER_OWNED_KEYS = ["version", "active_process_id", "processes"] as const;

const PROCESS_OWNED_KEYS = [
    "id",
    "key",
    "name",
    "description",
    "primary_entity",
    "sort_order",
    "is_active",
    "command_set_v1",
    "tracks_v1",
    "manual_status_transition_policy_v1",
    "work_views_v1",
    "participation_v1",
    "stages",
] as const;

const STAGE_OWNED_KEYS = [
    "id",
    "key",
    "label",
    "description",
    "sort_order",
    "is_active",
    "track_key",
    "queue_membership_v1",
    "status_rollup_v1",
    "stage_operating_plan_v1",
    "perspectives_v1",
    "action_catalog_v1",
    "grain",
    "purpose",
    "parent_stage_key",
    "allow_skipping",
    "operator_guidance",
    "subject_resolution_strategy",
] as const;

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
    /** Category-based status rollup for stage membership (V2). */
    status_rollup_v1?: StatusRollupV1;
    /** Stage work plan + outcome rules (metadata only). */
    stage_operating_plan_v1?: StageOperatingPlanV1;
    /** Queue lane presentation overrides (Configuration Runtime). */
    perspectives_v1?: PerspectiveConfigV1Stored[];
    /** Configured candidate actions and recommendation levels for this stage (BPEP Builder). */
    action_catalog_v1?: StageActionCatalogV1;
    /** V2 Builder — grain determines the queue row subject entity. */
    grain?: StageGrain;
    /** V2 Builder — freeform operator-authored stage purpose. */
    purpose?: string;
    /** V2 Builder — stable key of this stage's parent (for sub-stages). */
    parent_stage_key?: string;
    /** V2 Builder — whether operators can skip this stage. */
    allow_skipping?: boolean;
    /** V2 Builder — guidance text shown to operators while in this stage. */
    operator_guidance?: string;
    /** V2 Builder — how to resolve multi-child subject when action is invoked from family context. */
    subject_resolution_strategy?: StageSubjectResolutionStrategy;
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
    /**
     * Sole target process-wide Command selection authority (P6.S1).
     * When absent, resolveBusinessProcessCommandSelection uses legacy compatibility.
     * Stage action_catalog_v1 remains recommendation/evaluation only.
     */
    command_set_v1?: BusinessProcessCommandSetV1;
    /** Tracks and split rules — template-defined, stored as generic metadata. */
    tracks_v1?: ProcessTracksV1;
    /** Manual Change Enrollment Status transition policy. */
    manual_status_transition_policy_v1?: EnrollmentManualTransitionPolicyV1;
    /** Process-level operational Work Views (Configuration Runtime). */
    work_views_v1?: WorkViewConfigV1Stored[];
    /** Operator-authored Participation definition — the engine reads its contract (Process Builder). */
    participation_v1?: ParticipationConfigV1;
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
            const statusRollup = parseStatusRollupV1(sr.status_rollup_v1);
            const operatingPlan = parseStageOperatingPlanV1(sr.stage_operating_plan_v1);
            const perspectives = parsePerspectivesV1(sr.perspectives_v1);
            const actionCatalog = parseStageActionCatalogV1(sr.action_catalog_v1);
            const track_key = typeof sr.track_key === "string" ? sr.track_key.trim() : undefined;
            stages.push(withUnknownFields({
                id: sid,
                key: skey,
                label,
                description: typeof sr.description === "string" ? sr.description.trim() : undefined,
                sort_order: typeof sr.sort_order === "number" ? sr.sort_order : stages.length,
                is_active: sr.is_active !== false,
                ...(track_key ? { track_key } : {}),
                ...(queueMembership ? { queue_membership_v1: queueMembership } : {}),
                ...(statusRollup ? { status_rollup_v1: statusRollup } : {}),
                ...(operatingPlan ? { stage_operating_plan_v1: operatingPlan } : {}),
                ...(perspectives ? { perspectives_v1: perspectives } : {}),
                ...(actionCatalog ? { action_catalog_v1: actionCatalog } : {}),
                ...(parseStageGrain(sr.grain) ? { grain: parseStageGrain(sr.grain) } : {}),
                ...(typeof sr.purpose === "string" && sr.purpose.trim() ? { purpose: sr.purpose.trim() } : {}),
                ...(typeof sr.parent_stage_key === "string" && sr.parent_stage_key ? { parent_stage_key: sr.parent_stage_key } : {}),
                ...(typeof sr.allow_skipping === "boolean" ? { allow_skipping: sr.allow_skipping } : {}),
                ...(typeof sr.operator_guidance === "string" && sr.operator_guidance ? { operator_guidance: sr.operator_guidance } : {}),
                ...(parseSubjectResolutionStrategy(sr.subject_resolution_strategy) ? { subject_resolution_strategy: parseSubjectResolutionStrategy(sr.subject_resolution_strategy) } : {}),
            }, captureUnknownFields(sr, STAGE_OWNED_KEYS)));
        }
        stages.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
        const tracks_v1 = parseProcessTracksV1(row.tracks_v1) ?? undefined;
        const command_set_v1 = parseProcessCommandSetV1OrNull(row.command_set_v1) ?? undefined;
        const manualPolicy = parseEnrollmentManualTransitionPolicy(row.manual_status_transition_policy_v1);
        const workViews = parseWorkViewsV1(row.work_views_v1);
        const participation = parseParticipationConfigV1(row.participation_v1) ?? undefined;
        processes.push(withUnknownFields({
            id,
            key,
            name,
            primary_entity: row.primary_entity === "opportunity" ? "opportunity" : "opportunity",
            sort_order: typeof row.sort_order === "number" ? row.sort_order : processes.length,
            is_active: row.is_active !== false,
            ...(command_set_v1 ? { command_set_v1 } : {}),
            ...(tracks_v1 ? { tracks_v1 } : {}),
            ...(manualPolicy ? { manual_status_transition_policy_v1: manualPolicy } : {}),
            ...(workViews ? { work_views_v1: workViews } : {}),
            ...(participation ? { participation_v1: participation } : {}),
            stages,
        }, captureUnknownFields(row, PROCESS_OWNED_KEYS)));
    }

    const builderResidue = captureUnknownFields(o, BUILDER_OWNED_KEYS);

    if (!processes.length) {
        const activeRaw = typeof o.active_process_id === "string" ? o.active_process_id.trim() : "";
        // Annotated: without it TS widens the `version: 1` literal to `number` and the object
        // stops matching LifecycleBuilderV1.
        const empty: LifecycleBuilderV1 = {
            version: 1,
            active_process_id: activeRaw || null,
            processes: [],
        };
        return withUnknownFields(empty, builderResidue);
    }

    const activeRaw = typeof o.active_process_id === "string" ? o.active_process_id.trim() : "";
    const active_process_id =
        activeRaw && processes.some((p) => p.id === activeRaw) ? activeRaw : processes[0]!.id;

    const parsed: LifecycleBuilderV1 = { version: 1, active_process_id, processes };
    return withUnknownFields(parsed, builderResidue);
}

/**
 * Serialize the builder back to storable JSON, splicing every level's unowned residue back in.
 * This is the write-side half of Law 7 — without it, parsing is lossless in memory but the
 * database still receives an allowlist-shaped blob.
 */
export function serializeLifecycleBuilderV1(config: LifecycleBuilderV1): Record<string, unknown> {
    const processes = config.processes.map((process) => {
        const stages = process.stages.map((stage) => serializeWithUnknownFields(stage));
        const serialized: Record<string, unknown> = { ...serializeWithUnknownFields(process), stages };
        // Work views carry their own residue and are nested one level deeper than the walk above.
        if (process.work_views_v1) {
            serialized.work_views_v1 = process.work_views_v1.map((view) =>
                serializeWithUnknownFields(view),
            );
        }
        // Participation is the same shape of problem: its parser is an allowlist reconstruction,
        // so its residue rides a carrier one level deeper than this walk reaches. Omitting it
        // meant a participation save silently deleted every field this branch could not name.
        if (process.participation_v1) {
            serialized.participation_v1 = serializeWithUnknownFields(process.participation_v1);
        }
        return serialized;
    });
    return { ...serializeWithUnknownFields(config), processes };
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
    // Serialize rather than embedding the typed record directly: the typed record carries unowned
    // residue on a symbol, which JSON.stringify would silently drop on the way to the database.
    return { ...metadata, [LIFECYCLE_BUILDER_METADATA_KEY]: serializeLifecycleBuilderV1(config) };
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

/**
 * Set a stage's configured journey grain.
 *
 * `grain` was persisted authored configuration with NO authoring path: the enrollment template
 * seeded it from `track_key`, `add_stage` wrote it once, and nothing in the product could correct
 * it afterwards. That is how Firefly's Decision stage came to declare `child` while its own
 * operating plan and the canonical vocabulary both say `family` — a disagreement an operator could
 * see (once the editor surfaced it) but not fix.
 *
 * Idempotent by construction: requesting the grain a stage already has returns the SAME config
 * object, so a no-op save cannot produce an unrelated diff.
 */
export function updateStageGrain(
    config: LifecycleBuilderV1,
    processId: string,
    stageId: string,
    grain: StageGrain
): LifecycleBuilderV1 {
    const process = config.processes.find((p) => p.id === processId);
    if (!process) throw new Error("Process not found");
    const stage = process.stages.find((s) => s.id === stageId);
    if (!stage) throw new Error("Stage not found");
    const planSegment = stage.stage_operating_plan_v1?.journey_segment;
    const alreadyAligned = stage.grain === grain && (planSegment == null || planSegment === grain);
    if (alreadyAligned) return config;

    return {
        ...config,
        processes: config.processes.map((p) => {
            if (p.id !== processId) return p;
            return {
                ...p,
                stages: p.stages.map((s) => {
                    if (s.id !== stageId) return s;
                    // ONE governed save keeps both declarations of the same fact in step. The
                    // product must expose one concept; leaving `journey_segment` authorable while
                    // `grain` was immutable is what let them drift apart in the first place.
                    //
                    // The two vocabularies are NOT the same size, though: `StageGrain` has five
                    // values and `journey_segment` has two. Assigning the grain straight across
                    // could write `person`, `account` or `work_item` into a field whose parser
                    // rejects them — the plan would then fail to parse on the next read and the
                    // stage would silently lose its operating plan. The canonical translator
                    // answers whether the grain HAS a journey segment at all; when it does not,
                    // the grain is still saved and the plan's segment is left exactly as authored
                    // rather than overwritten with a value that cannot exist.
                    const plan = s.stage_operating_plan_v1;
                    const segment = journeySegmentForStageGrain(grain);
                    return {
                        ...s,
                        grain,
                        ...(plan && segment.ok ?
                            { stage_operating_plan_v1: { ...plan, journey_segment: segment.segment } }
                        :   {}),
                    };
                }),
            };
        }),
    };
}

export type EnsureStageTransitionResult = {
    config: LifecycleBuilderV1;
    transition_ref: string;
    target_stage_key: string;
    created: boolean;
};

/**
 * Ensure a stage has an outgoing transition to a destination, creating it only if absent.
 *
 * Transitions were authorable from the stage editor's draft but had no lifecycle-builder ACTION,
 * so a plan whose rules referenced a transition that was never persisted could not be repaired
 * through the canonical save path — which is exactly how Firefly's Lead stage came to reference
 * `lead_to_tour` with `outgoing_transitions: null`.
 *
 * Find-before-create, matching the editor: an existing path to the same destination is reused
 * rather than duplicated. A requested ref is honoured when free; a ref already pointing somewhere
 * else is a collision and throws rather than being silently repointed.
 */
export function ensureStageTransitionInConfig(
    config: LifecycleBuilderV1,
    processId: string,
    sourceStageKey: string,
    targetStageKey: string,
    requestedRef?: string
): EnsureStageTransitionResult {
    const process = config.processes.find((p) => p.id === processId);
    if (!process) throw new Error("Process not found");
    const source = process.stages.find((s) => s.key === sourceStageKey);
    if (!source) throw new Error("Source stage not found");
    const target = process.stages.find((s) => s.key === targetStageKey);
    if (!target) throw new Error("Target stage not found");
    if (source.key === target.key) throw new Error("A stage cannot transition to itself");

    const plan = source.stage_operating_plan_v1;
    const existing = plan?.outgoing_transitions ?? [];
    const ref = requestedRef?.trim() || "";

    // A ref that already exists and points elsewhere is a collision, not a repoint.
    const refHolder = ref ? existing.find((t) => t.transition_ref === ref) : undefined;
    if (refHolder && refHolder.target_stage_key !== target.key) {
        throw new Error(
            `Transition "${ref}" already moves to "${refHolder.target_stage_key}" — ` +
                `it cannot be reused for "${target.key}".`
        );
    }

    const reusable = refHolder ?? existing.find((t) => t.target_stage_key === target.key);
    if (reusable) {
        return {
            config,
            transition_ref: reusable.transition_ref,
            target_stage_key: reusable.target_stage_key,
            created: false,
        };
    }

    const transition_ref = ref || `${source.key}_transition_${existing.length + 1}`;
    const created = {
        transition_ref,
        source_stage_key: source.key,
        target_stage_key: target.key,
        label: `Move to ${target.label || target.key}`,
        available: true,
    };
    const nextPlan = {
        ...(plan ?? {
            version: 1 as const,
            lifecycle_key: process.key,
            stage_key: source.key,
            work_templates: [],
            outcomes: [],
            outcome_rules: [],
            attention_rules: [],
        }),
        outgoing_transitions: [...existing, created],
    } as NonNullable<typeof plan>;

    return {
        config: {
            ...config,
            processes: config.processes.map((p) => {
                if (p.id !== processId) return p;
                return {
                    ...p,
                    stages: p.stages.map((s) =>
                        s.id === source.id ? { ...s, stage_operating_plan_v1: nextPlan } : s
                    ),
                };
            }),
        },
        transition_ref,
        target_stage_key: target.key,
        created: true,
    };
}

export type UpdateProcessCommandSetResult = {
    config: LifecycleBuilderV1;
    commandSet: BusinessProcessCommandSetV1;
    added: string[];
    removed: string[];
    /** Requested keys the canonical registry could not vouch for — nothing was written for these. */
    rejected: Array<{ requested: string; reason: "unregistered" }>;
};

/**
 * Add or remove capabilities in a process's command set.
 *
 * `command_set_v1` was authored configuration with no authoring path: only
 * `ensureBuilderCommandSetsOnSave` ever wrote it, deriving membership automatically from stage
 * action catalogs. A Work Template could therefore reference a capability the process had not
 * selected, publication would refuse it, and no operator surface could resolve the disagreement.
 *
 * Every ADDED key must resolve through `tryResolvePlatformCapability`, and the CANONICAL key is
 * what gets persisted — an alias in, its canonical form stored. A key the registry does not know is
 * rejected with a structured reason rather than written through raw-key fallback, which is exactly
 * how an unimplemented command would otherwise be authorized by accident.
 *
 * Removal is not symmetric: it takes the requested key as given and drops any entry whose canonical
 * form matches, so a capability that has since been de-registered can still be cleaned up.
 */
export function updateProcessCommandSet(
    config: LifecycleBuilderV1,
    processId: string,
    input: { addCapabilityKeys?: readonly string[]; removeCapabilityKeys?: readonly string[] }
): UpdateProcessCommandSetResult {
    const process = config.processes.find((p) => p.id === processId);
    if (!process) throw new Error("Process not found");

    const current = process.command_set_v1 ?? emptyProcessCommandSetV1();
    const commands = [...current.commands];
    const canonicalOf = (key: string): string | null => {
        const resolved = tryResolvePlatformCapability(key);
        return resolved.status === "known" ? resolved.capability.canonicalCommandKey : null;
    };
    const entryCanonical = (key: string) => canonicalOf(key) ?? key.trim();

    const rejected: Array<{ requested: string; reason: "unregistered" }> = [];
    const added: string[] = [];
    const removed: string[] = [];

    for (const requested of input.addCapabilityKeys ?? []) {
        const key = requested.trim();
        if (!key) continue;
        const canonical = canonicalOf(key);
        if (!canonical) {
            rejected.push({ requested: key, reason: "unregistered" });
            continue;
        }
        const existing = commands.find((c) => entryCanonical(c.capability_key) === canonical);
        if (existing) {
            // Idempotent. An explicitly disabled command is NOT silently re-enabled here — that is
            // a different operator intent than "this process uses this capability".
            continue;
        }
        // Appended, so existing ordering is untouched and the result is deterministic.
        commands.push({ capability_key: canonical, enabled: true });
        added.push(canonical);
    }

    for (const requested of input.removeCapabilityKeys ?? []) {
        const key = requested.trim();
        if (!key) continue;
        const target = canonicalOf(key) ?? key;
        const index = commands.findIndex((c) => entryCanonical(c.capability_key) === target);
        if (index < 0) continue; // idempotent no-op
        removed.push(commands[index]!.capability_key);
        commands.splice(index, 1);
    }

    if (!added.length && !removed.length) {
        return { config, commandSet: current, added, removed, rejected };
    }

    const commandSet: BusinessProcessCommandSetV1 = { ...current, version: 1, commands };
    return {
        config: {
            ...config,
            processes: config.processes.map((p) =>
                p.id === processId ? { ...p, command_set_v1: commandSet } : p
            ),
        },
        commandSet,
        added,
        removed,
        rejected,
    };
}
