/**
 * Grain-aware count labels for work-unit queue UI (Card 7).
 * Config-driven from queue_definition v2 `grain` / `domain` / `overlay` — no hardcoded domain lists.
 */

import type { QueueGrain } from "@/lib/config/queueDefinitionV2Runtime";
import type { NormalizedQueueDefinitionDocument, NormalizedQueueEntry } from "@/lib/config/queueDefinitionV2Runtime";

export type QueueGrainPresentationInput = {
    grain?: QueueGrain | string | null;
    domain?: string | null;
    overlay?: boolean | null;
    queueKey?: string | null;
    queueLabel?: string | null;
};

export type QueueCountUnit = {
    /** Plural count noun shown beside badges / KPI units: "families", "children", … */
    unit: string;
    /** Singular when count === 1 */
    unitSingular: string;
    /** Phrase for tooltips / lane captions, e.g. "children on waitlist" */
    countPhrase: string;
};

const VALID_GRAINS = new Set<string>(["case", "child", "candidate"]);

function normalizeGrain(raw: unknown): QueueGrain | null {
    if (typeof raw !== "string") return null;
    const g = raw.trim();
    return VALID_GRAINS.has(g) ? (g as QueueGrain) : null;
}

/**
 * Resolve operator-facing count unit from v2 metadata.
 * Unknown grain → families (case-shaped queues).
 */
export function resolveQueueCountUnit(input: QueueGrainPresentationInput): QueueCountUnit {
    if (input.overlay === true) {
        return { unit: "items", unitSingular: "item", countPhrase: "items" };
    }

    const grain = normalizeGrain(input.grain);
    const domain = (input.domain ?? "").trim().toLowerCase();

    if (grain === "candidate") {
        if (domain === "waitlist") {
            return {
                unit: "children",
                unitSingular: "child",
                countPhrase: "children on waitlist",
            };
        }
        return {
            unit: "entries",
            unitSingular: "entry",
            countPhrase: "entries",
        };
    }

    if (grain === "child") {
        return {
            unit: "children",
            unitSingular: "child",
            countPhrase: "children",
        };
    }

    return {
        unit: "families",
        unitSingular: "family",
        countPhrase: "families",
    };
}

export function formatQueueCountLabel(count: number, input: QueueGrainPresentationInput): string {
    const n = Math.max(0, Math.floor(count));
    const { unit, unitSingular } = resolveQueueCountUnit(input);
    const word = n === 1 ? unitSingular : unit;
    return `${n} ${word}`;
}

export function formatQueueCountAriaLabel(
    count: number | string,
    queueLabel: string | undefined,
    input: QueueGrainPresentationInput
): string {
    const label = queueLabel?.trim() || input.queueKey?.trim() || "Queue";
    if (count === "—" || count === "emdash") return `${label}: count unavailable`;
    if (typeof count !== "number" || !Number.isFinite(count)) return label;
    const n = Math.max(0, Math.floor(count));
    const { unit, unitSingular, countPhrase } = resolveQueueCountUnit(input);
    const word = n === 1 ? unitSingular : unit;
    const domain = (input.domain ?? "").trim().toLowerCase();
    if (domain === "waitlist" && normalizeGrain(input.grain) === "candidate") {
        return `${label}: ${n} ${word} on waitlist`;
    }
    if (input.overlay === true) {
        return `${label}: ${n} ${n === 1 ? unitSingular : unit}`;
    }
    return `${label}: ${n} ${word} (${countPhrase})`;
}

export function queueSummaryToGrainPresentation(summary: {
    key: string;
    label?: string;
    grain?: QueueGrain;
    domain?: string;
    overlay?: boolean;
}): QueueGrainPresentationInput {
    return {
        queueKey: summary.key,
        queueLabel: summary.label,
        grain: summary.grain,
        domain: summary.domain,
        overlay: summary.overlay,
    };
}

export function grainPresentationFromNormalizedEntry(
    entry: NormalizedQueueEntry | null | undefined,
    queueLabel?: string
): QueueGrainPresentationInput {
    if (!entry) return { queueKey: null, queueLabel };
    return {
        queueKey: entry.key,
        queueLabel: queueLabel ?? entry.label,
        grain: entry.grain,
        domain: entry.domain,
        overlay: entry.overlay,
    };
}

/** Merge API summary metadata with config entry when runtime summary omits grain (v1 compat path). */
export function resolveQueueGrainPresentation(
    summary: {
        key: string;
        label?: string;
        grain?: QueueGrain;
        domain?: string;
        overlay?: boolean;
    },
    normalized: NormalizedQueueDefinitionDocument | null | undefined
): QueueGrainPresentationInput & { grain?: QueueGrain; domain?: string; overlay?: boolean } {
    const entry = normalized?.queues.find((q) => q.key === summary.key) ?? null;
    const grainRaw = summary.grain ?? entry?.grain;
    return {
        queueKey: summary.key,
        queueLabel: summary.label ?? entry?.label,
        grain: normalizeGrain(grainRaw) ?? undefined,
        domain: summary.domain ?? entry?.domain,
        overlay: summary.overlay ?? entry?.overlay,
    };
}

export type QueueCountBadgePresentation = {
    countUnit: string;
    countAriaLabel: string;
    laneCountCaption: string;
};

export function buildQueueCountBadgePresentation(
    count: number | null | undefined,
    queueLabel: string | undefined,
    input: QueueGrainPresentationInput
): QueueCountBadgePresentation | null {
    if (count == null || !Number.isFinite(count)) return null;
    const n = Math.max(0, Math.floor(count));
    const unit = resolveQueueCountUnit(input);
    return {
        countUnit: unit.unit,
        countAriaLabel: formatQueueCountAriaLabel(n, queueLabel, input),
        laneCountCaption: formatQueueCountLabel(n, input),
    };
}
