/**
 * Resolve operational queue row layout from published LayoutDoc metadata.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { migrateToQueueRecordLayoutV3 } from "@/lib/layout/queueRecordLayoutMigration";
import {
    defaultLeadQueueLayoutV3,
    defaultWaitlistQueueLayoutV3,
    type QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import { normalizeQueueRecordLayoutConfig } from "@/lib/layout/runtime/normalizeQueueRecordLayoutConfig";

export type { QueueRecordLayoutConfigV3 as QueueRecordLayoutConfig } from "@/lib/layout/queueRecordLayoutV3";
export type QueueRecordLayoutEditorConfig = QueueRecordLayoutConfigV3;

/** True when layout doc metadata identifies an enrollment waitlist queue variant. */
export function isWaitlistQueueLayoutDoc(doc?: LayoutDoc | null): boolean {
    const meta = doc?.metadata as { queue_context?: { queue_type?: string }; template?: string } | undefined;
    if (meta?.queue_context?.queue_type === "waitlist") return true;
    const t = (meta?.template ?? "").toLowerCase();
    return t.includes("waitlist");
}

export function isQueueRecordLayoutConfig(raw: unknown): raw is QueueRecordLayoutConfigV3 {
    return migrateToQueueRecordLayoutV3(raw, false).version === 3;
}

export function parseQueueRecordLayoutConfig(raw: unknown, isWaitlist = false): QueueRecordLayoutConfigV3 | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (o.variant !== "operational-row") return null;
    if (Array.isArray(o.columns) && o.columns.length === 0) return null;
    return normalizeQueueRecordLayoutConfig(migrateToQueueRecordLayoutV3(raw, isWaitlist));
}

/** Runtime + settings: saved config on doc metadata, else lifecycle default preset. */
export function resolveQueueRecordLayoutConfig(doc?: LayoutDoc | null): QueueRecordLayoutConfigV3 {
    const meta = doc?.metadata as { queue_record_layout?: unknown } | undefined;
    const isWaitlist = isWaitlistQueueLayoutDoc(doc);
    const parsed = parseQueueRecordLayoutConfig(meta?.queue_record_layout, isWaitlist);
    if (parsed) return parsed;
    return normalizeQueueRecordLayoutConfig(
        isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3(),
    );
}

export function resolveQueueRecordEditorConfig(doc?: LayoutDoc | null): QueueRecordLayoutConfigV3 {
    return resolveQueueRecordLayoutConfig(doc);
}
