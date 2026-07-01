/**
 * Layout V2 — curated default Person & Child record drawers (completion pass).
 *
 * Same doctrine as the Lead drawer (see defaultLeadLayouts.ts): center-modal
 * shell + fixed core tabs + a layout-driven Overview body of Sections → Rows →
 * Columns → Items, with field groups, related lists, and widget placeholders.
 * RefKeys follow the canonical namespaces (child.* durable, inquiry_child.* enrollment).
 */

import type { LayoutDoc, LayoutSurface } from "./layoutV2";
import { buildChildDrawerDefaultDoc } from "./defaultChildLayouts";
import { buildPersonDrawerDefaultDoc } from "./defaultPersonLayouts";

/** Person (Contact / Parent) drawer default — relationship workspace v2. */
export { buildPersonDrawerDefaultDoc } from "./defaultPersonLayouts";
export { buildChildDrawerDefaultDoc } from "./defaultChildLayouts";

/**
 * Curated record-drawer default for person/child (no entityPresentation registry
 * entry); null for anything else. Drawer surface only.
 */
export function buildRecordDrawerDefaultDoc(entityType: string, surface: LayoutSurface): LayoutDoc | null {
    if (surface !== "drawer") return null;
    if (entityType === "person") return buildPersonDrawerDefaultDoc();
    if (entityType === "child") return buildChildDrawerDefaultDoc();
    return null;
}
