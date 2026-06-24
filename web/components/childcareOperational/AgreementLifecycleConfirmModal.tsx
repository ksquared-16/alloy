"use client";

import { useEffect, useState } from "react";
import {
    cancelChildEnrollmentAgreementBeforeStart,
    markChildEnrollmentAgreementEnded,
} from "@/lib/childcareOperational/fetchOperationalEnrollmentMutations";
import { formatOperationalEnrollmentDate } from "@/lib/childcareOperational/fetchOperationalEnrollment";
import type { ChildEnrollmentAgreementRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import OperationalEnrollmentModalChrome from "@/components/childcareOperational/OperationalEnrollmentModalChrome";

type Props = {
    open: boolean;
    variant: "mark_ended" | "cancel_agreement";
    agreement: ChildEnrollmentAgreementRow;
    onClose: () => void;
    onSuccess: () => void;
};

export default function AgreementLifecycleConfirmModal({
    open,
    variant,
    agreement,
    onClose,
    onSuccess,
}: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setBusy(false);
    }, [open]);

    const isCancel = variant === "cancel_agreement";
    const title = isCancel ? "Cancel agreement before start?" : "Mark enrollment ended?";
    const description = isCancel
        ? "Cancel this agreement before the enrollment start date. This cannot be undone."
        : "End this enrollment agreement immediately. Committed placement and schedule rows remain in history.";

    async function handleSubmit() {
        setError(null);
        setBusy(true);
        try {
            if (isCancel) {
                await cancelChildEnrollmentAgreementBeforeStart(agreement.id);
            } else {
                await markChildEnrollmentAgreementEnded(agreement.id);
            }
            onSuccess();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Request failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <OperationalEnrollmentModalChrome
            open={open}
            title={title}
            description={description}
            busy={busy}
            onClose={onClose}
            onSubmit={handleSubmit}
            submitLabel={isCancel ? "Cancel agreement" : "Mark ended"}
            testId={isCancel ? "cancel-agreement-modal" : "mark-agreement-ended-modal"}
        >
            <div className="rounded-md border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-2 text-xs text-alloy-midnight/80">
                <div>Status: {agreement.status.replace(/_/g, " ")}</div>
                <div className="mt-1">
                    Start {formatOperationalEnrollmentDate(agreement.start_date)}
                    {agreement.end_date ?
                        ` · end ${formatOperationalEnrollmentDate(agreement.end_date)}`
                    :   ""}
                </div>
            </div>
            {isCancel ?
                <p className="text-xs leading-relaxed text-amber-900/90">
                    Only agreements that have not started can be canceled. Active enrollments use withdrawal or
                    mark ended instead.
                </p>
            :   <p className="text-xs leading-relaxed text-amber-900/90">
                    This sets the agreement to <span className="font-medium">ended</span>. Use schedule withdrawal
                    first if the child should remain active until a future date.
                </p>
            }
            {error ?
                <p className="text-sm text-alloy-ember">{error}</p>
            :   null}
        </OperationalEnrollmentModalChrome>
    );
}
