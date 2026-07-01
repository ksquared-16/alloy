import clsx from "clsx";
import type { FormsReviewBadgeTone } from "@/lib/forms/review/formsReviewPresentation";
import { formsReviewBadgeClassName } from "@/lib/forms/review/formsReviewBadgeStyles";

type Props = {
    label: string;
    tone?: FormsReviewBadgeTone;
    className?: string;
    title?: string;
};

/** Compact semantic badge for forms review surfaces (status, artifact kind, generation label). */
export function FormsReviewBadge({ label, tone = "neutral", className, title }: Props) {
    return (
        <span className={clsx(formsReviewBadgeClassName(tone), className)} title={title}>
            {label}
        </span>
    );
}
