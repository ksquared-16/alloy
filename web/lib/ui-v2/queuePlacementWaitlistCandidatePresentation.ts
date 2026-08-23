/**
 * Parse `_placement_waitlist_row` for candidate-row waitlist UI (Card 4.6).
 */

import { waitlistPrecedenceReasonCopy } from "@/lib/ui-v2/waitlistPrecedenceReasonCopy";
import type { PlacementWaitlistCandidateRowProjection } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { normalizePlacementWaitlistCohort } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";
import { formatPlacementBucketLabel } from "@/lib/ui-v2/queuePlacementPriorityV2Presentation";
import { resolvePlacementWaitlistChildDisplayLabel } from "@/lib/orchestration/placement/resolvePlacementCandidateChildDisplayName";
import { resolveWaitlistQueueSection } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";
import type { WaitlistProgramCategoryContext } from "@/lib/orchestration/placement/waitlistProgramCategoryResolution";
import { WAITLIST_RUNTIME_POSITION_HELP } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";
import { formatDateUtcAudit } from "@/lib/adminFormatters";
import type { QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";
import { buildWaitlistSiblingContextLines } from "@/lib/ui-v2/waitlistSiblingDisplayContext";

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
    raw: unknown,
    context?: WaitlistProgramCategoryContext | null
): QueueRowPlacementWaitlistCandidateVm | undefined {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const o = raw as PlacementWaitlistCandidateRowProjection;
    if (o.row_projection !== "placement_candidate") return undefined;

    const { cohortKey, cohortLabel } = normalizePlacementWaitlistCohort(
        o.program_room_cohort_key,
        o.program_room_group_label
    );
    const waitlistSection = resolveWaitlistQueueSection({
        cohortKey,
        cohortLabel,
        siteId: o.site_id,
        programKey: o.program_key,
        programCategoryId: o.program_category_id,
        locationCategoryContext: context,
    });
    const bucketLabel = formatPlacementBucketLabel(o.bucket);
    const waitSince = formatWaitSince(o.wait_since);
    const linkMode = o.sibling_context?.link_mode ?? o.placement_priority_v2?.link_mode ?? "independent";
    const linkLabel = linkMode !== "independent" ? (LINK_LABELS[linkMode] ?? linkMode) : null;

    const siblingCount = o.sibling_context?.sibling_candidate_count ?? 0;
    const siblingCohorts = (o.sibling_context?.sibling_cohorts ?? []).map((s) => {
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
    });

    const siblingContextBuilt = buildWaitlistSiblingContextLines({
        siblingContext: o.sibling_context ?? {
            has_siblings_on_waitlist: false,
            sibling_candidate_count: 0,
            sibling_cohorts: [],
            link_mode: "independent",
        },
        bucketKey: o.bucket,
        waitlistedSiblings: siblingCohorts.map((s) => ({
            childDisplayName: s.childDisplayName,
            cohortLabel: s.cohortLabel,
        })),
    });

    const enrolledSiblings = (o.sibling_context?.enrolled_siblings ?? []).map((ref) => ({
        childDisplayName: ref.child_display_name ?? null,
        cohortLabel: ref.cohort_label ?? null,
        locationLabel: ref.location_label ?? null,
        sameSiteAsCandidate: ref.same_site_as_candidate === true,
    }));
    const hasWaitlistedSibling = siblingCount > 0;
    const hasEnrolledSibling = enrolledSiblings.length > 0;
    const householdOtherChildCount = o.household_other_children?.count ?? 0;
    const householdOtherChildNames = o.household_other_children?.names?.trim() || null;

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
        childDisplayName: resolvePlacementWaitlistChildDisplayLabel({
            childDisplayName: o.child_display_name,
            isSyntheticFallback: o.is_synthetic_fallback === true,
        }),
        familyDisplayName: o.family_display_name?.trim() || "Family",
        parentDisplayName: o.parent_display_name?.trim() || null,
        cohortKey,
        cohortLabel,
        siteId: o.site_id?.trim() || null,
        programKey: o.program_key?.trim() || null,
        programCategoryId: o.program_category_id?.trim() || null,
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
        ...(typeof o.runtime_position === "number" &&
        Number.isFinite(o.runtime_position) &&
        o.runtime_position >= 1 &&
        typeof o.runtime_position_total === "number" &&
        Number.isFinite(o.runtime_position_total) &&
        o.runtime_position_total >= 1
            ? {
                  runtimePosition: Math.trunc(o.runtime_position),
                  runtimePositionTotal: Math.trunc(o.runtime_position_total),
                  runtimePositionLabel:
                      typeof o.runtime_position_label === "string" && o.runtime_position_label.trim()
                          ? o.runtime_position_label.trim()
                          : undefined,
                  runtimePositionMode:
                      o.runtime_position_mode === "preview" || o.runtime_position_mode === "live"
                          ? o.runtime_position_mode
                          : o.shadow_mode === true
                            ? "preview"
                            : "live",
                  runtimePositionSectionKey:
                      typeof o.runtime_position_section_key === "string"
                          ? o.runtime_position_section_key.trim()
                          : undefined,
                  runtimePositionHelp: [
                      WAITLIST_RUNTIME_POSITION_HELP,
                      typeof o.runtime_position_precedence_note === "string" &&
                      o.runtime_position_precedence_note.trim()
                          ? o.runtime_position_precedence_note.trim()
                          : null,
                  ]
                      .filter(Boolean)
                      .join(" "),
                  runtimePositionPrecedenceReason:
                      typeof o.runtime_position_precedence_reason === "string"
                          ? o.runtime_position_precedence_reason.trim()
                          : undefined,
                  runtimePositionPrecedenceCopy:
                      waitlistPrecedenceReasonCopy(
                          typeof o.runtime_position_precedence_reason === "string"
                              ? o.runtime_position_precedence_reason
                              : null,
                      ) ?? undefined,
                  runtimePositionPrecedenceNote:
                      typeof o.runtime_position_precedence_note === "string" &&
                      o.runtime_position_precedence_note.trim()
                          ? o.runtime_position_precedence_note.trim()
                          : undefined,
              }
            : {}),
        forecastHints: (o.forecast_hints ?? o.placement_priority_v2?.forecast_hints ?? []).filter(
            (h): h is string => typeof h === "string" && h.trim().length > 0
        ),
        siblingLabel,
        siblingCohorts,
        siblingContextLines: siblingContextBuilt.lines,
        siblingContextDiagnostics: siblingContextBuilt.diagnostics,
        enrolledSiblings,
        waitlistedSiblingCount: siblingCount,
        hasWaitlistedSibling,
        hasEnrolledSibling,
        householdOtherChildCount,
        householdOtherChildNames,
    };
}

export type PlacementWaitlistGroupHeaderInput = {
    groupKey?: string | null;
    groupLabel?: string | null;
};

/** Map normalized cohort keys → human section titles for queue headers. */
export function buildPlacementWaitlistWorkUnitGroupHeaders(
    items: ReadonlyArray<PlacementWaitlistGroupHeaderInput>,
    context?: WaitlistProgramCategoryContext | null
): Record<string, { label: string }> {
    const sections = items.map((item) =>
        resolveWaitlistQueueSection({
            cohortKey: item.groupKey,
            cohortLabel: item.groupLabel,
            legacyProgramGroupLabel: item.groupLabel,
            locationCategoryContext: context,
        })
    );
    const out: Record<string, { label: string }> = {};
    for (const s of sections) {
        if (!s.sectionKey || !s.sectionTitle) continue;
        if (!out[s.sectionKey]) out[s.sectionKey] = { label: s.sectionTitle };
    }
    return out;
}
