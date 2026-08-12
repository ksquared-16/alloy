/**
 * Compact waitlist rank fraction for queue-row chrome.
 *
 * Presentation only: same font size for numerator and denominator, with a subtle
 * vertical offset so `1/2` reads like a fraction without Unicode super/subscripts.
 */

import { parseWaitlistRankParts } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";

type Props = {
    label: string;
    className?: string;
    title?: string | null;
};

export default function WaitlistRankFraction({ label, className = "", title }: Props) {
    const parts = parseWaitlistRankParts(label);
    if (!parts) {
        return (
            <span data-queue-row-waitlist-rank className={className} title={title ?? label}>
                {label}
            </span>
        );
    }

    const aria = parts.preview
        ? `Preview position ${parts.numerator} of ${parts.denominator}`
        : `Position ${parts.numerator} of ${parts.denominator}`;

    return (
        <span
            className={`inline-flex items-center gap-0.5 tabular-nums ${className}`.trim()}
            title={title ?? parts.compact}
            aria-label={aria}
            data-queue-row-waitlist-rank
            data-waitlist-rank-fraction="true"
        >
            {parts.preview ? <span className="font-semibold">Preview</span> : null}
            <span className="inline-flex items-center leading-none" aria-hidden>
                {/* Inline transforms: same font size; subtle fraction offset (Tailwind arbitrary translate may not emit). */}
                <span style={{ transform: "translateY(-0.2em)", display: "inline-block" }}>
                    {parts.numerator}
                </span>
                <span
                    className="mx-px opacity-80"
                    style={{ transform: "translateY(-0.02em)", display: "inline-block" }}
                >
                    /
                </span>
                <span style={{ transform: "translateY(0.2em)", display: "inline-block" }}>
                    {parts.denominator}
                </span>
            </span>
        </span>
    );
}
