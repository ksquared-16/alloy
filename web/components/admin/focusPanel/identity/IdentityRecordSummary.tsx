"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import type { IdentityRecordVM, IdentityDisclosureDepth, IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import { identityRowsForDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityDisclosureVM";
import IdentityAvatar from "@/components/admin/focusPanel/identity/IdentityAvatar";
import type { IdentityAvatarSemanticRole } from "@/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar";
import IdentityFieldGrid, {
    type IdentityFieldBatchEditSession,
    type IdentityFieldSaveArgs,
} from "@/components/admin/focusPanel/identity/IdentityFieldGrid";
import IdentityRecordDetails from "@/components/admin/focusPanel/identity/IdentityRecordDetails";

export type IdentityFieldBatchSaveArgs = {
    personId: string;
    fields: Array<{ fieldRef: string; value: string }>;
};

type Props = {
    record: IdentityRecordVM;
    depth?: IdentityDisclosureDepth;
    className?: string;
    onEditContact?: (recordId: string) => void;
    onSaveField?: (args: IdentityFieldSaveArgs) => Promise<{ ok: boolean } | void>;
    /** Atomic multi-field save (preferred for person-level Edit). */
    onSaveFields?: (args: IdentityFieldBatchSaveArgs) => Promise<{ ok: boolean } | void>;
    onEditField?: (fieldRef: string) => void;
    onActivate?: (recordId: string) => void;
    dataAttr?: string;
};

function collectEditableFieldRefs(rows: IdentityFieldRowVM[]): string[] {
    const refs: string[] = [];
    for (const row of rows) {
        for (const cell of row.cells) {
            if (cell.editable) refs.push(cell.fieldRef);
        }
    }
    return refs;
}

function collectDraftSeed(rows: IdentityFieldRowVM[]): Record<string, string> {
    const drafts: Record<string, string> = {};
    for (const row of rows) {
        for (const cell of row.cells) {
            if (!cell.editable) continue;
            drafts[cell.fieldRef] = cell.value ?? "";
        }
    }
    return drafts;
}

export default function IdentityRecordSummary({
    record,
    depth = "summary",
    className,
    onEditContact,
    onSaveField,
    onSaveFields,
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

    const editableRows = useMemo(
        () => (showInlineDetails ? [...visibleRows, ...detailRows] : visibleRows),
        [showInlineDetails, visibleRows, detailRows],
    );
    const editableRefs = useMemo(() => collectEditableFieldRefs(editableRows), [editableRows]);
    const canBatchInline = Boolean(onSaveField || onSaveFields) && editableRefs.length > 0;

    const [batchEditing, setBatchEditing] = useState(false);
    const [batchDrafts, setBatchDrafts] = useState<Record<string, string>>({});
    const [batchBusy, setBatchBusy] = useState(false);

    const beginBatchEdit = () => {
        setBatchDrafts(collectDraftSeed(editableRows));
        setBatchEditing(true);
    };

    const cancelBatchEdit = () => {
        if (batchBusy) return;
        setBatchEditing(false);
        setBatchDrafts({});
    };

    const commitBatchEdit = async () => {
        if (batchBusy) return;
        const seed = collectDraftSeed(editableRows);
        const fields = editableRefs
            .map((fieldRef) => ({
                fieldRef,
                value: batchDrafts[fieldRef] ?? "",
            }))
            .filter((row) => row.value !== (seed[row.fieldRef] ?? ""));
        if (fields.length === 0) {
            setBatchEditing(false);
            setBatchDrafts({});
            return;
        }
        setBatchBusy(true);
        try {
            if (onSaveFields) {
                const result = await onSaveFields({ personId: record.id, fields });
                if (result && result.ok === false) return;
            } else if (onSaveField) {
                for (const field of fields) {
                    const result = await onSaveField({
                        personId: record.id,
                        fieldRef: field.fieldRef,
                        value: field.value,
                    });
                    if (result && result.ok === false) return;
                }
            } else {
                return;
            }
            setBatchEditing(false);
            setBatchDrafts({});
        } finally {
            setBatchBusy(false);
        }
    };

    const batchEditSession: IdentityFieldBatchEditSession | null = batchEditing
        ? {
              drafts: batchDrafts,
              busy: batchBusy,
              onCancel: cancelBatchEdit,
              onDraftChange: (fieldRef, value) => {
                  setBatchDrafts((prev) => ({ ...prev, [fieldRef]: value }));
              },
          }
        : null;

    // Prefer batch inline edit whenever field saves are available. Fall back to
    // contact_edit surface only when inline save is unavailable.
    const showPersonLevelEdit =
        !batchEditing
        && (hasEditableField || hasEditableDetailField)
        && (canBatchInline || Boolean(onEditContact));

    const onPersonEdit = () => {
        if (canBatchInline) {
            beginBatchEdit();
            return;
        }
        onEditContact?.(record.id);
    };

    return (
        <div
            className={clsx("identity-record-summary", className)}
            data-identity-record={dataAttr ?? record.id}
            data-identity-depth={depth}
            data-identity-batch-editing={batchEditing ? "true" : undefined}
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
                    <IdentityFieldGrid
                        rows={visibleRows}
                        personId={record.id}
                        onSaveField={onSaveField}
                        onEditField={batchEditing ? undefined : onEditField}
                        batchEdit={batchEditSession}
                    />
                    {showInlineDetails && detailRows.length > 0 ? (
                        <IdentityRecordDetails
                            rows={detailRows}
                            personId={record.id}
                            onSaveField={onSaveField}
                            onEditField={batchEditing ? undefined : onEditField}
                            batchEdit={batchEditSession}
                            defaultOpen
                        />
                    ) : null}
                    {onActivate && !batchEditing ? (
                        <button
                            type="button"
                            className="identity-record-summary__open-details"
                            data-identity-open-details={record.id}
                            onClick={() => onActivate(record.id)}
                            aria-label={`Open details for ${record.title}`}
                        >
                            Details →
                        </button>
                    ) : null}
                </div>
                {showPersonLevelEdit ? (
                    <button
                        type="button"
                        className="identity-record-summary__edit"
                        data-household-edit-contact={record.id}
                        data-identity-batch-edit-trigger="true"
                        onClick={onPersonEdit}
                    >
                        Edit
                    </button>
                ) : null}
            </div>
            {batchEditing ? (
                <div className="identity-record-summary__batch-actions" data-identity-batch-actions="true">
                    <button
                        type="button"
                        className="identity-record-summary__edit identity-record-summary__edit--cancel"
                        disabled={batchBusy}
                        onClick={cancelBatchEdit}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="identity-record-summary__edit identity-record-summary__edit--save"
                        disabled={batchBusy}
                        onClick={() => void commitBatchEdit()}
                    >
                        Save
                    </button>
                </div>
            ) : null}
        </div>
    );
}
