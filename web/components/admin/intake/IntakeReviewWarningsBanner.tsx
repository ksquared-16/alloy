"use client";

import type { IntakeReviewWarning } from "@/lib/intake/review/intakeReviewWarnings";

type Props = {
    warnings: readonly IntakeReviewWarning[];
    className?: string;
};

/** Prominent operator-visible intake warnings — intended above fold in action review surfaces. */
export function IntakeReviewWarningsBanner({ warnings, className = "" }: Props) {
    if (!warnings.length) return null;

    return (
        <div
            className={`space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 ${className}`}
            data-testid="intake-review-warnings-banner"
            role="status"
        >
            {warnings.map((warning) => (
                <p
                    key={warning.code}
                    className={`text-[12px] leading-snug ${
                        warning.severity === "warning" ? "font-medium text-amber-950" : "text-amber-900/90"
                    }`}
                    data-intake-review-warning={warning.code}
                >
                    {warning.message}
                </p>
            ))}
        </div>
    );
}
