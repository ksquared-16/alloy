import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import {
    packetArtifactKindLabel,
    packetArtifactKindTone,
    type PacketArtifactKindKey,
} from "@/lib/forms/review/formsReviewPresentation";

type Props = {
    kind: PacketArtifactKindKey;
    /** Override display when kind is pending / custom */
    label?: string;
    className?: string;
};

export function FormsArtifactBadge({ kind, label, className }: Props) {
    const display =
        label ??
        (kind === "generated_pdf" || kind === "submitted_record" ? packetArtifactKindLabel(kind) : kind);
    return (
        <FormsReviewBadge
            label={display}
            tone={packetArtifactKindTone(kind)}
            className={className}
        />
    );
}
