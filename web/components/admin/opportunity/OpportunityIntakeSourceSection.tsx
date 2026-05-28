"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import type { OpportunityIntakeSourceViewModel } from "@/lib/forms/opportunityIntakeSourcePresentation";
import { opBody, opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    opportunityId: string;
    canMutate?: boolean;
    onSendForm?: () => void;
};

/** Drawer section — form intake provenance for enrollment lifecycle continuity. */
export function OpportunityIntakeSourceSection({ opportunityId, canMutate = false, onSendForm }: Props) {
    const [vm, setVm] = useState<OpportunityIntakeSourceViewModel | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/intake-source`, {
            credentials: "include",
        })
            .then((r) => r.json())
            .then((json: { data?: OpportunityIntakeSourceViewModel | null }) => {
                if (!cancelled) setVm(json.data ?? null);
            })
            .catch(() => {
                if (!cancelled) setVm(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [opportunityId]);

    if (loading) {
        return <p className={opMutedMeta}>Loading intake source…</p>;
    }
    if (!vm) return null;

    return (
        <section
            className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.06] px-3 py-2.5"
            data-testid="opportunity-intake-source"
        >
            <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/60">{vm.headline}</p>
            <p className="mt-1 text-sm font-semibold text-alloy-midnight">{vm.sourceLine}</p>
            {vm.familyLabel ?
                <p className={opBody}>Family · {vm.familyLabel}</p>
            :   null}
            {vm.outcomeLine ?
                <p className={clsx("mt-1", opBody)} data-testid="opportunity-intake-outcome">
                    {vm.outcomeLine}
                </p>
            :   null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
                {vm.autoOperationalized ?
                    <FormsReviewBadge label="Ready to continue enrollment" tone="success" />
                : vm.reviewRequired ?
                    <FormsReviewBadge label="Review required" tone="warning" />
                :   null}
            </div>
            <p className={clsx("mt-2 font-medium", opMetadata)} data-testid="opportunity-intake-next-step">
                Next · {vm.nextStepLine}
            </p>
            <Link
                href={vm.intakeFileHref}
                className="mt-2 inline-block text-sm font-semibold text-alloy-blue hover:underline"
                data-testid="opportunity-intake-file-link"
            >
                Open intake file
            </Link>
            {canMutate && onSendForm ?
                <button
                    type="button"
                    className="mt-2 ml-3 text-sm font-semibold text-alloy-blue hover:underline"
                    data-testid="opportunity-intake-send-form"
                    onClick={onSendForm}
                >
                    Send form
                </button>
            :   null}
        </section>
    );
}
