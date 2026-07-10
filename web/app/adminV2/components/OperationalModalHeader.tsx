"use client";

/**
 * Operational Workspace Shell — canonical compact modal header band.
 *
 * One header rhythm for every operational module surface (Communications, Processing,
 * Work Items, and future operational modules). Compact top band: icon + title + optional
 * subtitle on the left, actions + Close on the right. Mode nav (Work | Studio) stacks
 * directly beneath — no tall standalone hero header.
 *
 *   ┃ icon  Title                    [secondary] [primary] [Close]
 *         subtitle (muted)
 *   ^ Bend Pine left accent
 */

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { WS_TEXT_MUTED, WS_TEXT_PRIMARY, WS_TEXT_SECONDARY } from "@/components/workspace/workspaceTokens";

/** Primary action (Bend Pine). Matches comms Compose New + Work Items New task. */
export const OPERATIONAL_PRIMARY_ACTION_CLASS =
    "inline-flex items-center gap-1.5 rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-alloy-bend-pine/90 disabled:opacity-50";
/** Secondary action (calm outline). */
export const OPERATIONAL_SECONDARY_ACTION_CLASS =
    "inline-flex items-center gap-1.5 rounded-lg border border-alloy-stone/25 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight/75 shadow-sm hover:bg-alloy-stone/[0.08] disabled:opacity-50";

export default function OperationalModalHeader({
    icon,
    title,
    titleId,
    actions,
    secondaryActions,
    onClose,
    closeLabel = "Close",
    subtitle,
}: {
    icon: ReactNode;
    title: string;
    titleId: string;
    /** Primary action(s) (e.g. Compose New, New task) — rendered rightmost before Close. */
    actions?: ReactNode;
    /** Secondary action(s) (e.g. Configure) — rendered left of the primary action. */
    secondaryActions?: ReactNode;
    onClose: () => void;
    closeLabel?: string;
    /** Optional product tagline beneath the module title. */
    subtitle?: string;
}) {
    return (
        <header
            className="flex w-full shrink-0 items-center justify-between gap-3 border-l-2 border-l-alloy-bend-pine bg-white px-4 pb-0 pt-1.5"
            data-operational-modal-header="true"
            data-workspace-header-compact="true"
        >
            <div className="flex min-w-0 items-center gap-2">
                <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center ${WS_TEXT_PRIMARY}`}
                    data-operational-modal-header-icon="true"
                    aria-hidden
                >
                    {icon}
                </span>
                <div className="min-w-0 leading-tight">
                    <h2 id={titleId} className={`truncate text-[14px] font-semibold ${WS_TEXT_PRIMARY}`}>
                        {title}
                    </h2>
                    {subtitle ? (
                        <p className={`truncate text-[11px] ${WS_TEXT_SECONDARY}`}>{subtitle}</p>
                    ) : null}
                </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5" data-operational-modal-header-actions="true">
                {secondaryActions}
                {actions}
                <button
                    type="button"
                    onClick={onClose}
                    className={`inline-flex items-center gap-1 rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px] font-semibold ${WS_TEXT_MUTED} hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight`}
                    aria-label={closeLabel}
                >
                    <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                    Close
                </button>
            </div>
        </header>
    );
}
