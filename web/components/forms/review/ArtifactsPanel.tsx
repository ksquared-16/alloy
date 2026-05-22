"use client";

import clsx from "clsx";
import type { PacketReviewDocumentIndexEntryV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import type { IntakeArtifactDisplayItem } from "@/lib/forms/review/intakeArtifactPresentation";
import {
    INTAKE_ARTIFACT_CURRENTNESS_LEGEND,
    intakeArtifactFromIndexEntry,
    intakeArtifactFromNormalizedRow,
    intakeArtifactGroupDescription,
    intakeArtifactGroupTitle,
    resolveIntakeDocumentsEmptyState,
} from "@/lib/forms/review/intakeArtifactPresentation";
import { IntakeArtifactCard } from "@/components/forms/review/IntakeArtifactCard";
import {
    formsCaseFileGroupedSurface,
    formsCaseFileMetaText,
    formsIntakeArtifactLegend,
} from "@/lib/forms/review/formsReviewClassTokens";
import type { PacketArtifactKind } from "@/lib/forms/packets/documentProvenanceDisplay";

type Props = {
    /** Packet review rollup index */
    documentsIndex?: PacketReviewDocumentIndexEntryV1[];
    /** Opportunity / related API rows (packet-enriched) */
    displayItems?: IntakeArtifactDisplayItem[];
    openingDocId?: string | null;
    onOpenPdf?: (docId: string) => void;
    /** Show PDF currentness legend when any PDF has generation_label */
    showCurrentnessLegend?: boolean;
    pendingPdfGeneration?: boolean;
    className?: string;
    "data-testid"?: string;
};

function itemsFromProps(props: Props): IntakeArtifactDisplayItem[] {
    if (props.displayItems?.length) return props.displayItems;
    return (props.documentsIndex ?? []).map(intakeArtifactFromIndexEntry);
}

function ArtifactKindGroup({
    kind,
    items,
    openingDocId,
    onOpenPdf,
    showLegend,
}: {
    kind: PacketArtifactKind;
    items: IntakeArtifactDisplayItem[];
    openingDocId: string | null;
    onOpenPdf?: (docId: string) => void;
    showLegend: boolean;
}) {
    if (items.length === 0) return null;

    const showPdfLegend =
        showLegend && kind === "generated_pdf" && items.some((i) => i.generationLabel != null);

    return (
        <div className="space-y-2" data-testid={`artifact-group-${kind}`}>
            <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                    {intakeArtifactGroupTitle(kind)}
                </h3>
                <p className="mt-0.5 text-[11px] text-alloy-midnight/55">{intakeArtifactGroupDescription(kind)}</p>
            </div>
            {showPdfLegend ?
                <p className={formsIntakeArtifactLegend} data-testid="artifact-currentness-legend">
                    {INTAKE_ARTIFACT_CURRENTNESS_LEGEND}
                </p>
            : null}
            <ul className={formsCaseFileGroupedSurface}>
                {items.map((item) => (
                    <IntakeArtifactCard
                        key={item.key}
                        item={item}
                        openingDocId={openingDocId}
                        onOpenPdf={onOpenPdf}
                    />
                ))}
            </ul>
        </div>
    );
}

export function ArtifactsPanel({
    documentsIndex,
    displayItems: displayItemsProp,
    openingDocId = null,
    onOpenPdf,
    showCurrentnessLegend = true,
    pendingPdfGeneration = false,
    className,
    "data-testid": testId = "intake-artifacts-panel",
}: Props) {
    const items = itemsFromProps({ documentsIndex, displayItems: displayItemsProp });
    const pdfs = items.filter((i) => i.kind === "generated_pdf");
    const records = items.filter((i) => i.kind === "submitted_record");
    const empty = resolveIntakeDocumentsEmptyState({
        total: items.length,
        pdfCount: pdfs.length,
        recordCount: records.length,
        pendingPdfGeneration,
    });

    if (items.length === 0) {
        return (
            <p
                className={clsx(formsCaseFileMetaText, className)}
                data-testid={testId}
                data-empty-state={empty.key}
            >
                {empty.message}
            </p>
        );
    }

    return (
        <div className={clsx("space-y-4", className)} data-testid={testId}>
            <ArtifactKindGroup
                kind="generated_pdf"
                items={pdfs}
                openingDocId={openingDocId}
                onOpenPdf={onOpenPdf}
                showLegend={showCurrentnessLegend}
            />
            <ArtifactKindGroup
                kind="submitted_record"
                items={records}
                openingDocId={openingDocId}
                onOpenPdf={onOpenPdf}
                showLegend={false}
            />
        </div>
    );
}

/** Build display items from normalized related-document rows. */
export function intakeArtifactsFromNormalizedRows(
    rows: import("@/lib/admin/normalizeDocumentRow").NormalizedDocumentRow[]
): IntakeArtifactDisplayItem[] {
    const out: IntakeArtifactDisplayItem[] = [];
    for (const row of rows) {
        const item = intakeArtifactFromNormalizedRow(row);
        if (item) out.push(item);
    }
    return out;
}
