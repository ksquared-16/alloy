/**
 * Queue row placement V2 preview — parses `_placement_priority_v2` (Phase 2 — Card 4).
 * Presentation only; no ranking logic.
 */

import type {
    QueueRowPlacementCandidateLineVm,
    QueueRowPlacementPriorityV2Vm,
} from "@/lib/ui-v2/workspace-types";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";
import {
    UNSPECIFIED_PROGRAM_SECTION,
    formatPlacementWaitlistProgramShortLabel,
    formatPlacementWaitlistSectionLabel,
} from "@/lib/ui-v2/queuePlacementPriorityPresentation";
import { formatDateUtcAudit } from "@/lib/adminFormatters";

const LINK_MODE_LABELS: Record<string, string> = {
    preferred_together: "Preferred together",
    strictly_together: "Must enroll together",
};

const BUCKET_LABEL_BY_KEY = new Map<string, string>(
    CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.buckets.map((b) => {
        const label = CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.labels[b.label_key as keyof typeof CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.labels];
        return [b.bucket_key, label ?? b.bucket_key];
    })
);

export function formatPlacementBucketLabel(bucketKey: string): string {
    const k = bucketKey.trim();
    if (!k) return "Waitlist";
    return BUCKET_LABEL_BY_KEY.get(k) ?? k.replace(/^tier_/, "").replace(/_/g, " ");
}

function humanizeCohortSlug(slug: string): string {
    const t = slug.trim();
    if (!t || t === "unknown_program_room") return UNSPECIFIED_PROGRAM_SECTION;
    return t
        .split("_")
        .filter(Boolean)
        .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(" ");
}

function formatWaitSinceLabel(iso: string | null | undefined): string | null {
    if (!iso?.trim()) return null;
    const formatted = formatDateUtcAudit(iso.trim());
    return formatted && formatted !== "—" ? formatted : null;
}

function parseLinkMode(raw: unknown): QueueRowPlacementCandidateLineVm["linkMode"] {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s === "preferred_together" || s === "strictly_together" || s === "independent") return s;
    return "independent";
}

function parseCandidateLine(raw: unknown): QueueRowPlacementCandidateLineVm | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const id = typeof o.placement_candidate_id === "string" ? o.placement_candidate_id.trim() : "";
    if (!id) return null;

    const cohortKey =
        typeof o.program_room_cohort_key === "string" ? o.program_room_cohort_key.trim() : "";
    const cohortLabel =
        typeof o.program_room_group_label === "string" && o.program_room_group_label.trim()
            ? o.program_room_group_label.trim()
            : humanizeCohortSlug(cohortKey);

    const bucketKey = typeof o.bucket === "string" ? o.bucket.trim() : "";
    const linkMode = parseLinkMode(o.link_mode);
    const overrideKinds: string[] = [];
    if (Array.isArray(o.active_override_kinds)) {
        for (const k of o.active_override_kinds) {
            if (typeof k === "string" && k.trim()) overrideKinds.push(k.trim());
        }
    }

    const waitSinceRaw =
        typeof o.wait_since === "string" && o.wait_since.trim()
            ? o.wait_since.trim()
            : Array.isArray(o.sort_tuple) && o.sort_tuple.length >= 3 && typeof o.sort_tuple[2] === "string"
              ? String(o.sort_tuple[2])
              : null;

    const childName =
        typeof o.child_display_name === "string" && o.child_display_name.trim()
            ? o.child_display_name.trim()
            : "Child";

    const isSynthetic = o.is_synthetic_fallback === true || o.synthetic_fallback === true;

    return {
        placementCandidateId: id,
        childDisplayName: childName,
        cohortLabel,
        cohortKey,
        bucketLabel: formatPlacementBucketLabel(bucketKey),
        waitSinceLabel: formatWaitSinceLabel(waitSinceRaw),
        linkMode,
        linkModeLabel: linkMode === "independent" ? null : (LINK_MODE_LABELS[linkMode] ?? linkMode),
        hasActiveOverride: overrideKinds.length > 0,
        activeOverrideKinds: overrideKinds,
        isSyntheticFallback: isSynthetic,
        detailLine: buildCandidateDetailLine({
            childDisplayName: childName,
            cohortLabel,
            bucketLabel: formatPlacementBucketLabel(bucketKey),
            waitSinceLabel: formatWaitSinceLabel(waitSinceRaw),
            linkModeLabel: linkMode === "independent" ? null : (LINK_MODE_LABELS[linkMode] ?? linkMode),
            isSyntheticFallback: isSynthetic,
            hasActiveOverride: overrideKinds.length > 0,
        }),
    };
}

