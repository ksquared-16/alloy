"use client";

import { useEffect, useState } from "react";
import {
    markChildEnrollmentAgreementEnding,
    operationalEnrollmentClientTodayYmd,
} from "@/lib/childcareOperational/fetchOperationalEnrollmentMutations";
import { formatOperationalEnrollmentDate } from "@/lib/childcareOperational/fetchOperationalEnrollment";
import type { ChildEnrollmentAgreementRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import OperationalEnrollmentModalChrome from "@/components/childcareOperational/OperationalEnrollmentModalChrome";

type Props = {
    open: boolean;
    agreement: ChildEnrollmentAgreementRow;
    onClose: () => void;
    onSuccess: () => void;
};

export default function AgreementScheduleWithdrawalModal({ open, agreement, onClose, onSuccess }: Props) {
    const [endDate, setEndDate] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setEndDate("");
        setError(null);
        setBusy(false);
    }, [open]);

    const today = operationalEnrollmentClientTodayYmd();
    const endAfterToday = endDate.trim() > today;
    const canSubmit = endDate.trim().length > 0 && endAfterToday && !busy;

    async function handleSubmit() {
        setError(null);
        setBusy(true);
        try {
            await markChildEnrollmentAgreementEnding(agreement.id, endDate.trim());
            onSuccess();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to schedule withdrawal");
        } finally {
            setBusy(false);
        }
    }

    return (
        <OperationalEnrollmentModalChrome
            open={open}
            title="Schedule withdrawal"
            description="Set a future end date while the child remains active until that date."
            busy={busy}
            onClose={onClose}
            onSubmit={handleSubmit}
            submitLabel="Schedule withdrawal"
            submitDisabled={!canSubmit}
            testId="agreement-schedule-withdrawal-modal"
        >
            <p className="text-xs leading-relaxed text-alloy-midnight/65">
                The agreement moves to <span className="font-medium">ending</span>. Placement and schedule
                history remain; the child stays enrolled until the end date.
            </p>
            <div className="rounded-md border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-2 text-xs text-alloy-midnight/80">
                <div>Current status: {agreement.status.replace(/_/g, " ")}</div>
                <div className="mt-1">
                    Start {formatOperationalEnrollmentDate(agreement.start_date)}
                    {agreement.end_date ?
                        ` · end ${formatOperationalEnrollmentDate(agreement.end_date)}`
                    :   ""}
                </div>
            </div>
            <label className="block text-xs font-medium text-alloy-midnight">
                Withdrawal end date
                <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                    value={endDate}
                    min={today}
                    disabled={busy}
                    onChange={(e) => setEndDate(e.target.value)}
                />
            </label>
            {!endAfterToday && endDate.trim() ?
                <p className="text-xs text-alloy-ember">End date must be after today.</p>
            :   null}
            {error ?
                <p className="text-sm text-alloy-ember">{error}</p>
            :   null}
        </OperationalEnrollmentModalChrome>
    );
}
