/**
 * Work-unit queue pill lane prefetch — valid keys only, neighbors + lifecycle siblings.
 */
import { resolveWorkUnitFetchQueueKeyFromPill } from "@/lib/adminV2/workUnitQueueSelection";
import { listExecutableQueueKeysForWorkUnit } from "@/lib/lifecycle/lifecycleActiveWorkUnitSelection";
import {
    isLifecycleWorkUnitNavChipKey,
    LIFECYCLE_NEEDS_ATTENTION_PLACEHOLDER_CHIP_KEY,
    resolveLifecycleWorkUnitPrimaryQueueKey,
} from "@/lib/lifecycle/lifecycleWorkUnitShellPills";

export type WorkUnitLanePrefetchTarget = {
    workUnitId: string;
    pillKey: string;
};

export type WorkUnitRowForPrefetch = {
    id: string;
    queue_definition?: unknown;
    metadata?: unknown;
};

/** Pick adjacent work-unit queue filter pill keys for background row prefetch. */
export function adjacentWorkUnitQueuePillKeys(
    summaries: ReadonlyArray<{ key: string }>,
    selectedKey: string | null,
    cap = 3
): string[] {
    if (!summaries.length || cap <= 0) return [];
    const keys = summaries.map((s) => String(s.key ?? "").trim()).filter(Boolean);
    if (!keys.length) return [];

    const active = selectedKey?.trim() || keys[0];
    const idx = keys.indexOf(active);
    if (idx < 0) {
        return keys.slice(0, cap);
    }

    const out: string[] = [];
    const add = (key: string) => {
        if (!key || key === active || out.includes(key)) return;
        out.push(key);
    };

    for (let d = 1; d < keys.length && out.length < cap; d++) {
        if (idx - d >= 0) add(keys[idx - d]!);
        if (out.length >= cap) break;
        if (idx + d < keys.length) add(keys[idx + d]!);
    }

    return out.slice(0, cap);
}

/** Flatten visible header pill keys (pipeline + expanded needs-attention bucket pills). */
export function flattenWorkUnitVisibleQueuePillKeys(
    sections: ReadonlyArray<{ queues: ReadonlyArray<{ key: string }> }> | null | undefined
): string[] {
    if (!sections?.length) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const sec of sections) {
        for (const q of sec.queues) {
            const k = String(q.key ?? "").trim();
            if (!k || seen.has(k)) continue;
            seen.add(k);
            out.push(k);
        }
    }
    return out;
}

/** Neighbor/visible pill keys to warm after above-fold reveal (not including the active pill). */
export function workUnitQueuePillPrefetchTargets(
    visiblePillKeys: readonly string[],
    selectedPillKey: string | null,
    cap = 6
): string[] {
    if (!visiblePillKeys.length || cap <= 0) return [];
    return adjacentWorkUnitQueuePillKeys(
        visiblePillKeys.map((key) => ({ key })),
        selectedPillKey,
        cap
    );
}

/** True when a pill key resolves to an executable queue lane for the given work unit. */
export function isPrefetchableWorkUnitQueuePillKey(
    pillKey: string,
    workUnit: { queue_definition?: unknown } | null | undefined
): boolean {
    const key = pillKey.trim();
    if (!key) return false;
    if (isLifecycleWorkUnitNavChipKey(key)) return false;
    if (key === LIFECYCLE_NEEDS_ATTENTION_PLACEHOLDER_CHIP_KEY) return false;

    const resolved = resolveWorkUnitFetchQueueKeyFromPill(
        key,
        "",
        workUnit?.queue_definition != null ? { queue_definition: workUnit.queue_definition } : undefined
    );
    const apiKey = resolved.queueKey.trim();
    if (!apiKey) return false;

    const validKeys = workUnit ? listExecutableQueueKeysForWorkUnit(workUnit) : [];
    if (workUnit?.queue_definition != null && validKeys.length === 0) return false;
    if (validKeys.length === 0) return Boolean(apiKey);
    return validKeys.includes(apiKey);
}

