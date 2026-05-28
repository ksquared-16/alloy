/**
 * Parse `_placement_waitlist_row` for candidate-row waitlist UI (Card 4.6).
 */

import type { PlacementWaitlistCandidateRowProjection } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { normalizePlacementWaitlistCohort } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";
import { formatPlacementBucketLabel } from "@/lib/ui-v2/queuePlacementPriorityV2Presentation";
import { resolveWaitlistQueueSection } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";
import { formatDateUtcAudit } from "@/lib/adminFormatters";
import type { QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";

const LINK_LABELS: Record<string, string> = {
    preferred_together: "Preferred together",
    strictly_together: "Must enroll together",
};

function formatWaitSince(iso: string | null | undefined): string | null {
    if (!iso?.trim()) return null;
    const f = formatDateUtcAudit(iso.trim());
    return f && f !== "—" ? f : null;
}

export function parsePlacementWaitlistCandidateRowVm(
    raw: unknown
): QueueRowPlacementWaitlistCandidateVm | undefined {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const o = raw as PlacementWaitlistCandidateRowProjection;
    if (o.row_projection !== "placement_candidate") return undefined;

    const { cohortKey, cohortLabel } = normalizePlacementWaitlistCohort(
        o.program_room_cohort_key,
        o.program_room_group_label
    );
    const waitlistSection = resolveWaitlistQueueSection({ cohortKey, cohortLabel });
    const bucketLabel = formatPlacementBucketLabel(o.bucket);
    const waitSince = formatWaitSince(o.wait_since);
    const linkMode = o.sibling_context?.link_mode ?? o.placement_priority_v2?.link_mode ?? "independent";
    const linkLabel = linkMode !== "independent" ? (LINK_LABELS[linkMode] ?? linkMode) : null;

    const siblingCount = o.sibling_context?.sibling_candidate_count ?? 0;
    const siblingLabel =
        siblingCount === 1
            ? "1 sibling also waitlisted"
            : siblingCount > 1
              ? `${siblingCount} siblings also waitlisted`
              : null;

    const activeOverrides = (o.placement_priority_v2?.active_overrides ?? []).map((ov) => ({
        id: ov.id,
        overrideKind: ov.override_kind,
        reason: ov.reason,
    }));
    const pinOverrides = activeOverrides.filter((ov) => ov.overrideKind === "pin");

    return {
        placementCandidateId: o.placement_candidate_id,
        opportunityId: o.opportunity_id,
        childDisplayName: o.child_display_name?.trim() || "Child",
        familyDisplayName: o.family_display_name?.trim() || "Family",
        parentDisplayName: o.parent_display_name?.trim() || null,
        cohortKey,
        cohortLabel,
        cohortSectionTitle: waitlistSection.sectionTitle,
        bucketLabel,
        waitSinceLabel: waitSince,
        linkModeLabel: linkLabel,
        isSyntheticFallback: o.is_synthetic_fallback === true,
        hasActiveOverride: (o.placement_priority_v2?.active_override_kinds?.length ?? 0) > 0,
        activeOverrideKinds: o.placement_priority_v2?.active_override_kinds ?? [],
        activeOverrides,
        hasManualPositionAdjustment: pinOverrides.length > 0,
        manualAdjustmentReason: pinOverrides[0]?.reason ?? null,
        pinOverrideId: pinOverrides[0]?.id ?? null,
        shadowMode: o.shadow_mode === true,
        forecastHints: (o.forecast_hints ?? o.placement_priority_v2?.forecast_hints ?? []).filter(
            (h): h is string => typeof h === "string" && h.trim().length > 0
        ),
        siblingLabel,
        siblingCohorts: (o.sibling_context?.sibling_cohorts ?? []).map((s) => {
            const sib = normalizePlacementWaitlistCohort(
                s.program_room_cohort_key,
                s.program_room_group_label
            );
            return {
            placementCandidateId: s.placement_candidate_id,
            childDisplayName: s.child_display_name,
            cohortLabel: sib.cohortLabel,
            linkModeLabel:
                s.link_mode && s.link_mode !== "independent"
                    ? (LINK_LABELS[s.link_mode] ?? s.link_mode)
                    : null,
        };
        }),
    };
}

export type PlacementWaitlistGroupHeaderInput = {
    groupKey?: string | null;
    groupLabel?: string | null;
};

/** Map normalized cohort keys → human section titles for queue headers. */
export function buildPlacementWaitlistWorkUnitGroupHeaders(
    items: ReadonlyArray<PlacementWaitlistGroupHeaderInput>
): Record<string, { label: string }> {
    const sections = items.map((item) =>
        resolveWaitlistQueueSection({
            cohortKey: item.groupKey,
            cohortLabel: item.groupLabel,
            legacyProgramGroupLabel: item.groupLabel,
        })
    );
    const out: Record<string, { label: string }> = {};
    for (const s of sections) {
        if (!s.sectionKey || !s.sectionTitle) continue;
        if (!out[s.sectionKey]) out[s.sectionKey] = { label: s.sectionTitle };
    }
    return out;
}
