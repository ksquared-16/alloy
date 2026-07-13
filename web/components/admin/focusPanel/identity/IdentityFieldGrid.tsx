"use client";

import clsx from "clsx";
import type { IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityFieldValue from "@/components/admin/focusPanel/identity/IdentityFieldValue";

type Props = {
    rows: IdentityFieldRowVM[];
    className?: string;
    onEditField?: (fieldRef: string) => void;
};

export default function IdentityFieldGrid({ rows, className, onEditField }: Props) {
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
                    {row.cells.map((cell) => (
                        <IdentityFieldValue
                            key={cell.fieldRef}
                            cell={cell}
                            className={clsx(
                                "identity-field-grid__cell",
                                cell.width === "half" && "identity-field-grid__cell--half",
                                cell.width === "third" && "identity-field-grid__cell--third",
                                cell.width === "full" && "identity-field-grid__cell--full",
                            )}
                            onEdit={cell.editable && onEditField ? () => onEditField(cell.fieldRef) : undefined}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
