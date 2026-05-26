"use client";

import type { PacketReviewDocumentIndexEntryV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { ArtifactsPanel } from "@/components/forms/review/ArtifactsPanel";
import { OperationalRegionBand } from "@/components/forms/review/OperationalRegionBand";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";

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
        <OperationalRegionBand
            id={FORMS_CASE_FILE_SECTION.documents}
            title="Documents & records"
            description="Outputs from this intake flow — generated PDFs and submitted form records."
            data-testid="documents-records-region"
        >
            <ArtifactsPanel
                documentsIndex={documentsIndex}
                openingDocId={openingDocId}
                onOpenPdf={onOpenPdf}
                pendingPdfGeneration={pendingPdfGeneration}
            />
        </OperationalRegionBand>
    );
}
