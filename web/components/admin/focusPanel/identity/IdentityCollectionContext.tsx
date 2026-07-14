"use client";

import clsx from "clsx";
import type { IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityRecordSummary from "@/components/admin/focusPanel/identity/IdentityRecordSummary";
import type { IdentityFieldSaveArgs } from "@/components/admin/focusPanel/identity/IdentityFieldGrid";

type Props = {
    records: IdentityRecordVM[];
    className?: string;
    onSelectIdentity?: (recordId: string) => void;
    onEditContact?: (recordId: string) => void;
    onSaveField?: (args: IdentityFieldSaveArgs) => Promise<{ ok: boolean } | void>;
    /** When true, rows are selectable for Details depth. */
    selectable?: boolean;
    /**
     * When true, collection rows show Summary Fields only.
     * Default false: collection shows Summary + configured Context Facts.
     * Detail Fields never appear here — only after identity selection.
     */
    collectionSummaryOnly?: boolean;
};

/**
 * Collection view — one identity object per row.
 * Renders Summary fields plus configured Context Facts (when present).
 * Selecting an identity opens Details for that identity only.
 */
export default function IdentityCollectionContext({
    records,
    className,
    onSelectIdentity,
    onEditContact,
    onSaveField,
    selectable = true,
    collectionSummaryOnly = false,
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
                    onSaveField={onSaveField}
                    dataAttr={record.id}
                />
            ))}
        </div>
    );
}
