"use client";

import { useCallback, useState } from "react";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import {
    BosReviewSummaryPlaceholder,
    DocumentsRecordsPanel,
    IntakeCaseFileLayout,
    NeedsAttentionPanel,
    PacketCaseFileHeader,
    PacketIntakeContextPanel,
    PacketReviewTechnicalPanel,
    PacketSubmittedFormsPanel,
    WhatChangedPanel,
} from "@/components/forms/review";

export type PacketReviewTechnicalDetails = {
    launch_context: unknown;
    crm_snapshot: unknown;
    shared_values: unknown;
    identifiers?: {
        packet_session_id?: string;
        opportunity_id?: string | null;
        customer_id?: string | null;
        recipient_person_id?: string | null;
        packet_definition_key?: string | null;
    };
};

type Props = {
    rollup: PacketReviewRollupV1;
    technicalDetails?: PacketReviewTechnicalDetails | null;
    placement?: "page" | "modal";
    reviewActionsSlot?: React.ReactNode;
};

async function openDocumentSignedUrl(docId: string): Promise<string | null> {
    const res = await fetch(`/api/admin/documents/${encodeURIComponent(docId)}/signed-url`, {
        credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signedUrl?: string; error?: string };
    if (!res.ok || !json.ok || !json.signedUrl) {
        return json.error ?? `Could not open file (${res.status})`;
    }
    window.open(json.signedUrl, "_blank", "noopener,noreferrer");
    return null;
}

export function PacketReviewRollupView({
    rollup,
    technicalDetails,
    placement = "page",
    reviewActionsSlot,
}: Props) {
    const compact = placement === "modal";
    const [openingDocId, setOpeningDocId] = useState<string | null>(null);
    const [openDocErr, setOpenDocErr] = useState<string | null>(null);

    const onOpenPdf = useCallback(async (docId: string) => {
        setOpenDocErr(null);
        setOpeningDocId(docId);
        try {
            const err = await openDocumentSignedUrl(docId);
            if (err) setOpenDocErr(err);
        } catch (e) {
            setOpenDocErr(e instanceof Error ? e.message : "Failed to open document");
        } finally {
            setOpeningDocId(null);
        }
    }, []);

    const needsAttention = <NeedsAttentionPanel rollup={rollup} />;

    return (
        <IntakeCaseFileLayout
            compact={compact}
            header={<PacketCaseFileHeader rollup={rollup} />}
            intakeContext={<PacketIntakeContextPanel rollup={rollup} />}
            bosSummary={<BosReviewSummaryPlaceholder />}
            whatChanged={<WhatChangedPanel warnings={rollup.operator_review.warnings} />}
            needsAttention={needsAttention}
            submittedForms={<PacketSubmittedFormsPanel rollup={rollup} />}
            documents={
                <DocumentsRecordsPanel
                    documentsIndex={rollup.documents_index}
                    openingDocId={openingDocId}
                    onOpenPdf={(id) => void onOpenPdf(id)}
                />
            }
            reviewActions={reviewActionsSlot ?? null}
            technical={
                technicalDetails ?
                    <PacketReviewTechnicalPanel rollup={rollup} technicalDetails={technicalDetails} />
                :   null
            }
            after={
                openDocErr ?
                    <p className="text-xs text-alloy-ember" role="alert">
                        {openDocErr}
                    </p>
                :   null
            }
        />
    );
}
