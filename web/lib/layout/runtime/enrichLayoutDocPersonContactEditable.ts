/**
 * Layout runtime person-contact editable enrichment — builder configuration only.
 */

import type { LayoutDoc, LayoutItem } from "@/lib/layout/layoutV2";
import { collectLayoutItems } from "@/lib/layout/runtime/classifyLayoutItemBinding";
import { isLayoutRuntimePersonFieldRefKey } from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";

/** Passthrough — do not auto-mark person-contact fields editable at runtime. */
export function enrichLayoutDocPersonContactEditable(doc: LayoutDoc): LayoutDoc {
    return doc;
}

/** Count person-contact fields marked editable in layout doc (tests/diagnostics). */
export function countPersonContactEditableFields(doc: LayoutDoc): number {
    let n = 0;
    for (const item of collectLayoutItems(doc)) {
        if (item.kind === "field" && item.editable === true && isLayoutRuntimePersonFieldRefKey(item.refKey ?? "")) {
            n += 1;
        }
    }
    return n;
}
