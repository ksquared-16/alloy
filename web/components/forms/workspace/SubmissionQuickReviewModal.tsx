"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import SecondaryButton from "@/components/SecondaryButton";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import type { IntakeQuickReviewCaseContext } from "@/lib/forms/intakeQuickReviewPresentation";
import { buildIntakeQuickReviewViewModel } from "@/lib/forms/intakeQuickReviewPresentation";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";
import {
    opBody,
    opContextLabel,
    opMetadata,
    opMutedMeta,
    opOrientationSurface,
} from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    open: boolean;
    onClose: () => void;
    row: SubmissionInboxRow | null;
    formName: string;
    viewerTz: string;
    onUpdated?: () => void;
    /** When opened from a grouped intake case row (IC-3 / IC-5.6). */
    submissionCount?: number;
    caseContext?: IntakeQuickReviewCaseContext;
};

function submitterLine(row: SubmissionInboxRow): string | null {
    const payload = row.payload as Record<string, unknown> | undefined;
    const values = payload?.values;
    if (!values || typeof values !== "object" || Array.isArray(values)) return null;
    const v = values as Record<string, unknown>;
    const emailRaw = v.guardian_email;
    const email = typeof emailRaw === "string" ? emailRaw.trim() : "";
    return email || null;
}

function statusBadgeTone(tone: "success" | "warning" | "neutral"): "success" | "warning" | "neutral" {
    return tone;
}

