"use client";

import { SubmissionIntelligenceCard } from "@/components/forms/workspace/SubmissionIntelligenceCard";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { deriveSubmissionIntelligence } from "@/lib/forms/submissionIntelligencePresentation";
import {
    type SubmissionInboxLaneKey,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";

type Props = {
    row: SubmissionInboxRow;
    formName: string;
    lane: SubmissionInboxLaneKey;
    viewerTz: string;
    href: string;
    emphasize?: boolean;
    onQuickReview?: () => void;
};

export function SubmissionInboxRowView(props: Props) {
    const intelligence = deriveSubmissionIntelligence(props.row, props.lane);
    return <SubmissionIntelligenceCard {...props} intelligence={intelligence} />;
}

export function submissionDetailHref(formDefinitionId: string, submissionId: string): string {
    return `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formDefinitionId)}/submissions/${encodeURIComponent(submissionId)}`;
}
