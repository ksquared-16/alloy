"use client";

import clsx from "clsx";
import type { IdentityRecordVM, IdentityDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import { identityRowsForDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityDisclosureVM";
import IdentityAvatar from "@/components/admin/focusPanel/identity/IdentityAvatar";
import IdentityFieldGrid from "@/components/admin/focusPanel/identity/IdentityFieldGrid";
import IdentityRecordDetails from "@/components/admin/focusPanel/identity/IdentityRecordDetails";

type Props = {
    record: IdentityRecordVM;
    depth?: IdentityDisclosureDepth;
    className?: string;
    onEditContact?: (recordId: string) => void;
    onEditField?: (fieldRef: string) => void;
    onActivate?: (recordId: string) => void;
    dataAttr?: string;
};

export default function IdentityRecordSummary({
    record,
    depth = "summary",
    className,
    onEditContact,
    onEditField,
    onActivate,
    dataAttr,
}: Props) {
    const { visibleRows, detailRows } = identityRowsForDisclosureDepth(record, depth);
    const hasEditableField = [...visibleRows, ...detailRows].some((row) =>
        row.cells.some((cell) => cell.editable),
    );
    const showInlineDetails = depth === "details" || depth === "evidence";

    return (
        <div
            className={clsx("identity-record-summary", className)}
            data-identity-record={dataAttr ?? record.id}
            data-identity-depth={depth}
        >
            <div className="identity-record-summary__header">
                <IdentityAvatar
                    name={record.title}
                    imageUrl={record.avatar?.imageUrl}
                    visible={record.avatar?.visible !== false}
                />
                <div className="identity-record-summary__title-block min-w-0">
                    <span className="identity-record-summary__title">
                        {onActivate ? (
                            <button
                                type="button"
                                className="identity-record-summary__activate"
                                onClick={() => onActivate(record.id)}
                            >
                                {record.title}
                            </button>
                        ) : (
                            record.title
                        )}
                        {record.badge ? (
                            <span className="alloy-os-card-pill alloy-os-card-pill--neutral identity-record-summary__badge">
                                {record.badge}
                            </span>
                        ) : null}
                    </span>
                    <IdentityFieldGrid rows={visibleRows} onEditField={onEditField} />
                </div>
                {onEditContact && hasEditableField ? (
                    <button
                        type="button"
                        className="identity-record-summary__edit"
                        data-household-edit-contact={record.id}
                        onClick={() => onEditContact(record.id)}
                    >
                        Edit
                    </button>
                ) : null}
            </div>
            {showInlineDetails && detailRows.length > 0 ? (
                <IdentityRecordDetails rows={detailRows} onEditField={onEditField} defaultOpen />
            ) : null}
        </div>
    );
}
