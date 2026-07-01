import clsx from "clsx";
import type { ReactNode } from "react";
import { formsCaseFileStackCompact } from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    className?: string;
    children: ReactNode;
};

/** Vertical stack of collapsed technical disclosures at the bottom of a review surface. */
export function FormsTechnicalDetailStack({ className, children }: Props) {
    return (
        <div
            className={clsx(formsCaseFileStackCompact, className)}
            data-testid="forms-technical-detail-stack"
        >
            {children}
        </div>
    );
}
