"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityFieldValue from "@/components/admin/focusPanel/identity/IdentityFieldValue";

export type IdentityFieldSaveArgs = {
    personId: string;
    fieldRef: string;
    value: string;
    /** Option label when `value` is a select/placement key — keeps display truth in sync. */
    displayLabel?: string | null;
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
    onLinkField?: (fieldRef: string) => void;
    /** When set, every editable field opens with one shared Cancel/Save owned by the parent. */
    batchEdit?: IdentityFieldBatchEditSession | null;
};

const SAVED_FLASH_MS = 1800;

export default function IdentityFieldGrid({
    rows,
    className,
    personId,
    onSaveField,
    onEditField,
    onLinkField,
    batchEdit = null,
}: Props) {
    const [editingFieldRef, setEditingFieldRef] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [justSavedFieldRef, setJustSavedFieldRef] = useState<string | null>(null);
    const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
        },
        [],
    );

    const flashSaved = (fieldRef: string) => {
        if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
        setJustSavedFieldRef(fieldRef);
        savedFlashTimer.current = setTimeout(() => {
            setJustSavedFieldRef((cur) => (cur === fieldRef ? null : cur));
            savedFlashTimer.current = null;
        }, SAVED_FLASH_MS);
    };

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
                                savedFlash={justSavedFieldRef === cell.fieldRef}
                                onEdit={
                                    cell.editable && onEditField && !canInline
                                        ? () => onEditField(cell.fieldRef)
                                        : undefined
                                }
                                onLink={
                                    cell.linked && onLinkField
                                        ? () => onLinkField(cell.fieldRef)
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
                                                onCommit: async (value, meta) => {
                                                    if (!personId || !onSaveField) return;
                                                    setSaving(true);
                                                    try {
                                                        const result = await onSaveField({
                                                            personId,
                                                            fieldRef: cell.fieldRef,
                                                            value,
                                                            displayLabel: meta?.displayLabel,
                                                        });
                                                        if (!result || result.ok !== false) {
                                                            setEditingFieldRef(null);
                                                            flashSaved(cell.fieldRef);
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