/** Filter visible pill keys to executable lanes only — prevents 404 prefetches. */
export function filterPrefetchableWorkUnitQueuePillKeys(
    pillKeys: readonly string[],
    workUnit: { queue_definition?: unknown } | null | undefined,
    selectedPillKey?: string | null
): string[] {
    const selected = selectedPillKey?.trim() || "";
    return pillKeys.filter(
        (pillKey) =>
            pillKey.trim() !== selected && isPrefetchableWorkUnitQueuePillKey(pillKey, workUnit)
    );
}

/** Background warm targets: same-WU neighbors; lifecycle siblings optional (Pass 3: defer siblings). */
export function workUnitLanePrefetchTargets(params: {
    visiblePillKeys: readonly string[];
    selectedPillKey: string | null;
    workUnit: WorkUnitRowForPrefetch | null;
    lifecycleSiblings?: ReadonlyArray<WorkUnitRowForPrefetch> | null;
    cap?: number;
    includeLifecycleSiblings?: boolean;
}): WorkUnitLanePrefetchTarget[] {
    const cap = params.cap ?? 6;
    const includeLifecycleSiblings = params.includeLifecycleSiblings ?? false;
    const wu = params.workUnit;
    if (!wu?.id?.trim()) return [];

    const out: WorkUnitLanePrefetchTarget[] = [];
    const seen = new Set<string>();
    const add = (workUnitId: string, pillKey: string, row: WorkUnitRowForPrefetch | null) => {
        const sig = `${workUnitId}|${pillKey}`;
        if (seen.has(sig)) return;
        if (!isPrefetchableWorkUnitQueuePillKey(pillKey, row)) return;
        seen.add(sig);
        out.push({ workUnitId, pillKey });
    };

    const neighborPills = workUnitQueuePillPrefetchTargets(
        filterPrefetchableWorkUnitQueuePillKeys(params.visiblePillKeys, wu, params.selectedPillKey),
        params.selectedPillKey,
        cap
    );
    for (const pillKey of neighborPills) {
        add(wu.id, pillKey, wu);
        if (out.length >= cap) return out;
    }

    if (!includeLifecycleSiblings) {
        return out.slice(0, cap);
    }

    for (const sibling of params.lifecycleSiblings ?? []) {
        if (!sibling.id?.trim() || sibling.id === wu.id) continue;
        const primary = resolveLifecycleWorkUnitPrimaryQueueKey(sibling);
        if (!primary) continue;
        add(sibling.id, primary, sibling);
        if (out.length >= cap) return out;
    }

    return out.slice(0, cap);
}

/** Max concurrent background row prefetches per scheduling tick. */
export const WORK_UNIT_QUEUE_PILL_PREFETCH_CONCURRENCY = 2;

/** Prefetch every visible executable pill (excluding active) after above-fold reveal. */
export function allVisibleWorkUnitLanePrefetchTargets(params: {
    visiblePillKeys: readonly string[];
    selectedPillKey: string | null;
    workUnit: WorkUnitRowForPrefetch | null;
}): WorkUnitLanePrefetchTarget[] {
    const wu = params.workUnit;
    if (!wu?.id?.trim() || !params.visiblePillKeys.length) return [];

    const selected = params.selectedPillKey?.trim() || "";
    const out: WorkUnitLanePrefetchTarget[] = [];
    const seen = new Set<string>();

    for (const pillKey of params.visiblePillKeys) {
        const key = pillKey.trim();
        if (!key || key === selected) continue;
        const sig = `${wu.id}|${key}`;
        if (seen.has(sig)) continue;
        if (!isPrefetchableWorkUnitQueuePillKey(key, wu)) continue;
        seen.add(sig);
        out.push({ workUnitId: wu.id, pillKey: key });
    }

    return out;
}
