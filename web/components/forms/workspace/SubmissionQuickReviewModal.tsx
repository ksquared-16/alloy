"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import SecondaryButton from "@/components/SecondaryButton";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import { submissionDetailHref } from "@/components/forms/workspace/SubmissionInboxRowView";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import {
    deriveSubmissionOperationalNarrative,
    submissionCreatedOrMatchedSummary,
    submissionFamilyLabel,
} from "@/lib/forms/submissionOperationalNarrative";
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
};

function submitterLine(row: SubmissionInboxRow): string | null {
    const family = submissionFamilyLabel(row);
    const payload = row.payload as Record<string, unknown> | undefined;
    const values = payload?.values;
    if (!values || typeof values !== "object" || Array.isArray(values)) return family;
    const email = typeof (values as Record<string, unknown>).guardian_email === "string"
        ? (values as Record<string, unknown>).guardian_email.trim()
        : "";
    if (family && email) return `${family} · ${email}`;
    return family ?? (email || null);
}

/** Centered quick review modal — operator-first copy, Tasks/Messages pattern. */
export function SubmissionQuickReviewModal({ open, onClose, row, formName, viewerTz, onUpdated }: Props) {
    const { canMutate, role } = useAdminAuth();
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

    const narrative = useMemo(() => (row ? deriveSubmissionOperationalNarrative(row) : null), [row]);
    const createdSummary = useMemo(() => (row ? submissionCreatedOrMatchedSummary(row) : null), [row]);

    const needsConfirm = useMemo(() => {
        if (!row || row.status !== "submitted") return false;
        const hasLinks = !!(row.person_id || row.customer_id || row.customer_member_id || row.opportunity_id);
        const meta = row.payload?.meta;
        const needsReview =
            meta && typeof meta === "object" && !Array.isArray(meta) ?
                (meta as Record<string, unknown>).intake_needs_review === true
            :   false;
        return hasLinks && needsReview;
    }, [row]);

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

    if (!open || !row || !narrative) return null;

    const submittedAt =
        row.submitted_at ?
            formatDateTimeForUserDisplay(row.submitted_at, viewerTz)
        :   formatDateTimeForUserDisplay(row.created_at, viewerTz);
    const detailHref = submissionDetailHref(row.form_definition_id, row.id);
    const who = submitterLine(row);

    const overlay = "fixed inset-0 z-[120] bg-black/20 backdrop-blur-[1px]";
    const panel =
        "fixed left-1/2 top-1/2 z-[121] flex max-h-[min(88vh,720px)] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-admin-border bg-white shadow-xl";

    return (
        <>
            <div className={overlay} onClick={onClose} aria-hidden="true" />
            <div className={panel} role="dialog" aria-modal="true" aria-label="Quick intake review" data-testid="submission-quick-review-modal">
                <div className="flex items-start justify-between gap-3 border-b border-alloy-stone/15 px-5 py-4">
                    <div className="min-w-0">
                        <p className={opContextLabel}>Quick review</p>
                        {who ?
                            <p className="text-sm font-semibold text-alloy-midnight">{who}</p>
                        :   null}
                        <p className={clsx("mt-0.5", opMutedMeta)}>
                            {formName} · Submitted {submittedAt}
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
                    <div className={opOrientationSurface}>
                        <FormsReviewBadge label={narrative.statusLabel} tone="warning" />
                        <p className="mt-2 text-sm font-medium text-alloy-midnight">{narrative.headline}</p>
                        {createdSummary ?
                            <p className={clsx("mt-1", opBody)}>{createdSummary}</p>
                        :   null}
                        <p className={clsx("mt-1", opMutedMeta)}>{narrative.detail}</p>
                        <p className={clsx("mt-3 font-medium", opMetadata)}>
                            Next: {narrative.operatorAction}
                        </p>
                    </div>

                    {needsConfirm && canConfirm && !confirmOk ?
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
                </div>

                <div className="flex flex-wrap gap-2 border-t border-alloy-stone/15 px-5 py-4">
                    <Link href={detailHref} className="inline-flex">
                        <PrimaryButton type="button" className="!px-3 !py-2 text-sm">
                            Open intake file
                        </PrimaryButton>
                    </Link>
                    <SecondaryButton type="button" className="!px-3 !py-2 text-sm" onClick={onClose}>
                        Done
                    </SecondaryButton>
                    {!canMutate ?
                        <p className={clsx("w-full", opMutedMeta)}>Document generation requires admin access on the intake file.</p>
                    :   null}
                </div>
            </div>
        </>
    );
}

/** @deprecated Use SubmissionQuickReviewModal */
export const SubmissionQuickReviewDrawer = SubmissionQuickReviewModal;
