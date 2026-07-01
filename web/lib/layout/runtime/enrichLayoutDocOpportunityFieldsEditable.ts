/**
 * Layout runtime opportunity field editable enrichment — builder configuration only.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";

/** Passthrough — do not auto-mark opportunity native fields editable at runtime. */
export function enrichLayoutDocOpportunityFieldsEditable(doc: LayoutDoc): LayoutDoc {
    return doc;
}
