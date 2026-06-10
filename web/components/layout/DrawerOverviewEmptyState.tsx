"use client";

import type { ReactNode } from "react";

import {
    PRESENTATION_EMPTY_STATE,
    PRESENTATION_EMPTY_STATE_SOFT,
} from "@/lib/presentation/presentationTypography";

type Props = {
    message: string;
    hint?: string;
    action?: ReactNode;
    compact?: boolean;
};

/** Premium empty content inside an active drawer section — section chrome stays full strength. */
export default function DrawerOverviewEmptyState({ message, hint, action, compact = false }: Props) {
    return (
        <div
            className={`rounded-lg border border-dashed border-alloy-stone/15 bg-gradient-to-b from-alloy-juniper/[0.02] to-white text-center ${
                compact ? "px-3 py-4" : "px-4 py-5"
            }`}
            data-drawer-overview-empty-state="true"
        >
            <p className={PRESENTATION_EMPTY_STATE}>{message}</p>
            {hint ?
                <p className={`mt-1.5 ${PRESENTATION_EMPTY_STATE_SOFT}`}>{hint}</p>
            :   null}
            {action ?
                <div className="mt-2.5">{action}</div>
            :   null}
        </div>
    );
}
