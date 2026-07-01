"use client";

import {
    ENROLLMENT_FAMILY_STAGE_SPECS,
    ENROLLMENT_CHILD_STAGE_SPECS,
    ENROLLMENT_TRACK_CHILD_KEY,
    ENROLLMENT_TRACK_FAMILY_KEY,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";

function StageChip({ label }: { label: string }) {
    return (
        <span className="rounded-md border border-alloy-forge/12 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/75">
            {label}
        </span>
    );
}

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

    const familyStages = ENROLLMENT_FAMILY_STAGE_SPECS.filter((s) => s.key !== "closed").map((s) => s.label);
    const childStages = ENROLLMENT_CHILD_STAGE_SPECS.filter((s) => s.key !== "closed_withdrawn").map((s) => s.label);

    return (
        <div
            className="rounded-xl border border-alloy-forge/12 bg-alloy-pine/[0.04] px-4 py-3 text-xs leading-relaxed text-alloy-midnight/70"
            data-testid="business-process-track-explainer"
        >
            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
                <div data-testid="business-process-track-explainer-family">
                    <p className="font-semibold text-alloy-midnight">{familyTrack?.label ?? "Family Track"}</p>
                    <p className="mt-0.5 text-alloy-midnight/60">Family moves together through early intake.</p>
                    <div className="mt-2 flex flex-wrap gap-1" data-testid="business-process-track-explainer-family-stages">
                        {familyStages.map((label) => (
                            <StageChip key={label} label={label} />
                        ))}
                    </div>
                </div>

                <div
                    className="flex flex-col items-center justify-center gap-1 px-2 py-1 text-center lg:pt-6"
                    data-testid="business-process-track-explainer-split"
                >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">
                        Decision split
                    </span>
                    <span className="text-lg text-alloy-midnight/35" aria-hidden>
                        →
                    </span>
                    <span className="text-[10px] text-alloy-midnight/55">Family → each Child</span>
                </div>

                <div data-testid="business-process-track-explainer-child">
                    <p className="font-semibold text-alloy-midnight">{childTrack?.label ?? "Child Track"}</p>
                    <p className="mt-0.5 text-alloy-midnight/60">Each child progresses independently after decision.</p>
                    <div className="mt-2 flex flex-wrap gap-1" data-testid="business-process-track-explainer-child-stages">
                        {childStages.map((label) => (
                            <StageChip key={label} label={label} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
