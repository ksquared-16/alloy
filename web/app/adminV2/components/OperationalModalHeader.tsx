"use client";

/**
 * Operational Workspace Shell — canonical modal header.
 *
 * One header rhythm for every operational module surface (Communications, Processing,
 * Work Items, Operational Intelligence, and future operational modules). It borrows the
 * Focus Panel header language — a Bend Pine left accent + top wash, a bare module glyph
 * (no tile background), and a strong title — adapted for module-level workspaces
 * (no record chrome, no decorative hero, no explanatory subtitle).
 *
 *   ┃ icon  Title ……………………………… [secondary] [primary] [Close]
 *   ^ Bend Pine accent
 *
 * Below this header, surfaces stack (in order): KPI/status strip → Work/Studio mode
 * switch → child-section nav → queue/workspace body. Modules pass icon, title, and
 * optional actions; this component owns structure, spacing, identity treatment, accent,
 * and the Close affordance so siblings stay visually identical. Identity is carried by
 * icon + title + accent + actions — never prose.
 */

import type { ReactNode } from "react";
import { X } from "lucide-react";

/** Primary action (Bend Pine / juniper). Matches comms Compose New + OIP primary. */
export const OPERATIONAL_PRIMARY_ACTION_CLASS =
    "inline-flex items-center gap-1.5 rounded-lg bg-alloy-juniper px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-alloy-juniper/90 disabled:opacity-50";
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
}) {
    return (
        <header
            className="flex w-full shrink-0 items-center justify-between gap-4 border-b border-alloy-stone/15 border-l-[3px] border-l-alloy-juniper bg-gradient-to-b from-alloy-juniper/[0.06] to-white px-4 py-2.5"
            data-operational-modal-header="true"
        >
            <div className="flex min-w-0 items-center gap-2.5">
                <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-alloy-midnight"
                    data-operational-modal-header-icon="true"
                    aria-hidden
                >
                    {icon}
                </span>
                <h2 id={titleId} className="truncate text-[15px] font-bold leading-tight text-alloy-midnight">
                    {title}
                </h2>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5" data-operational-modal-header-actions="true">
                {secondaryActions}
                {actions}
                <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 px-2 py-1 text-[11px] font-semibold text-alloy-forge hover:bg-alloy-stone/[0.06]"
                    aria-label={closeLabel}
                >
                    <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                    Close
                </button>
            </div>
        </header>
    );
}