/** Centered quick review modal — intake-case oriented operator summary (IC-6). */
export function SubmissionQuickReviewModal({
    open,
    onClose,
    row,
    formName,
    viewerTz,
    onUpdated,
    submissionCount,
    caseContext,
}: Props) {
    const { canMutate, role } = useAdminAuth();
    const focusRecord = useOperatorRecordFocus();
    const canConfirm = role === "admin" || role === "ops";
    const [confirmBusy, setConfirmBusy] = useState(false);
    const [confirmErr, setConfirmErr] = useState<string | null>(null);
    const [confirmOk, setConfirmOk] = useState(false);

    useEffect(() => {
        if (!open) {
            setConfirmErr(null);
            setConfirmOk(false);
            setConfirmBusy(false);
        }
    }, [open, row?.id]);

    const submittedAtLabel = useMemo(() => {
        if (!row) return "";
        const iso = row.submitted_at ?? row.created_at;
        return formatDateTimeForUserDisplay(iso, viewerTz);
    }, [row, viewerTz]);

    const viewModel = useMemo(() => {
        if (!row) return null;
        return buildIntakeQuickReviewViewModel({
            row,
            formName,
            submittedAtLabel,
            submissionCount,
            caseContext,
        });
    }, [row, formName, submittedAtLabel, submissionCount, caseContext]);

    const confirmMatch = useCallback(async () => {
        if (!row?.id) return;
        setConfirmBusy(true);
        setConfirmErr(null);
        try {
            const res = await fetch(`/api/admin/forms/submissions/${encodeURIComponent(row.id)}/confirm-linkage`, {
                method: "POST",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Confirm failed");
            setConfirmOk(true);
            onUpdated?.();
        } catch (e) {
            setConfirmErr((e as Error).message);
        } finally {
            setConfirmBusy(false);
        }
    }, [row?.id, onUpdated]);

    if (!open || !row || !viewModel) return null;

    const detailHref = viewModel.intakeFileHref;
    const email = submitterLine(row);
    const who = viewModel.headerTitle;
    const leadFields = viewModel.leadCreatedFields;

    const openLead = () => {
        if (!viewModel.opportunityId) return;
        void focusRecord({ entity_type: "opportunities", entity_id: viewModel.opportunityId }).then((moved) => {
            if (moved) onClose();
        });
    };

    const overlay = "fixed inset-0 z-[120] bg-black/20 backdrop-blur-[1px]";
    const panel =
        "fixed left-1/2 top-1/2 z-[121] flex max-h-[min(88vh,720px)] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-admin-border bg-white shadow-xl";

    const showConfirmBlock = viewModel.showConfirmLinkage && canConfirm && !confirmOk;

    return (
        <>
            <div className={overlay} onClick={onClose} aria-hidden="true" />
            <div
                className={panel}
                role="dialog"
                aria-modal="true"
                aria-label="Quick intake review"
                data-testid="submission-quick-review-modal"
            >
                <div className="flex items-start justify-between gap-3 border-b border-alloy-stone/15 px-5 py-4">
                    <div className="min-w-0">
                        <p className={opContextLabel}>
                            {viewModel.leadCreatedMode ? "Quick review" : "Intake case review"}
                        </p>
                        {who ?
                            <p className="text-sm font-semibold text-alloy-midnight">{who}</p>
                        :   null}
                        {!viewModel.leadCreatedMode && email ?
                            <p className={opMutedMeta}>{email}</p>
                        :   null}
                        <p className={clsx("mt-0.5", opMutedMeta)}>
                            {viewModel.leadCreatedMode ?
                                `${formName} · Submitted ${submittedAtLabel}`
                            :   `${formName} · Submitted ${submittedAtLabel}`}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {viewModel.leadCreatedMode && leadFields ?
                        <section data-testid="quick-review-lead-created-fields">
                            <p className={opContextLabel}>Lead details</p>
                            <dl className={clsx(opOrientationSurface, "mt-2 space-y-2")}>
                                {leadFields.contactName ?
                                    <div>
                                        <dt className={opMetadata}>Guardian / contact</dt>
                                        <dd className={opBody}>{leadFields.contactName}</dd>
                                    </div>
                                :   null}
                                {leadFields.email ?
                                    <div>
                                        <dt className={opMetadata}>Email</dt>
                                        <dd className={opBody}>{leadFields.email}</dd>
                                    </div>
                                :   null}
                                {leadFields.phone ?
                                    <div>
                                        <dt className={opMetadata}>Phone</dt>
                                        <dd className={opBody}>{leadFields.phone}</dd>
                                    </div>
                                :   null}
                                {leadFields.school ?
                                    <div>
                                        <dt className={opMetadata}>School</dt>
                                        <dd className={opBody}>{leadFields.school}</dd>
                                    </div>
                                :   null}
                                <div>
                                    <dt className={opMetadata}>Status</dt>
                                    <dd className={opBody}>{leadFields.status}</dd>
                                </div>
                            </dl>
                        </section>
                    :   null}

                    <section data-testid="quick-review-intake-summary">
                        <p className={opContextLabel}>Intake summary</p>
                        <div className={clsx(opOrientationSurface, "mt-2")}>
                            <FormsReviewBadge
                                label={viewModel.intakeSummary.statusLine}
                                tone={statusBadgeTone(viewModel.intakeSummary.statusTone)}
                            />
                            <p className={clsx("mt-2 text-sm font-medium text-alloy-midnight", opBody)}>
                                {viewModel.intakeSummary.capturedLine}
                            </p>
                            {viewModel.intakeSummary.operationalLine ?
                                <p className={clsx("mt-1", opBody)} data-testid="quick-review-operational-line">
                                    {viewModel.intakeSummary.operationalLine}
                                </p>
                            :   null}
                            {viewModel.intakeSummary.routingLine ?
                                <p className={clsx("mt-1", opMetadata)} data-testid="quick-review-routing-line">
                                    {viewModel.intakeSummary.routingLine}
                                </p>
                            :   null}
                        </div>
                    </section>

                    <section data-testid="quick-review-needs-action">
                        <p className={opContextLabel}>
                            {viewModel.leadCreatedMode ? "Review status" : "Needs action"}
                        </p>
                        {viewModel.needsAction.clearMessage ?
                            <p className={clsx("mt-2", opBody)} data-testid="quick-review-no-action">
                                {viewModel.needsAction.clearMessage}
                            </p>
                        : viewModel.needsAction.items.length > 0 ?
                            <ul className={clsx("mt-2 space-y-1", opBody)}>
                                {viewModel.needsAction.items.map((item) => (
                                    <li key={item} className="font-medium text-alloy-ember/90">
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        :   null}
                    </section>

                    <section data-testid="quick-review-next-step">
                        <p className={opContextLabel}>Recommended next step</p>
                        <p className={clsx("mt-2 font-medium text-alloy-midnight", opBody)}>
                            {viewModel.recommendedNextStep}
                        </p>
                    </section>

                    {showConfirmBlock ?
                        <div className="rounded-xl bg-alloy-stone/20 px-3 py-3 ring-1 ring-alloy-midnight/[0.06]">
                            <p className={clsx("font-medium", opContextLabel)}>Confirm family match</p>
                            <p className={clsx("mt-1", opMetadata)}>
                                If this is the correct family and enrollment inquiry, confirm to continue enrollment workflows.
                            </p>
                            {confirmErr ?
                                <p className="mt-2 text-sm text-alloy-ember">{confirmErr}</p>
                            : null}
                            <PrimaryButton
                                type="button"
                                className="!mt-3 !px-3 !py-2 text-sm"
                                disabled={confirmBusy}
                                onClick={() => void confirmMatch()}
                                data-testid="quick-review-confirm-linkage"
                            >
                                {confirmBusy ? "Confirming…" : "Confirm family match"}
                            </PrimaryButton>
                        </div>
                    : confirmOk ?
                        <p className="text-sm text-alloy-pine" data-testid="quick-review-confirmed">
                            Family match confirmed — continue enrollment from the intake file.
                        </p>
                    :   null}

                    <section
                        className="rounded-xl bg-alloy-stone/10 px-3 py-3 ring-1 ring-alloy-midnight/[0.04]"
                        data-testid="quick-review-evidence"
                    >
                        <p className={opContextLabel}>Evidence</p>
                        <ul className={clsx("mt-2 space-y-1", opMutedMeta)}>
                            <li>Form · {viewModel.evidence.formName}</li>
                            <li>Submitted · {viewModel.evidence.submittedAtLabel}</li>
                            {viewModel.evidence.submissionCount > 1 ?
                                <li>{viewModel.evidence.submissionCount} forms in this intake case</li>
                            :   null}
                            {viewModel.evidence.hasSignature ?
                                <li>Signed</li>
                            :   null}
                            {viewModel.evidence.hasGeneratedDocument ?
                                <li>Generated document on file</li>
                            :   null}
                        </ul>
                    </section>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-alloy-stone/15 px-5 py-4">
                    {viewModel.opportunityId ?
                        <PrimaryButton
                            type="button"
                            className="!px-3 !py-2 text-sm"
                            data-testid="quick-review-open-lead"
                            onClick={openLead}
                        >
                            {viewModel.primaryOpenLabel}
                        </PrimaryButton>
                    :   null}
                    {!viewModel.leadCreatedMode ?
                        <Link href={detailHref} className="inline-flex">
                            <PrimaryButton
                                type="button"
                                className="!px-3 !py-2 text-sm"
                                data-testid="quick-review-open-intake-file"
                            >
                                {viewModel.opportunityId ? "Open intake file" : viewModel.primaryOpenLabel}
                            </PrimaryButton>
                        </Link>
                    :   null}
                    <SecondaryButton type="button" className="!px-3 !py-2 text-sm" onClick={onClose}>
                        Done
                    </SecondaryButton>
                    {!canMutate ?
                        <p className={clsx("w-full", opMutedMeta)}>
                            Document generation requires admin access on the intake file.
                        </p>
                    :   null}
                </div>
            </div>
        </>
    );
}

/** @deprecated Use SubmissionQuickReviewModal */
export const SubmissionQuickReviewDrawer = SubmissionQuickReviewModal;
