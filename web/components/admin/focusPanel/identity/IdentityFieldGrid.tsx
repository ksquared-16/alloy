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

type Props = {
    rows: IdentityFieldRowVM[];
    className?: string;
    personId?: string;
    onSaveField?: (args: IdentityFieldSaveArgs) => Promise<{ ok: boolean } | void>;
    onEditField?: (fieldRef: string) => void;
};

export default function IdentityFieldGrid({ rows, className, personId, onSaveField, onEditField }: Props) {
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
                            Boolean(cell.editable && personId && onSaveField);
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
                                    canInline
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
