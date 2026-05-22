"use client";

import clsx from "clsx";
import type { DocumentProvenanceV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import {
    provenanceFormOrigin,
    provenanceTimingLines,
    provenanceVersionLabel,
} from "@/lib/forms/review/intakeArtifactPresentation";
import {
    generationLabelOperatorText,
    generationLabelTone,
} from "@/lib/forms/review/formsReviewPresentation";
import {
    formsIntakeProvenanceMeta,
    formsIntakeProvenanceOrigin,
} from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    provenance?: DocumentProvenanceV1 | null;
    /** Flat line when structured provenance is unavailable */
    fallbackLine?: string | null;
    showGenerationLabel?: boolean;
    className?: string;
};

/** Structured provenance — origin primary, timing secondary, optional currentness chip. */
export function FormsProvenanceDetail({
    provenance,
    fallbackLine,
    showGenerationLabel = true,
    className,
}: Props) {
    if (!provenance) {
        if (!fallbackLine?.trim()) return null;
        return (
            <p className={clsx(formsIntakeProvenanceMeta, className)} data-testid="forms-provenance-fallback">
                {fallbackLine.trim()}
            </p>
        );
    }

    const origin = provenanceFormOrigin(provenance);
    const version = provenanceVersionLabel(provenance);
    const timing = provenanceTimingLines(provenance);
    const gen = provenance.generation_label;

    return (
        <div className={clsx("space-y-0.5", className)} data-testid="forms-provenance-detail">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className={formsIntakeProvenanceOrigin}>{origin}</span>
                {version ?
                    <span className={formsIntakeProvenanceMeta}>{version}</span>
                : null}
                {showGenerationLabel && gen ?
                    <FormsReviewBadge
                        label={generationLabelOperatorText(gen)}
                        tone={generationLabelTone(gen)}
                    />
                : null}
            </div>
            {timing.length > 0 ?
                <p className={formsIntakeProvenanceMeta}>{timing.join(" · ")}</p>
            : null}
        </div>
    );
}
