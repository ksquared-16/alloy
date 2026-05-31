import { tryLoadWorkUnitQueueDefinitionBundle, type NormalizedQueueEntry } from "@/lib/config/queueDefinitionV2Runtime";
import { parsePlacementPriorityLayer } from "@/lib/orchestration/placement/placementConfigSchema";

export type WaitlistRankingPolicyWorkUnitRow = {
    id: string;
    key: string;
    name: string;
    metadata?: unknown;
    queue_definition?: unknown;
};

const ENROLLMENT_PIPELINE_KEY = "enrollment_pipeline";

function readPlacementPriorityRaw(metadata: unknown): unknown {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
    return (metadata as Record<string, unknown>).placement_priority_v1;
}

export function workUnitHasPlacementPriorityMetadata(metadata: unknown): boolean {
    return readPlacementPriorityRaw(metadata) != null;
}

function queueEntrySupportsWaitlistRanking(entry: NormalizedQueueEntry): boolean {
    const key = entry.key.trim().toLowerCase();
    if (key === "waitlist" || key === "waitlisted") return true;
    if (entry.domain?.trim().toLowerCase() === "waitlist") return true;
    return entry.aliases.some((alias) => {
        const a = alias.trim().toLowerCase();
        return a === "waitlist" || a === "waitlisted";
    });
}

export function workUnitSupportsWaitlistQueue(queue_definition: unknown): boolean {
    const bundle = tryLoadWorkUnitQueueDefinitionBundle(queue_definition);
    if (!bundle) return false;
    return bundle.normalized.queues.some(queueEntrySupportsWaitlistRanking);
}

export function isWaitlistRankingEligibleWorkUnit(wu: WaitlistRankingPolicyWorkUnitRow): boolean {
    const key = wu.key.trim().toLowerCase();
    if (key === ENROLLMENT_PIPELINE_KEY) return true;
    if (workUnitHasPlacementPriorityMetadata(wu.metadata)) return true;
    if (workUnitSupportsWaitlistQueue(wu.queue_definition)) return true;
    return false;
}

export function filterWaitlistRankingEligibleWorkUnits(
    rows: readonly WaitlistRankingPolicyWorkUnitRow[]
): WaitlistRankingPolicyWorkUnitRow[] {
    return rows.filter(isWaitlistRankingEligibleWorkUnit);
}

export function pickDefaultWaitlistRankingWorkUnitId(
    eligible: readonly WaitlistRankingPolicyWorkUnitRow[],
    previousId?: string
): string {
    if (previousId && eligible.some((w) => w.id === previousId)) return previousId;
    const pipeline = eligible.find((w) => w.key.trim().toLowerCase() === ENROLLMENT_PIPELINE_KEY);
    if (pipeline) return pipeline.id;
    const enabled = eligible.find((w) => parsePlacementPriorityLayer(w.metadata)?.enabled);
    if (enabled) return enabled.id;
    return eligible[0]?.id ?? "";
}
