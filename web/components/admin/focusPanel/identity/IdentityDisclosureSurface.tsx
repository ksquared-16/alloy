"use client";

import clsx from "clsx";
import type { IdentityDisclosureDepth, IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityRecordSummary from "@/components/admin/focusPanel/identity/IdentityRecordSummary";
import IdentityRecordDetails from "@/components/admin/focusPanel/identity/IdentityRecordDetails";
import IdentityEvidenceCollections from "@/components/admin/focusPanel/identity/IdentityEvidenceCollections";

type Props = {
    record: IdentityRecordVM;
    depth: Extract<IdentityDisclosureDepth, "details" | "evidence">;
    className?: string;
    onEditContact?: (recordId: string) => void;
    onEditField?: (fieldRef: string) => void;
    onSelectEvidenceCollection?: (key: string) => void;
    onEnterEvidence?: () => void;
};

/** Details or Evidence depth for one selected identity. */
export default function IdentityDisclosureSurface({
    record,
    depth,
    className,
    onEditContact,
    onEditField,
    onSelectEvidenceCollection,
    onEnterEvidence,
}: Props) {
    const detailRows = record.detailRows.length > 0 ? record.detailRows : record.detailsRows;

    return (
        <div
            className={clsx("identity-disclosure-surface", className)}
            data-identity-disclosure-surface={depth}
            data-identity-record={record.id}
        >
            <IdentityRecordSummary
                record={record}
                depth="context"
                onEditContact={onEditContact}
                onEditField={onEditField}
            />
            {depth === "details" ?
                <>
                    <IdentityRecordDetails rows={detailRows} onEditField={onEditField} defaultOpen />
                    {record.evidenceCollections && record.evidenceCollections.length > 0 && onEnterEvidence ?
                        <button
                            type="button"
                            className="identity-disclosure-surface__evidence-link alloy-os-ucard__action alloy-os-ucard__action--system5"
                            onClick={onEnterEvidence}
                        >
                            View evidence →
                        </button>
                    :   null}
                </>
            :   null}
            {depth === "evidence" ?
                <IdentityEvidenceCollections
                    collections={record.evidenceCollections ?? []}
                    onSelectCollection={onSelectEvidenceCollection}
                />
            :   null}
        </div>
    );
}
