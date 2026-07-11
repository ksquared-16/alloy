"use client";

import clsx from "clsx";
import type { IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityAvatar from "@/components/admin/focusPanel/identity/IdentityAvatar";
import IdentityFieldGrid from "@/components/admin/focusPanel/identity/IdentityFieldGrid";
import IdentityExpandedDetails from "@/components/admin/focusPanel/identity/IdentityExpandedDetails";

type Props = {
    record: IdentityRecordVM;
    className?: string;
    onEditContact?: (recordId: string) => void;
    onEditField?: (fieldRef: string) => void;
    onActivate?: (recordId: string) => void;
    dataAttr?: string;
};

export default function IdentityRecordSummary({
    record,
    className,
    onEditContact,
    onEditField,
    onActivate,
    dataAttr,
}: Props) {
    const hasEditableField = [...record.summaryRows, ...record.expandedRows].some((row) =>
        row.cells.some((cell) => cell.editable),
    );
    return (
        <div
            className={clsx("identity-record-summary", className)}
            data-identity-record={dataAttr ?? record.id}
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
                    <IdentityFieldGrid rows={record.summaryRows} onEditField={onEditField} />
                </div>
                {onEditContact && hasEditableField ? (
                    <button
                        type="button"
                        className="identity-record-summary__edit"
                        onClick={() => onEditContact(record.id)}
                    >
                        Edit
                    </button>
                ) : null}
            </div>
            <IdentityExpandedDetails rows={record.expandedRows} onEditField={onEditField} />
        </div>
    );
}
