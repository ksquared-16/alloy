import clsx from "clsx";
import type { ReactNode } from "react";
import { opPageSubtitle, opPageTitle } from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    className?: string;
};

/**
 * Standard page-level operational header — one title per viewport.
 * PX-1 foundation; adopt on Forms hub and AdminV2 routes in later cards.
 */
export function OperationalPageHeader({ title, subtitle, actions, className }: Props) {
    return (
        <header className={clsx("mb-5", className)} data-testid="operational-page-header">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className={opPageTitle}>{title}</h1>
                    {subtitle ?
                        <p className={clsx("mt-1", opPageSubtitle)}>{subtitle}</p>
                    :   null}
                </div>
                {actions ?
                    <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
                :   null}
            </div>
        </header>
    );
}
