import clsx from "clsx";
import type { DocumentProvenanceV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import {
    formatFormsProvenanceLine,
    generationLabelOperatorText,
    generationLabelTone,
} from "@/lib/forms/review/formsReviewPresentation";
import { formsCaseFileMetaText } from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    provenance: DocumentProvenanceV1;
    /** Show current / also generated chip when present on provenance */
    showGenerationLabel?: boolean;
    className?: string;
};

/** Operator-facing provenance line with optional generation currentness chip. */
export function FormsProvenanceLine({ provenance, showGenerationLabel = true, className }: Props) {
    const line = formatFormsProvenanceLine(provenance);
    const gen = provenance.generation_label;

    return (
        <div className={clsx("flex flex-wrap items-center gap-x-2 gap-y-0.5", className)}>
            <span className={formsCaseFileMetaText}>{line}</span>
            {showGenerationLabel && gen ?
                <FormsReviewBadge
                    label={generationLabelOperatorText(gen)}
                    tone={generationLabelTone(gen)}
                />
            : null}
        </div>
    );
}
