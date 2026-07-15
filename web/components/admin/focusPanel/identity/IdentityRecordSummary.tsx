"use client";

import clsx from "clsx";
import type { IdentityRecordVM, IdentityDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import { identityRowsForDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityDisclosureVM";
import IdentityAvatar from "@/components/admin/focusPanel/identity/IdentityAvatar";
import type { IdentityAvatarSemanticRole } from "@/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar";
import IdentityFieldGrid, { type IdentityFieldSaveArgs } from "@/components/admin/focusPanel/identity/IdentityFieldGrid";
import IdentityRecordDetails from "@/components/admin/focusPanel/identity/IdentityRecordDetails";

type Props = {
    record: IdentityRecordVM;
    depth?: IdentityDisclosureDepth;
    className?: string;
    onEditContact?: (recordId: string) => void;
    onSaveField?: (args: IdentityFieldSaveArgs) => Promise<{ ok: boolean } | void>;
    onEditField?: (fieldRef: string) => void;
    onActivate?: (recordId: string) => void;
    dataAttr?: string;
};

export default function IdentityRecordSummary({
    record,
    depth = "summary",
    className,
    onEditContact,
    onSaveField,
    onEditField,
    onActivate,
    dataAttr,
}: Props) {
    const { visibleRows, detailRows } = identityRowsForDisclosureDepth(record, depth);
    const showInlineDetails = depth === "details" || depth === "evidence";
    const hasEditableField = visibleRows.some((row) =>
        row.cells.some((cell) => cell.editable),
    );
    const isPrimaryBadge = record.badge ? /^primary$/i.test(record.badge.trim()) : false;
    const hasEditableDetailField =
        showInlineDetails
        && detailRows.some((row) => row.cells.some((cell) => cell.editable));

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
                    role={record.avatar?.role as IdentityAvatarSemanticRole | undefined}
                    recordId={record.id}
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
                            <span
                                className={clsx(
                                    "alloy-os-card-pill",
                                    isPrimaryBadge ? "alloy-os-card-pill--positive" : "alloy-os-card-pill--neutral",
                                    "identity-record-summary__badge",
                                )}
                            >
                                {record.badge}
                            </span>
                        ) : null}
                    </span>
                    <IdentityFieldGrid rows={visibleRows} personId={record.id} onSaveField={onSaveField} onEditField={onEditField} />
                </div>
                {onEditContact && (hasEditableField || hasEditableDetailField) ? (
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
                <IdentityRecordDetails rows={detailRows} personId={record.id} onSaveField={onSaveField} onEditField={onEditField} defaultOpen />
            ) : null}
        </div>
    );
}
