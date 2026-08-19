/**
 * THE CHILD CARD'S EFFECTIVE CONFIGURATION — asked once, for every host.
 *
 * The invariant this module exists to make mechanical:
 *
 *   same subject + same business context + same stage/state
 *     ⇒ the same effective configured card, whichever host renders it.
 *
 * ── HOW IT HOLDS, RATHER THAN HOW IT IS HOPED FOR ──
 *
 * It holds because there is nothing here to disagree with. The configuration is read by the SAME two
 * functions the canonical Children card reads it with:
 *
 *     effectiveChildrenNestedConfig(doc)          published config, else the platform default
 *     childrenFocusRowsFromNestedConfig(config)   field keys, labels, order, visibility, editability
 *
 * and the `doc` is the SAME `entity_layouts` row, because every host resolves it from the same
 * addressing tuple — `(businessProcessKey, workViewId, stageKey, statusKey)` — through the same
 * endpoint, the same `resolveSurfaceVariant` and the same `FocusPanelSummaryDocProvider`. No
 * configuration is copied, nothing is re-published, and there is no Operations layout: a second copy
 * is what this module exists to avoid, not a shortcut it takes.
 *
 * ── IT NO LONGER RESOLVES VALUES, AND THAT IS THE POINT ──
 *
 * It used to, because the durable host rendered its own flat card from these rows. That host is
 * gone: Operations now mounts `ChildrenCard` itself, which composes values through
 * `buildChildrenCardEvidence` exactly as the case host does. Keeping a second value resolver alive
 * beside it would be a second opinion about what a child's fields say — the precise failure the
 * convergence removed — so what remains here is the question both hosts ask, and nothing else.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    childrenFocusRowsFromNestedConfig,
    effectiveChildrenNestedConfig,
    type ChildrenFocusFieldRow,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";

/**
 * The configured Child rows for one published document.
 *
 * Takes only the doc, so equality across hosts can be proven without either of them composing a
 * subject at all.
 */
export function contextualChildCardRows(doc: LayoutDoc | null): ChildrenFocusFieldRow[] {
    return childrenFocusRowsFromNestedConfig(effectiveChildrenNestedConfig(doc));
}

/**
 * A stable, comparable fingerprint of the EFFECTIVE CONFIGURATION.
 *
 * This is what certification asserts equality on across hosts, and it deliberately excludes values:
 * two hosts showing the same card must agree on which fields exist, what they are called, what order
 * they are in, whether they are shown and whether they may be edited. Whether one of them has
 * fetched a participation fact is not a configuration difference.
 *
 * Stated as one string so a browser assertion can compare a single DOM attribute rather than
 * reconstructing an object — a comparison that reconstructs is a comparison that can drift.
 */
export function contextualCardConfigurationFingerprint(rows: readonly ChildrenFocusFieldRow[]): string {
    return rows
        .map((r) =>
            [r.fieldKey, r.label, r.groupKey, r.displayed ? "1" : "0", r.editable ? "1" : "0", r.layoutWidth].join(
                "~",
            ),
        )
        .join("|");
}
