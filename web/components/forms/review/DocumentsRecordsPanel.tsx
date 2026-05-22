"use client";

import type { PacketReviewDocumentIndexEntryV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { ArtifactsPanel } from "@/components/forms/review/ArtifactsPanel";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";
import {
    formsCaseFileRegionDescription,
    formsCaseFileRegionTitle,
} from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    documentsIndex: PacketReviewDocumentIndexEntryV1[];
    openingDocId: string | null;
    onOpenPdf: (docId: string) => void;
    /** Steps expect PDFs but index has none yet */
    pendingPdfGeneration?: boolean;
};

export function DocumentsRecordsPanel({
    documentsIndex,
    openingDocId,
    onOpenPdf,
    pendingPdfGeneration = false,
}: Props) {
    return (
        <section id={FORMS_CASE_FILE_SECTION.documents}>
            <h2 className={formsCaseFileRegionTitle}>Documents & records</h2>
            <p className={formsCaseFileRegionDescription}>
                Outputs from this intake flow — generated PDFs and submitted form records.
            </p>
            <div className="mt-3">
                <ArtifactsPanel
                    documentsIndex={documentsIndex}
                    openingDocId={openingDocId}
                    onOpenPdf={onOpenPdf}
                    pendingPdfGeneration={pendingPdfGeneration}
                />
            </div>
        </section>
    );
}
