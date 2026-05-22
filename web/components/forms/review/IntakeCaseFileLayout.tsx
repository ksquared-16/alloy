import clsx from "clsx";
import type { ReactNode } from "react";
import { formsCaseFileStack, formsCaseFileStackCompact } from "@/lib/forms/review/formsReviewClassTokens";

export type IntakeCaseFileLayoutProps = {
    compact?: boolean;
    header: ReactNode;
    intakeContext: ReactNode;
    bosSummary: ReactNode;
    whatChanged?: ReactNode | null;
    needsAttention?: ReactNode | null;
    submittedForms: ReactNode;
    documents: ReactNode;
    reviewActions?: ReactNode | null;
    technical?: ReactNode | null;
    after?: ReactNode | null;
};

/**
 * Enforces UX-D case-file region order for packet and aligned submission review surfaces.
 */
export function IntakeCaseFileLayout({
    compact = false,
    header,
    intakeContext,
    bosSummary,
    whatChanged,
    needsAttention,
    submittedForms,
    documents,
    reviewActions,
    technical,
    after,
}: IntakeCaseFileLayoutProps) {
    return (
        <div
            className={clsx(compact ? formsCaseFileStackCompact : formsCaseFileStack, compact && "text-[13px]")}
            data-testid="intake-case-file-layout"
        >
            {header}
            {intakeContext}
            {bosSummary}
            {whatChanged}
            {needsAttention}
            {submittedForms}
            {documents}
            {reviewActions}
            {technical}
            {after}
        </div>
    );
}
