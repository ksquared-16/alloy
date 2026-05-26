"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";
import {
    opMetadata,
    opReviewActionsSurface,
    opSectionSupport,
    opSectionTitle,
} from "@/lib/operational/ui/operationalVisualTokens";

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
            className={clsx(opReviewActionsSurface, variant === "modal" && "px-4 py-3", className)}
            data-testid="case-file-review-actions"
        >
            <h2 className={opSectionTitle}>Review decision</h2>
            <p className={opSectionSupport}>Your decision is recorded on this packet session.</p>
            <p className={clsx("mt-1", opMetadata)}>
                Approving may generate PDFs for mapped steps. Nothing applies automatically.
            </p>
            <div className="mt-4">{children}</div>
        </section>
    );
}
