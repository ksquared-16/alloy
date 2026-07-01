/**
 * Bridge Experience Builder display primitives into queue v3 field config.
 */

import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type { QueueRecordFieldConfig, QueueRecordFieldDisplay } from "@/lib/layout/queueRecordLayoutV3";
import { formatLayoutRuntimeStatusLabel, isLayoutRuntimeStatusRefKey } from "@/lib/layout/runtime/formatLayoutRuntimeStatusLabel";

/** Map catalog field shape → queue row display mode (shared inference rules with drawer typography). */
export function inferQueueRecordFieldDisplayFromCatalog(f: LayoutCatalogField): QueueRecordFieldDisplay {
    if (f.fieldType === "status") return "pill";
    if (f.fieldType === "phone") return "phone";
    if (f.fieldType === "date") return "date";
    if (f.fieldType === "email") return "email";

    const rk = f.refKey.toLowerCase();
    if (/waitlist\.(positionlabel|tierlabel|prioritylabel|priority)|overrides\.flags/.test(rk)) return "badge";
    if (/status/.test(rk) && !/tour_status/.test(rk)) return "pill";
    if (/email/.test(rk)) return "email";
    if (/phone/.test(rk)) return "phone";
    if (/date|tour|appointment|created_at|updated_at|desired_start|date_of_birth|\.dob$/.test(rk)) return "date";
    if (/name|contact|household|title/.test(rk)) return "link";
    if (/source|updated_at|\.id$/.test(rk)) return "muted";
    return "text";
}

/** Normalize queue status display through shared layout runtime vocabulary. */
export function formatQueueRecordStatusDisplay(raw: unknown, fieldKey: string): string {
    const text = raw == null ? "" : String(raw).trim();
    if (!text || text === "—") return text;
    return (
        formatLayoutRuntimeStatusLabel(text, {
            refKey: fieldKey,
            renderHint: isLayoutRuntimeStatusRefKey(fieldKey) ? "status" : undefined,
        }) ?? text
    );
}

/** Apply shared display defaults when normalizing saved queue field config. */
export function normalizeQueueRecordFieldDisplay(field: QueueRecordFieldConfig): QueueRecordFieldConfig {
    const rk = field.fieldKey.toLowerCase();
    let display = field.display;
    if (!display) {
        display = inferQueueRecordFieldDisplayFromCatalog({
            entityKey: rk.split(".")[0] ?? "opportunity",
            entityLabel: "",
            fieldKey: rk.split(".").slice(1).join(".") || rk,
            fieldLabel: field.label ?? "",
            fieldType: /status/.test(rk) ? "status" : "text",
            refKey: field.fieldKey,
        });
    }
    if (display === "phone" || display === "email") {
        return { ...field, display, showLabel: field.showLabel ?? false };
    }
    return { ...field, display };
}
