"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";
import {
    formsCaseFileMetaText,
    formsCaseFileRegionTitle,
    formsCaseFileReviewActionsSurface,
} from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    children: ReactNode;
    className?: string;
    /** `modal` uses compact alloy spacing from parent */
    variant?: "page" | "modal";
};

/** Anchored review decision band — region 8 in case-file hierarchy. */
export function CaseFileReviewActions({ children, className, variant = "page" }: Props) {
    return (
        <section
            id={FORMS_CASE_FILE_SECTION.reviewActions}
            className={clsx(formsCaseFileReviewActionsSurface, variant === "modal" && "px-3 py-3", className)}
            data-testid="case-file-review-actions"
        >
            <h2 className={formsCaseFileRegionTitle}>Review decision</h2>
            <p className={formsCaseFileMetaText}>
                Your decision is recorded on this packet session. Approving may generate PDFs for mapped steps.
            </p>
            <div className="mt-3">{children}</div>
        </section>
    );
}
