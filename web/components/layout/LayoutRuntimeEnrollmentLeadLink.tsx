"use client";

import { ExternalLink } from "lucide-react";
import { useLayoutRuntimeDrawerHost } from "@/lib/layout/runtime/layoutRuntimeDrawerHostContext";

type Props = {
    opportunityId: string;
    label?: string;
    detail?: string | null;
    className?: string;
};

/** Opens the linked Lead / Opportunity drawer — relationship workspace handoff only. */
export default function LayoutRuntimeEnrollmentLeadLink({
    opportunityId,
    label = "Open Family Lead",
    detail = null,
    className = "",
}: Props) {
    const { onOpenOpportunity } = useLayoutRuntimeDrawerHost();
    const id = opportunityId.trim();
    if (!id || !onOpenOpportunity) return null;

    return (
        <button
            type="button"
            onClick={() => onOpenOpportunity(id)}
            className={`inline-flex max-w-full items-center gap-1 text-[11px] font-semibold text-alloy-blue hover:underline ${className}`}
            data-layout-runtime-enrollment-lead-link="true"
            data-layout-runtime-enrollment-lead-id={id}
        >
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
            {detail ?
                <span className="truncate font-normal text-alloy-midnight/50">· {detail}</span>
            :   null}
        </button>
    );
}
