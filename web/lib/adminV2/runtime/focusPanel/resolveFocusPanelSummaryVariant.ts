/**
 * P3-A — the ONE applicability selector for the Focus Panel Summary surface.
 *
 * The Focus Panel joins the Work Unit Header and Queue in resolving its published variant through the
 * single shared resolver `resolveSurfaceVariant`. This deletes the region's former ad-hoc selector
 * (the endpoint's `highestVersion(published)` org-global pick, which had no Business-Process / Work-View
 * applicability axis).
 *
 * Behavior-neutral by construction: today every published Focus Panel Summary doc is org-global (it
 * declares no BP/Work-View/stage/status constraint), so all candidates are wildcards at specificity 0
 * and `resolveSurfaceVariant` breaks the tie by highest version — exactly what `highestVersion` did,
 * only more deterministic (a total order: version, then lexically-least layoutId). When BP/Work-View
 * scoped variants are later published, the applicable one is chosen deterministically — the same
 * doctrine the Header and Queue already follow. No fallback lives here: `null` means "no published
 * variant applies", and the caller keeps the code-built default.
 */
import type { EntityLayoutRecord, LayoutSurface } from "@/lib/layout/layoutV2";
import {
    resolveSurfaceVariant,
    type SurfaceVariantCandidate,
} from "@/lib/layout/resolveSurfaceVariant";
import {
    FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
    FOCUS_PANEL_SUMMARY_SURFACE,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";

/** Applicability context the Focus Panel variant is resolved against. Opportunity is the sole committed
 *  subject (Person/Child/Household/Enrollment are cards inside it, never subjects), so `entityType` and
 *  `subjectType` are fixed; `businessProcessKey`/`workViewId` scope the variant when authored. */
export type FocusPanelSummaryVariantContext = {
    businessProcessKey?: string | null;
    workViewId?: string | null;
    stageKey?: string | null;
    statusKey?: string | null;
};

/** Map a published Focus Panel Summary `entity_layouts` row to a surface-variant candidate. BP / Work-View
 *  / stage / status scoping is read from the layout's `metadata` when authored; org-global rows declare
 *  all-null constraints (wildcards) so the resolver returns the highest published version. Mirrors the
 *  queue mapper exactly (one shared candidate shape). */
export function focusPanelSummaryRecordToVariantCandidate(
    r: EntityLayoutRecord,
): SurfaceVariantCandidate {
    const m = r.metadata ?? {};
    const constraint = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
    return {
        layoutId: r.id,
        layoutKey: r.layoutKey,
        entityType: FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
        surface: FOCUS_PANEL_SUMMARY_SURFACE as LayoutSurface,
        status: r.status,
        version: r.version,
        businessProcessKey: constraint("businessProcessKey"),
        workViewId: constraint("workViewId"),
        stageKey: constraint("stageKey"),
        statusKey: constraint("statusKey"),
    };
}

/**
 * Select the applicable published Focus Panel Summary record for a context via `resolveSurfaceVariant`.
 * `records` is the org's Focus Panel Summary layouts (any status; the resolver ignores non-published).
 * Returns the winning record, or null when nothing published applies (caller falls back to the default).
 */
export function resolvePublishedFocusPanelSummaryRecord(
    records: readonly EntityLayoutRecord[],
    context: FocusPanelSummaryVariantContext = {},
): EntityLayoutRecord | null {
    const candidates = records.map(focusPanelSummaryRecordToVariantCandidate);
    const resolution = resolveSurfaceVariant(
        {
            businessProcessKey: context.businessProcessKey ?? "",
            workViewId: context.workViewId ?? null,
            stageKey: context.stageKey ?? null,
            statusKey: context.statusKey ?? null,
            entityType: FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
            surface: FOCUS_PANEL_SUMMARY_SURFACE as LayoutSurface,
        },
        candidates,
    );
    if (!resolution) return null;
    return records.find((r) => r.id === resolution.candidate.layoutId) ?? null;
}
