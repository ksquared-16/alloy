"use client";

import {
    ENROLLMENT_TRACK_CHILD_KEY,
    ENROLLMENT_TRACK_FAMILY_KEY,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";

/** Operator-facing explanation of Family Track vs Child Track for enrollment-style processes. */
export default function BusinessProcessTrackExplainer({
    tracks,
    processKey,
}: {
    tracks: ProcessTracksV1 | null;
    processKey?: string | null;
}) {
    if (!tracks?.tracks?.length) return null;

    const familyTrack = tracks.tracks.find((t) => t.key === ENROLLMENT_TRACK_FAMILY_KEY);
    const childTrack = tracks.tracks.find((t) => t.key === ENROLLMENT_TRACK_CHILD_KEY);
    const showEnrollmentCopy =
        processKey === "enrollment" || (familyTrack != null && childTrack != null);

    if (!showEnrollmentCopy) return null;

    return (
        <div
            className="rounded-xl border border-alloy-forge/12 bg-alloy-pine/[0.04] px-4 py-3 text-xs leading-relaxed text-alloy-midnight/70"
            data-testid="business-process-track-explainer"
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <div data-testid="business-process-track-explainer-family">
                    <p className="font-semibold text-alloy-midnight">{familyTrack?.label ?? "Family Track"}</p>
                    <p className="mt-0.5 text-alloy-midnight/65">
                        Used while the family moves together through lead, qualification, tour, and decision.
                    </p>
                </div>
                <div data-testid="business-process-track-explainer-child">
                    <p className="font-semibold text-alloy-midnight">{childTrack?.label ?? "Child Track"}</p>
                    <p className="mt-0.5 text-alloy-midnight/65">
                        Used after decision when each child can move independently through waitlist, enrolling,
                        and enrolled.
                    </p>
                </div>
            </div>
        </div>
    );
}
