/**
 * Runtime presentation helpers for peer-level KPI tiles (Sprint 5.18B).
 * Detection only — no LayoutDoc mutations.
 */

import { sectionIsKpiTile, sectionIsWidgetStrip } from "@/lib/layout/layoutBuilderWidgetStrip";
import type { LayoutSection } from "@/lib/layout/layoutV2";

export { sectionIsKpiTile, sectionIsWidgetStrip };

/** True when runtime should omit section/card chrome and render a standalone KPI tile. */
export function sectionUsesKpiTileRuntimePresentation(section: LayoutSection): boolean {
    return sectionIsKpiTile(section);
}
