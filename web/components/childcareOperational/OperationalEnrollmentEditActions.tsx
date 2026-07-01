"use client";

import { useState } from "react";
import {
    OPERATIONAL_ENROLLMENT_EDIT_ACTION_LABELS,
    type OperationalEnrollmentEditActionKey,
    resolveOperationalEnrollmentEditActions,
} from "@/lib/childcareOperational/operationalEnrollmentEditDoctrine";
import type { OperationalEnrollmentSummaryResponse } from "@/lib/childcareOperational/fetchOperationalEnrollment";
import ChangeOperationalPlacementModal from "@/components/childcareOperational/ChangeOperationalPlacementModal";
import ChangeOperationalScheduleModal from "@/components/childcareOperational/ChangeOperationalScheduleModal";
import AgreementScheduleWithdrawalModal from "@/components/childcareOperational/AgreementScheduleWithdrawalModal";
import AgreementLifecycleConfirmModal from "@/components/childcareOperational/AgreementLifecycleConfirmModal";

type Props = {
    summary: OperationalEnrollmentSummaryResponse["summary"];
    onRefresh: () => void;
};

type OpenModal = OperationalEnrollmentEditActionKey | null;

export default function OperationalEnrollmentEditActions({ summary, onRefresh }: Props) {
    const [openModal, setOpenModal] = useState<OpenModal>(null);
    const actions = resolveOperationalEnrollmentEditActions(summary);
    const agreement = summary.agreement;

    if (!agreement || actions.length === 0) return null;

    function open(action: OperationalEnrollmentEditActionKey) {
        setOpenModal(action);
    }

    function close() {
        setOpenModal(null);
    }

    function handleSuccess() {
        onRefresh();
    }

    return (
        <div className="mt-3 border-t border-alloy-stone/15 pt-3" data-operational-enrollment-edit-actions="true">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                Enrollment actions
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
                {actions.map((action) => (
                    <button
                        key={action}
                        type="button"
                        className="rounded-md border border-alloy-forge/20 bg-white px-2.5 py-1 text-[11px] font-semibold text-alloy-midnight shadow-sm hover:bg-alloy-stone/5"
                        data-operational-edit-action={action}
                        onClick={() => open(action)}
                    >
                        {OPERATIONAL_ENROLLMENT_EDIT_ACTION_LABELS[action]}
                    </button>
                ))}
            </div>

            <ChangeOperationalPlacementModal
                open={openModal === "change_placement"}
                summary={summary}
                onClose={close}
                onSuccess={handleSuccess}
            />
            <ChangeOperationalScheduleModal
                open={openModal === "change_schedule"}
                summary={summary}
                onClose={close}
                onSuccess={handleSuccess}
            />
            <AgreementScheduleWithdrawalModal
                open={openModal === "schedule_withdrawal"}
                agreement={agreement}
                onClose={close}
                onSuccess={handleSuccess}
            />
            <AgreementLifecycleConfirmModal
                open={openModal === "mark_ended"}
                variant="mark_ended"
                agreement={agreement}
                onClose={close}
                onSuccess={handleSuccess}
            />
            <AgreementLifecycleConfirmModal
                open={openModal === "cancel_agreement"}
                variant="cancel_agreement"
                agreement={agreement}
                onClose={close}
                onSuccess={handleSuccess}
            />
        </div>
    );
}
