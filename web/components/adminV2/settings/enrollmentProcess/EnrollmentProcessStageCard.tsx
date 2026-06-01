import type { ReactNode } from "react";
import Link from "next/link";

export default function EnrollmentProcessStageCard({
    title,
    description,
    testId,
    manageHref,
    manageLabel = "Open settings",
    children,
    footer,
}: {
    title: string;
    description?: string;
    testId: string;
    manageHref?: string;
    manageLabel?: string;
    children: ReactNode;
    footer?: ReactNode;
}) {
    return (
        <section
            className="flex h-full flex-col rounded-xl border border-alloy-forge/12 bg-white/85 p-4 shadow-sm"
            data-testid={testId}
        >
            <header className="flex items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">{title}</h3>
                    {description ? <p className="mt-0.5 text-xs text-alloy-midnight/50">{description}</p> : null}
                </div>
                {manageHref ? (
                    <Link
                        href={manageHref}
                        className="shrink-0 text-xs font-medium text-alloy-pine hover:underline"
                        data-testid={`${testId}-manage-link`}
                    >
                        {manageLabel}
                    </Link>
                ) : null}
            </header>
            <div className="mt-3 flex-1 text-sm text-alloy-midnight/85">{children}</div>
            {footer ? <footer className="mt-3 border-t border-alloy-forge/10 pt-2 text-[11px] text-alloy-midnight/45">{footer}</footer> : null}
        </section>
    );
}
