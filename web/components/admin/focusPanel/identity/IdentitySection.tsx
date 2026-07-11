"use client";

import clsx from "clsx";
import type { IdentitySectionVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityRecordSummary from "@/components/admin/focusPanel/identity/IdentityRecordSummary";

type Props = {
    section: IdentitySectionVM;
    className?: string;
    onEditContact?: (recordId: string) => void;
    onEditField?: (fieldRef: string) => void;
    composing?: boolean;
    addFieldSlot?: React.ReactNode;
};

export default function IdentitySection({
    section,
    className,
    onEditContact,
    onEditField,
    composing = false,
    addFieldSlot,
}: Props) {
    return (
        <section
            className={clsx("identity-section", className)}
            data-identity-section={section.key}
        >
            {section.label ? <h4 className="identity-section__label">{section.label}</h4> : null}
            {section.items.length > 0 ? (
                section.items.map((record) => (
                    <IdentityRecordSummary
                        key={record.id}
                        record={record}
                        onEditContact={onEditContact}
                        onEditField={onEditField}
                    />
                ))
            ) : composing ? (
                <p className="identity-section__empty">{section.emptyState?.label ?? "No records yet"}</p>
            ) : null}
            {addFieldSlot}
        </section>
    );
}
