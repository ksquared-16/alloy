"use client";

import clsx from "clsx";
import type { IntakeArtifactDisplayItem } from "@/lib/forms/review/intakeArtifactPresentation";
import { artifactKindDisplayLabel } from "@/lib/forms/packets/documentProvenanceDisplay";
import { FormsProvenanceDetail } from "@/components/forms/review/FormsProvenanceDetail";
import {
    formsCaseFileActionLink,
    formsIntakeArtifactCard,
    formsIntakeArtifactKindLabel,
} from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    item: IntakeArtifactDisplayItem;
    openingDocId?: string | null;
    onOpenPdf?: (docId: string) => void;
};

export function IntakeArtifactCard({ item, openingDocId = null, onOpenPdf }: Props) {
    const kindLabel = artifactKindDisplayLabel(item.kind);
    const showOpenPdf = item.openTarget === "signed_url" && item.documentId && onOpenPdf;

    return (
        <li className={formsIntakeArtifactCard} data-testid={`intake-artifact-${item.kind}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-alloy-midnight leading-snug">{item.title}</p>
                    <p className={formsIntakeArtifactKindLabel}>{kindLabel}</p>
                    <FormsProvenanceDetail
                        provenance={item.provenance}
                        fallbackLine={item.provenanceFallbackLine}
                        showGenerationLabel={item.kind === "generated_pdf"}
                    />
                </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {item.submissionPath ?
                    <a
                        href={item.submissionPath}
                        className={formsCaseFileActionLink}
                        target="_blank"
                        rel="noreferrer"
                    >
                        View submission
                    </a>
                : null}
                {item.packetSessionPath ?
                    <a
                        href={item.packetSessionPath}
                        className={formsCaseFileActionLink}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Packet session
                    </a>
                : null}
                {showOpenPdf ?
                    <button
                        type="button"
                        className={clsx(formsCaseFileActionLink, "disabled:opacity-50")}
                        disabled={openingDocId === item.documentId}
                        onClick={() => onOpenPdf!(item.documentId!)}
                    >
                        {openingDocId === item.documentId ? "Opening…" : "Open PDF"}
                    </button>
                : item.openTarget === "submission_link" && item.submissionPath ?
                    <a
                        href={item.submissionPath}
                        className={formsCaseFileActionLink}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Open record
                    </a>
                : null}
            </div>
        </li>
    );
}
