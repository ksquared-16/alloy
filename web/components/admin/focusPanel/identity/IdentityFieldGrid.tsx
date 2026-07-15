"use client";

import { useState } from "react";
import clsx from "clsx";
import type { IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityFieldValue from "@/components/admin/focusPanel/identity/IdentityFieldValue";

export type IdentityFieldSaveArgs = {
    personId: string;
    fieldRef: string;
    value: string;
};

export type IdentityFieldBatchEditSession = {
    drafts: Record<string, string>;
    onDraftChange: (fieldRef: string, value: string) => void;
    onCancel: () => void;
    busy?: boolean;
};

type Props = {
    rows: IdentityFieldRowVM[];
    className?: string;
    personId?: string;
    onSaveField?: (args: IdentityFieldSaveArgs) => Promise<{ ok: boolean } | void>;
    onEditField?: (fieldRef: string) => void;
    /** When set, every editable field opens with one shared Cancel/Save owned by the parent. */
    batchEdit?: IdentityFieldBatchEditSession | null;
};

export default function IdentityFieldGrid({
    rows,
    className,
    personId,
    onSaveField,
    onEditField,
    batchEdit = null,
}: Props) {
    const [editingFieldRef, setEditingFieldRef] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    if (rows.length === 0) return null;
    return (
        <div className={clsx("identity-field-grid", className)} data-identity-field-grid="true">
            {rows.map((row) => (
                <div
                    key={`row-${row.row}-${row.cells.map((cell) => cell.fieldRef).join("-")}`}
                    className={clsx(
                        "identity-field-grid__row",
                        row.cells.length === 2 && "identity-field-grid__row--pair",
                        row.cells.length === 3 && "identity-field-grid__row--triple",
                    )}
                    data-identity-row={row.cells.length === 3 ? "triple" : row.cells.length === 2 ? "pair" : "single"}
                >
                    {row.cells.map((cell) => {
                        const canInline =
                            Boolean(cell.editable && personId && (onSaveField || batchEdit));
                        const inBatch = Boolean(batchEdit && cell.editable && personId);
                        return (
                            <IdentityFieldValue
                                key={cell.fieldRef}
                                cell={cell}
                                className={clsx(
                                    "identity-field-grid__cell",
                                    cell.width === "half" && "identity-field-grid__cell--half",
                                    cell.width === "third" && "identity-field-grid__cell--third",
                                    cell.width === "full" && "identity-field-grid__cell--full",
                                )}
                                onEdit={
                                    cell.editable && onEditField && !canInline
                                        ? () => onEditField(cell.fieldRef)
                                        : undefined
                                }
                                inlineEdit={
                                    inBatch && batchEdit
                                        ? {
                                              isEditing: true,
                                              busy: batchEdit.busy,
                                              sharedSession: true,
                                              draftValue: batchEdit.drafts[cell.fieldRef] ?? cell.value ?? "",
                                              onDraftChange: (value) => batchEdit.onDraftChange(cell.fieldRef, value),
                                              onStartEdit: () => undefined,
                                              onCancel: batchEdit.onCancel,
                                              onCommit: async () => undefined,
                                          }
                                        : canInline
                                          ? {
                                                isEditing: editingFieldRef === cell.fieldRef,
                                                busy: saving,
                                                onStartEdit: () => setEditingFieldRef(cell.fieldRef),
                                                onCancel: () => setEditingFieldRef(null),
                                                onCommit: async (value) => {
                                                    if (!personId || !onSaveField) return;
                                                    setSaving(true);
                                                    try {
                                                        const result = await onSaveField({
                                                            personId,
                                                            fieldRef: cell.fieldRef,
                                                            value,
                                                        });
                                                        if (!result || result.ok !== false) {
                                                            setEditingFieldRef(null);
                                                        }
                                                    } finally {
                                                        setSaving(false);
                                                    }
                                                },
                                            }
                                          : undefined
                                }
                            />
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