export function buildCandidateDetailLine(parts: {
    childDisplayName: string;
    cohortLabel: string;
    bucketLabel: string;
    waitSinceLabel: string | null;
    linkModeLabel: string | null;
    isSyntheticFallback: boolean;
    hasActiveOverride: boolean;
}): string {
    const segments: string[] = [
        parts.childDisplayName,
        `${parts.cohortLabel} · ${parts.bucketLabel}`,
    ];
    if (parts.waitSinceLabel) segments.push(`Waiting since ${parts.waitSinceLabel}`);
    if (parts.linkModeLabel) segments.push(parts.linkModeLabel);
    if (parts.isSyntheticFallback) segments.push("No child on file");
    if (parts.hasActiveOverride) segments.push("Override active");
    return segments.join(" · ");
}

function resolvePrimaryCohortLabel(
    candidates: QueueRowPlacementCandidateLineVm[],
    familySortTuple: Array<string | number | null> | undefined
): string {
    const cohortFromTuple =
        Array.isArray(familySortTuple) && typeof familySortTuple[0] === "string"
            ? familySortTuple[0].trim()
            : "";
    if (cohortFromTuple) {
        const match = candidates.find((c) => c.cohortKey === cohortFromTuple);
        if (match?.cohortLabel) return match.cohortLabel;
        return humanizeCohortSlug(cohortFromTuple);
    }
    const first = candidates[0]?.cohortLabel?.trim();
    return first || UNSPECIFIED_PROGRAM_SECTION;
}

export function parseQueueRowPlacementPriorityV2Vm(raw: unknown): QueueRowPlacementPriorityV2Vm | undefined {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;

    if (o.projection_mode !== "family_row") return undefined;

    const evaluated = o.evaluated === true;
    const shadowMode = o.shadow_mode === true;
    const fallbackToV1 = o.fallback_to_v1 === true;

    const candidateLines: QueueRowPlacementCandidateLineVm[] = [];
    if (Array.isArray(o.candidates)) {
        for (const c of o.candidates) {
            const line = parseCandidateLine(c);
            if (line) candidateLines.push(line);
        }
    }

    const family = o.family_rollup;
    let familyBucket = "";
    let familySortTuple: Array<string | number | null> | undefined;
    let candidateCount = candidateLines.length;
    let blockedByStrictLink = false;
    let strictLinkIncomplete = false;

    if (family != null && typeof family === "object" && !Array.isArray(family)) {
        const fr = family as Record<string, unknown>;
        familyBucket = typeof fr.bucket === "string" ? fr.bucket.trim() : "";
        if (Array.isArray(fr.sort_tuple)) {
            familySortTuple = fr.sort_tuple as Array<string | number | null>;
        }
        const cc = fr.candidate_count;
        if (typeof cc === "number" && Number.isFinite(cc) && cc >= 0) candidateCount = cc;
        blockedByStrictLink = fr.blocked_by_strict_link === true;
        strictLinkIncomplete = fr.strict_link_cross_opportunity_incomplete === true;
    }

    const primaryCohortLabel = resolvePrimaryCohortLabel(candidateLines, familySortTuple);
    const familyBucketLabel = formatPlacementBucketLabel(familyBucket);

    const childCountLabel =
        candidateCount === 1
            ? "1 child waitlisted"
            : candidateCount > 1
              ? `${candidateCount} children waitlisted`
              : "Waitlisted";

    return {
        evaluated,
        shadowMode,
        fallbackToV1,
        primaryCohortLabel,
        primaryCohortSectionTitle: formatPlacementWaitlistSectionLabel(primaryCohortLabel),
        waitlistProgramShortLabel: formatPlacementWaitlistProgramShortLabel(primaryCohortLabel),
        familyBucketLabel,
        childCountLabel,
        candidateCount,
        candidates: candidateLines,
        blockedByStrictLink,
        strictLinkCrossOpportunityIncomplete: strictLinkIncomplete,
        showPlacementV2Badge: evaluated && !fallbackToV1,
    };
}

/** Lane hint when V2 shadow or partial evaluation applies. */
export function buildPlacementV2QueueHint(params: {
    shadowMode: boolean;
    placementProjectionHint?: string;
    candidateRowLayout?: boolean;
}): string | undefined {
    const parts: string[] = [];
    if (params.shadowMode) {
        parts.push("Priority preview");
    } else if (params.candidateRowLayout) {
        parts.push("Ordered by priority");
    }
    if (params.placementProjectionHint?.trim()) {
        parts.push(params.placementProjectionHint.trim());
    }
    return parts.length ? parts.join(" · ") : undefined;
}
