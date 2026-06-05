import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";
import {
    normalizeQueueDefinitionDocument,
    tryLoadWorkUnitQueueDefinitionBundle,
} from "@/lib/config/queueDefinitionV2Runtime";
import { unwrapWorkUnitQueueDefinitionRaw } from "@/lib/admin/drawer/unwrapWorkUnitQueueDefinitionRaw";

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function readStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
}

function buildMinimalQueueDefinitionFromUiSections(raw: Record<string, unknown>): QueueDefinitionV1 | null {
    const uiRaw = raw.ui;
    if (!isPlainObject(uiRaw) || !Array.isArray(uiRaw.sections) || uiRaw.sections.length === 0) {
        return null;
    }

    const queueKeySet = new Set<string>();
    const sections: Array<{ key: string; label: string; tone?: string; queue_keys: string[] }> = [];

    for (const s of uiRaw.sections) {
        if (!isPlainObject(s)) continue;
        const key = typeof s.key === "string" ? s.key.trim() : "";
        const label = typeof s.label === "string" ? s.label.trim() : "";
        const queue_keys = readStringArray(s.queue_keys);
        if (!key || !label || queue_keys.length === 0) continue;
        for (const qk of queue_keys) queueKeySet.add(qk);
        const toneRaw = s.tone;
        const tone =
            toneRaw === "attention" || toneRaw === "critical" || toneRaw === "standard"
                ? toneRaw
                : undefined;
        sections.push(tone ? { key, label, tone, queue_keys } : { key, label, queue_keys });
    }
    if (queueKeySet.size === 0 || sections.length === 0) return null;

    const queuesFromRaw = Array.isArray(raw.queues) ? raw.queues : [];
    const queueByKey = new Map<string, Record<string, unknown>>();
    for (const q of queuesFromRaw) {
        if (!isPlainObject(q)) continue;
        const key = typeof q.key === "string" ? q.key.trim() : "";
        if (key) queueByKey.set(key, q);
    }

    const queues = [...queueKeySet].map((key) => {
        const src = queueByKey.get(key);
        const label =
            typeof src?.label === "string" && String(src.label).trim() ? String(src.label).trim() : key;
        return { key, label, filters: [] as [] };
    });

    const layoutRaw = uiRaw.layout;
    const layout =
        layoutRaw === "single_section" ? "single_section" : "pipeline_with_attention";

    return validateQueueDefinition({
        version: 1,
        entity_type: raw.entity_type === "opportunity" ? "opportunity" : "opportunity",
        queues,
        ui: { layout, sections },
    });
}

/** Normalize stored work-unit queue_definition (v1, v2, string JSON, nested definition) for drawer lifecycle. */
export function resolveWorkUnitQueueDefinitionForDrawer(raw: unknown): QueueDefinitionV1 | null {
    const doc = unwrapWorkUnitQueueDefinitionRaw(raw);
    if (doc == null) return null;

    const bundle = tryLoadWorkUnitQueueDefinitionBundle(doc);
    if (bundle) return bundle.def;

    if (isPlainObject(doc)) {
        const normalized = normalizeQueueDefinitionDocument(doc);
        if (normalized && !normalized.isV2) {
            try {
                return validateQueueDefinition(doc);
            } catch {
                /* fall through */
            }
        }
        return buildMinimalQueueDefinitionFromUiSections(doc);
    }

    return null;
}
