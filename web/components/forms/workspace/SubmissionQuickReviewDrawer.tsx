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
import { deriveSubmissionIntelligence } from "@/lib/forms/submissionIntelligencePresentation";
import { deriveSubmissionOperationalNarrative } from "@/lib/forms/submissionOperationalNarrative";
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

/** Lightweight side drawer for confirm-linkage without full-page navigation (OI-4). */
export function SubmissionQuickReviewDrawer({ open, onClose, row, formName, viewerTz, onUpdated }: Props) {
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
    const intelligence = useMemo(
        () => (row ? deriveSubmissionIntelligence(row, narrative?.lane ?? "needsReview") : null),
        [row, narrative?.lane]
    );

    const needsConfirm = useMemo(() => {
        if (!row || row.status !== "submitted") return false;
        const hasCrm = !!(row.person_id || row.customer_id || row.customer_member_id || row.opportunity_id);
        const meta = row.payload?.meta;
        const needsReview =
            meta && typeof meta === "object" && !Array.isArray(meta) ?
                (meta as Record<string, unknown>).intake_needs_review === true
            :   false;
        return hasCrm && needsReview;
    }, [row]);

    const confirmLinkage = useCallback(async () => {
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

    if (!open || !row || !narrative || !intelligence) return null;

    const timestamp =
        row.submitted_at ?
            formatDateTimeForUserDisplay(row.submitted_at, viewerTz)
        :   formatDateTimeForUserDisplay(row.created_at, viewerTz);
    const detailHref = submissionDetailHref(row.form_definition_id, row.id);

    return (
        <div className="fixed inset-0 z-[120]" data-testid="submission-quick-review-drawer">
            <button
                type="button"
                className="absolute inset-0 bg-alloy-midnight/25 backdrop-blur-[1px]"
                aria-label="Close quick review"
                onClick={onClose}
            />
            <aside
                className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl ring-1 ring-alloy-midnight/10"
                role="dialog"
                aria-modal="true"
                aria-label="Quick intake review"
            >
                <div className="flex items-start justify-between gap-3 border-b border-alloy-midnight/[0.08] px-4 py-3">
                    <div className="min-w-0">
                        <p className={opContextLabel}>Quick review</p>
                        <p className="text-sm font-semibold text-alloy-midnight">{formName}</p>
                        <p className={clsx("mt-0.5", opMutedMeta)}>{timestamp}</p>
                    </div>
                    <button type="button" className={opMetadata} onClick={onClose}>
                        Close
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    <div className={opOrientationSurface}>
                        <div className="flex flex-wrap items-center gap-2">
                            <FormsReviewBadge label={intelligence.readinessLabel} tone="warning" />
                        </div>
                        <p className="mt-2 text-sm font-medium text-alloy-midnight">{narrative.headline}</p>
                        <p className={clsx("mt-1", opBody)}>{narrative.detail}</p>
                        <p className={clsx("mt-2", opMetadata)}>
                            <span className="font-medium text-alloy-midnight/80">Next:</span> {narrative.operatorAction}
                        </p>
                    </div>

                    {intelligence.blockerGroups.length > 0 ?
                        <ul className="space-y-1 text-xs text-alloy-midnight/80">
                            {intelligence.blockerGroups.flatMap((g) =>
                                g.items.map((item) => (
                                    <li key={`${g.category}-${item}`}>
                                        <span className="font-semibold">{g.label}:</span> {item}
                                    </li>
                                ))
                            )}
                        </ul>
                    :   null}

                    {needsConfirm && canConfirm && !confirmOk ?
                        <div className="rounded-xl bg-alloy-stone/20 px-3 py-3 ring-1 ring-alloy-midnight/[0.06]">
                            <p className={clsx("font-medium", opContextLabel)}>Confirm linked records</p>
                            <p className={clsx("mt-1", opMetadata)}>
                                If person, household, child, and opportunity above match this family, confirm so document
                                generation can proceed.
                            </p>
                            {confirmErr ?
                                <p className="mt-2 text-sm text-alloy-ember">{confirmErr}</p>
                            : null}
                            <PrimaryButton
                                type="button"
                                className="!mt-3 !px-3 !py-2 text-sm"
                                disabled={confirmBusy}
                                onClick={() => void confirmLinkage()}
                                data-testid="quick-review-confirm-linkage"
                            >
                                {confirmBusy ? "Confirming…" : "Confirm record linkage"}
                            </PrimaryButton>
                        </div>
                    : confirmOk ?
                        <p className="text-sm text-alloy-pine" data-testid="quick-review-confirmed">
                            Linkage confirmed — you can generate a document from the full case file.
                        </p>
                    :   null}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-alloy-midnight/[0.08] px-4 py-3">
                    <Link href={detailHref} className="inline-flex">
                        <PrimaryButton type="button" className="!px-3 !py-2 text-sm">
                            Open full case file
                        </PrimaryButton>
                    </Link>
                    <SecondaryButton type="button" className="!px-3 !py-2 text-sm" onClick={onClose}>
                        Done
                    </SecondaryButton>
                    {!canMutate ?
                        <p className={clsx("w-full", opMutedMeta)}>Generate document requires admin on the case file.</p>
                    :   null}
                </div>
            </aside>
        </div>
    );
}
