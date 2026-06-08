/**
 * Normalize layout widget item → runtime widget key (tasks, attention, …).
 */

import type { LayoutItem } from "@/lib/layout/layoutV2";

/** Resolve widget key from refKey / widget.widgetKey (`opportunities.tasks` → `tasks`). */
export function resolveLayoutRuntimeWidgetKey(item: LayoutItem): string {
    const ref = (item.refKey ?? "").trim();
    if (ref) {
        const tail = ref.includes(".") ? ref.split(".").pop()! : ref;
        return tail.trim().toLowerCase();
    }
    const wk = (item.widget?.widgetKey ?? "").trim();
    if (wk) {
        const tail = wk.includes(".") ? wk.split(".").pop()! : wk;
        return tail.trim().toLowerCase();
    }
    return "";
}
