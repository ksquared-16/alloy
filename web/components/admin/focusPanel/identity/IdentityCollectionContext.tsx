"use client";

import clsx from "clsx";
import type { IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityRecordSummary from "@/components/admin/focusPanel/identity/IdentityRecordSummary";

type Props = {
    records: IdentityRecordVM[];
    className?: string;
    onSelectIdentity?: (recordId: string) => void;
    onEditContact?: (recordId: string) => void;
    onEditField?: (fieldRef: string) => void;
    /** When true, rows are selectable for Details depth. */
    selectable?: boolean;
    /** Context collection shows Summary Fields only — not inspection-level detail rows. */
    collectionSummaryOnly?: boolean;
};

/**
 * Context collection — one identity object per row using Summary Fields.
 * Selecting an identity opens Details for that identity only.
 */
export default function IdentityCollectionContext({
    records,
    className,
    onSelectIdentity,
    onEditContact,
    onEditField,
    selectable = true,
    collectionSummaryOnly = true,
}: Props) {
    if (records.length === 0) return null;

    return (
        <div className={clsx("identity-collection-context", className)} data-identity-collection-context="true">
            {records.map((record) => (
                <IdentityRecordSummary
                    key={record.id}
                    record={record}
                    depth={collectionSummaryOnly ? "summary" : "context"}
                    onActivate={selectable && onSelectIdentity ? onSelectIdentity : undefined}
                    onEditContact={onEditContact}
                    onEditField={onEditField}
                    dataAttr={record.id}
                />
            ))}
        </div>
    );
}
