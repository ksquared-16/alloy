import { validateQueueDefinition, type QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { findAllRecordsQueueKey } from "@/lib/workspace/workUnitQueueDerived";

const OPPORTUNITY_PIPELINE_TOTAL_FALLBACK_KEY = "pipeline_total";

export type WorkUnitBootstrapQueueSummary = { key: string };

export type WorkUnitBootstrapWorkUnitRow = {
    queue_definition?: unknown;
};

function resolveNavTimeRowQueueKey(wu: WorkUnitBootstrapWorkUnitRow, qFromUrl: string): string | null {
    const qTrim = qFromUrl.trim();
    if (!wu.queue_definition) {
        return qTrim || null;
    }
    try {
        const def = validateQueueDefinition(wu.queue_definition);
        const keys = new Set(def.queues.map((q) => q.key));
        if (qTrim && keys.has(qTrim)) return qTrim;
        const ui = getQueueUiConfig(def);
        const uiOrder = ui.sections.flatMap((s) => s.queue_keys);
        const fromUi = uiOrder.find((k) => keys.has(k)) ?? def.queues[0]?.key ?? null;
        if (fromUi && keys.has(fromUi)) return fromUi;
        if (keys.has(OPPORTUNITY_PIPELINE_TOTAL_FALLBACK_KEY)) return OPPORTUNITY_PIPELINE_TOTAL_FALLBACK_KEY;
        return def.queues[0]?.key ?? null;
    } catch {
        return qTrim || null;
    }
}

function deriveSelectedQueueKeyFromSummaries(
    wu: WorkUnitBootstrapWorkUnitRow,
    qs: WorkUnitBootstrapQueueSummary[],
    qFromUrl: string
): string | null {
    if (!qs.length) return null;
    const qTrim = qFromUrl.trim();
    let allKeyFromDef: string | null = null;
    try {
        const defBoot = validateQueueDefinition(wu.queue_definition);
        const uiBoot = getQueueUiConfig(defBoot);
        allKeyFromDef = findAllRecordsQueueKey(defBoot, uiBoot);
    } catch {
        allKeyFromDef = null;
    }
    const uiOrder = (() => {
        try {
            const def = validateQueueDefinition(wu.queue_definition) as QueueDefinitionV1;
            const ui = getQueueUiConfig(def);
            return ui.sections.flatMap((s) => s.queue_keys);
        } catch {
            return qs.map((x) => x.key);
        }
    })();
    const firstByUi = uiOrder.find((k) => qs.some((x) => x.key === k)) ?? qs[0]?.key ?? null;
    if (qTrim && qs.some((x) => x.key === qTrim)) return qTrim;
    if (allKeyFromDef && qs.some((x) => x.key === allKeyFromDef)) return allKeyFromDef;
    return firstByUi;
}

/** Server mirror of client bootstrap primary lane selection (summaries win over URL). */
export function resolveWorkUnitBootstrapPrimaryQueueKey(
    wu: WorkUnitBootstrapWorkUnitRow,
    summaries: WorkUnitBootstrapQueueSummary[] | null,
    qFromUrl: string
): string | null {
    if (summaries?.length) {
        return deriveSelectedQueueKeyFromSummaries(wu, summaries, qFromUrl);
    }
    return resolveNavTimeRowQueueKey(wu, qFromUrl);
}
