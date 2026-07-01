"use client";

import type { IntakeReviewWarning } from "@/lib/intake/review/intakeReviewWarnings";

type Props = {
    warnings?: readonly IntakeReviewWarning[];
    messages?: readonly string[];
    className?: string;
};

/** Prominent operator-visible intake warnings — intended above fold in action review surfaces. */
export function IntakeReviewWarningsBanner({ warnings = [], messages = [], className = "" }: Props) {
    const lines =
        messages.length > 0 ?
            messages.map((message) => ({
                key: message,
                message,
                severity: "warning" as const,
                code: undefined as string | undefined,
            }))
        :   warnings.map((warning) => ({
                key: `${warning.code}:${warning.message}`,
                message: warning.message,
                severity: warning.severity,
                code: warning.code,
            }));

    if (!lines.length) return null;

    return (
        <div
            className={`space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 ${className}`}
            data-testid="intake-review-warnings-banner"
            role="alert"
        >
            {lines.map((line) => (
                <p
                    key={line.key}
                    className={`text-[11px] leading-snug ${
                        line.severity === "warning" ? "font-medium text-amber-950" : "text-amber-900/90"
                    }`}
                    {...(line.code ? { "data-intake-review-warning": line.code } : {})}
                >
                    {line.message}
                </p>
            ))}
        </div>
    );
}
