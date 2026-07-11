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
};

/** Context collection — composed Summary + Context Facts via shared VM rows. */
export default function IdentityCollectionContext({
    records,
    className,
    onSelectIdentity,
    onEditContact,
    onEditField,
    selectable = true,
}: Props) {
    if (records.length === 0) return null;

    return (
        <div className={clsx("identity-collection-context", className)} data-identity-collection-context="true">
            {records.map((record) => (
                <IdentityRecordSummary
                    key={record.id}
                    record={record}
                    depth="context"
                    onActivate={selectable && onSelectIdentity ? onSelectIdentity : undefined}
                    onEditContact={onEditContact}
                    onEditField={onEditField}
                    dataAttr={record.id}
                />
            ))}
        </div>
    );
}
