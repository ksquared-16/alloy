import clsx from "clsx";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";
import {
    formsCaseFileHeaderSubtitle,
    formsCaseFileHeaderSurface,
    formsCaseFileHeaderTitle,
    formsCaseFileMetaText,
} from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    formName: string;
    submissionStatus: string;
    lifecycleHeadline: string;
    submittedAt: string | null;
    createdAt: string;
    viewerTimezone: string;
    className?: string;
};

/** Standalone submission review orientation (aligned with packet case-file header). */
export function SubmissionCaseFileHeader({
    formName,
    submissionStatus,
    lifecycleHeadline,
    submittedAt,
    createdAt,
    viewerTimezone,
    className,
}: Props) {
    return (
        <header
            id={FORMS_CASE_FILE_SECTION.header}
            className={clsx(formsCaseFileHeaderSurface, className)}
            data-testid="submission-case-file-header"
        >
            <p className={formsCaseFileMetaText}>Form submission review</p>
            <h1 className={clsx("mt-1", formsCaseFileHeaderTitle)}>{formName}</h1>
            <p className={formsCaseFileHeaderSubtitle}>{lifecycleHeadline}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge label={submissionStatus} variant={getStatusVariant(submissionStatus)} />
            </div>
            <p className={clsx("mt-2", formsCaseFileMetaText)}>
                {submittedAt ?
                    <>Submitted {formatDateTimeForUserDisplay(submittedAt, viewerTimezone)}</>
                :   <>Created {formatDateTimeForUserDisplay(createdAt, viewerTimezone)} — not submitted yet</>}
            </p>
        </header>
    );
}
