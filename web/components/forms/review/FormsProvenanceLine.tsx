import type { DocumentProvenanceV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { FormsProvenanceDetail } from "@/components/forms/review/FormsProvenanceDetail";

type Props = {
    provenance: DocumentProvenanceV1;
    /** Show current / also generated chip when present on provenance */
    showGenerationLabel?: boolean;
    className?: string;
};

/** Operator-facing provenance (delegates to structured detail). */
export function FormsProvenanceLine({ provenance, showGenerationLabel = true, className }: Props) {
    return (
        <FormsProvenanceDetail
            provenance={provenance}
            showGenerationLabel={showGenerationLabel}
            className={className}
        />
    );
}
