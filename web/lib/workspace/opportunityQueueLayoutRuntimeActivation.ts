/**
 * Runtime convergence — Slice B (work-unit queue decoupled fetch).
 *
 * In Alloy OS runtime mode the canonical `CompressedQueueRow` owns every opportunity
 * queue row that has `semanticCrmCompact`, and that path never consumes the layout
 * doc fetched by `useOpportunityQueueLayoutRuntime`. The legacy layout-runtime row
 * path (`LayoutRuntimeQueueRowHold` / `LayoutRuntimeQueueRowView` /
 * `CrmCompactQueuePreview`) only renders for rows that LACK `semanticCrmCompact`
 * (or when the runtime flag is off). So the per-lane layout-doc fetch is only needed
 * when at least one row could actually render through that legacy path — otherwise it
 * is a decoupled, unused fetch waterfall on the work-unit page
 * (`docs/system/adminv2-runtime-performance-doctrine.md` — "avoid duplicate fetch
 * waterfalls"). This is a fetch-activation gate only: it does not change reveal gates,
 * queue empty-state semantics, or the visible compressed-row presentation.
 */
export function opportunityQueueLayoutRuntimeRowsPossible(
    items: ReadonlyArray<{ semanticCrmCompact?: unknown }>,
    runtimeEnabled: boolean,
): boolean {
    if (!runtimeEnabled) return true;
    return items.some((item) => !item.semanticCrmCompact);
}
