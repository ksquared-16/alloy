/**
 * Compact inline sibling context lines for candidate-grain waitlist rows (presentation only).
 */

import type { PlacementWaitlistSiblingContext } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";

const TIER_SIBLING_ENROLLED_BUCKET = "tier_sibling_enrolled";
const TIER_SISTER_CENTER_BUCKET = "tier_sister_center";

export type WaitlistSiblingCohortDisplayInput = {
    childDisplayName: string;
    cohortLabel: string;
};

export type WaitlistEnrolledSiblingDisplayInput = {
    childDisplayName: string | null;
    cohortLabel: string | null;
    locationLabel: string | null;
    sameSiteAsCandidate: boolean;
};

export type WaitlistSiblingContextLinesResult = {
    lines: string[];
    diagnostics: string | null;
};

function trimOrNull(v: string | null | undefined): string | null {
    const s = (v ?? "").trim();
    return s || null;
}

function formatWaitlistedSiblingLine(
    siblings: WaitlistSiblingCohortDisplayInput[],
    maxNamed = 1
): string | null {
    if (siblings.length === 0) return null;
    const named = siblings.filter((s) => trimOrNull(s.childDisplayName) && trimOrNull(s.cohortLabel));
    if (named.length === 0) {
        return siblings.length === 1 ?
                "Sibling also waitlisted"
            :   `${siblings.length} siblings also waitlisted`;
    }
    const first = named[0]!;
    const name = trimOrNull(first.childDisplayName)!;
    const program = trimOrNull(first.cohortLabel)!;
    const extra = named.length - maxNamed;
    const suffix = extra > 0 ? ` (+${extra} more)` : "";
    return `Sibling also waitlisted: ${name} — ${program}${suffix}`;
}

function formatEnrolledSiblingLine(ref: WaitlistEnrolledSiblingDisplayInput): string | null {
    const name = trimOrNull(ref.childDisplayName);
    const program = trimOrNull(ref.cohortLabel);
    const location = trimOrNull(ref.locationLabel);

    if (ref.sameSiteAsCandidate) {
        if (name && program) return `Sibling enrolled: ${name} — ${program}`;
        return "Sibling enrolled at this location";
    }

    if (name && program && location) {
        return `Sibling at another location: ${name} — ${program} — ${location}`;
    }
    if (name && program) return `Sibling at another location: ${name} — ${program}`;
    return "Sibling enrolled at another location";
}

export function buildWaitlistSiblingContextLines(params: {
    siblingContext: Pick<
        PlacementWaitlistSiblingContext,
        "sibling_cohorts" | "enrolled_siblings" | "display_diagnostics"
    >;
    bucketKey: string;
    waitlistedSiblings?: WaitlistSiblingCohortDisplayInput[];
}): WaitlistSiblingContextLinesResult {
    const lines: string[] = [];
    const diagnostics: string[] = [];

    const waitlisted =
        params.waitlistedSiblings ??
        params.siblingContext.sibling_cohorts.map((s) => ({
            childDisplayName: s.child_display_name,
            cohortLabel: s.program_room_group_label,
        }));

    const waitlistedLine = formatWaitlistedSiblingLine(waitlisted);
    if (waitlistedLine) lines.push(waitlistedLine);

    const enrolled = params.siblingContext.enrolled_siblings ?? [];
    for (const ref of enrolled) {
        const line = formatEnrolledSiblingLine({
            childDisplayName: ref.child_display_name,
            cohortLabel: ref.cohort_label,
            locationLabel: ref.location_label,
            sameSiteAsCandidate: ref.same_site_as_candidate,
        });
        if (line) lines.push(line);
    }

    const bucket = params.bucketKey.trim();
    if (
        bucket === TIER_SIBLING_ENROLLED_BUCKET &&
        enrolled.length === 0 &&
        !lines.some((l) => l.startsWith("Sibling enrolled"))
    ) {
        lines.push("Sibling enrolled at this location");
        diagnostics.push("enrolled_sibling_detail_missing");
    }
    if (
        bucket === TIER_SISTER_CENTER_BUCKET &&
        enrolled.every((r) => r.same_site_as_candidate) &&
        !lines.some((l) => l.startsWith("Sibling at another location"))
    ) {
        if (enrolled.length === 0) {
            lines.push("Sibling enrolled at another location");
            diagnostics.push("sister_site_sibling_detail_missing");
        }
    }

    if (params.siblingContext.display_diagnostics?.trim()) {
        diagnostics.push(params.siblingContext.display_diagnostics.trim());
    }

    return {
        lines,
        diagnostics: diagnostics.length ? diagnostics.join("; ") : null,
    };
}
