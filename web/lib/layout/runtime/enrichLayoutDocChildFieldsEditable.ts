/**
 * Layout runtime drawer doc enrichment — editable flags come from Experience Builder
 * configuration only (field/column `editable: true`). Do not infer editability from
 * save adapters at runtime.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";

/** Passthrough — builder configuration is authoritative for inline edit metadata. */
export function enrichLayoutDocChildFieldsEditable(doc: LayoutDoc): LayoutDoc {
    return doc;
}

/** Passthrough — builder configuration is authoritative for inline edit metadata. */
export function enrichLayoutDocDrawerFieldEditable(doc: LayoutDoc): LayoutDoc {
    return doc;
}
