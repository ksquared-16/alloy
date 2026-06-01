/**
 * Form lifecycle workspace presentation (OW-3).
 * Derives step status from existing form data only — no invented state.
 */

export type FormLifecycleStepKey =
    | "design"
    | "publish"
    | "distribute"
    | "intake"
    | "review"
    | "documents";

export type FormLifecycleStepState = "complete" | "active" | "pending";

export type FormLifecycleStepTone = "success" | "warning" | "info" | "neutral";

export type FormLifecycleStepView = {
    key: FormLifecycleStepKey;
    label: string;
    statusLabel: string;
    nextHint: string;
    anchor: string;
    state: FormLifecycleStepState;
    tone: FormLifecycleStepTone;
};

export type FormLifecycleInput = {
    hasDraft: boolean;
    hasPublished: boolean;
    activeLinkCount: number;
    submissionCount: number;
    submittedCount: number;
    documentGenerationConfigured: boolean;
    intentConfigured?: boolean;
    outcomeConfigured?: boolean;
};

export const FORM_LIFECYCLE_ANCHORS: Record<FormLifecycleStepKey, string> = {
    design: "lifecycle-design",
    publish: "lifecycle-publish",
    distribute: "lifecycle-distribute",
    intake: "lifecycle-intake",
    review: "lifecycle-review",
    documents: "lifecycle-documents",
};

export function buildFormLifecycleSteps(input: FormLifecycleInput): FormLifecycleStepView[] {
    const {
        hasDraft,
        hasPublished,
        activeLinkCount,
        submissionCount,
        submittedCount,
        documentGenerationConfigured,
        intentConfigured = false,
        outcomeConfigured = false,
    } = input;

    const design: FormLifecycleStepView =
        hasDraft ?
            {
                key: "design",
                label: "Build form",
                statusLabel: hasPublished ? "Changes in progress" : "Draft started",
                nextHint: hasPublished ? "Edit fields, then publish" : "Add fields and publish",
                anchor: FORM_LIFECYCLE_ANCHORS.design,
                state: "active",
                tone: "info",
            }
        : hasPublished ?
            {
                key: "design",
                label: "Build form",
                statusLabel: "Fields published",
                nextHint: "Start a new draft to change fields",
                anchor: FORM_LIFECYCLE_ANCHORS.design,
                state: "complete",
                tone: "success",
            }
        :   {
                key: "design",
                label: "Build form",
                statusLabel: "Not started",
                nextHint: "Create a blank draft",
                anchor: FORM_LIFECYCLE_ANCHORS.design,
                state: "pending",
                tone: "neutral",
            };

    const publish: FormLifecycleStepView =
        hasPublished ?
            {
                key: "publish",
                label: "Publish",
                statusLabel: "Live",
                nextHint: hasDraft ? "Publish changes when ready" : "Form is live",
                anchor: FORM_LIFECYCLE_ANCHORS.publish,
                state: hasDraft ? "active" : "complete",
                tone: hasDraft ? "info" : "success",
            }
        : hasDraft ?
            {
                key: "publish",
                label: "Publish",
                statusLabel: "Ready to publish",
                nextHint: "Publish draft to share intake",
                anchor: FORM_LIFECYCLE_ANCHORS.publish,
                state: "active",
                tone: "warning",
            }
        :   {
                key: "publish",
                label: "Publish",
                statusLabel: "Waiting",
                nextHint: "Complete design first",
                anchor: FORM_LIFECYCLE_ANCHORS.publish,
                state: "pending",
                tone: "neutral",
            };

    const distribute: FormLifecycleStepView =
        activeLinkCount > 0 ?
            {
                key: "distribute",
                label: "Share",
                statusLabel: `${activeLinkCount} live link${activeLinkCount === 1 ? "" : "s"}`,
                nextHint: "Open or copy the share link",
                anchor: FORM_LIFECYCLE_ANCHORS.distribute,
                state: "complete",
                tone: "success",
            }
        : hasPublished && outcomeConfigured ?
            {
                key: "distribute",
                label: "Share",
                statusLabel: "Ready to share",
                nextHint: "Get a share link below",
                anchor: FORM_LIFECYCLE_ANCHORS.distribute,
                state: "active",
                tone: "warning",
            }
        : hasPublished ?
            {
                key: "distribute",
                label: "Share",
                statusLabel: intentConfigured ? "Finish setup first" : "Choose purpose first",
                nextHint: intentConfigured ? "Confirm routing below" : "Choose what this form does",
                anchor: FORM_LIFECYCLE_ANCHORS.distribute,
                state: "pending",
                tone: "neutral",
            }
        :   {
                key: "distribute",
                label: "Share",
                statusLabel: "Blocked",
                nextHint: "Publish before sharing",
                anchor: FORM_LIFECYCLE_ANCHORS.distribute,
                state: "pending",
                tone: "neutral",
            };

    const intake: FormLifecycleStepView =
        submissionCount > 0 ?
            {
                key: "intake",
                label: "Responses",
                statusLabel: `${submissionCount} response${submissionCount === 1 ? "" : "s"}`,
                nextHint: "Open the inbox",
                anchor: FORM_LIFECYCLE_ANCHORS.intake,
                state: "complete",
                tone: "success",
            }
        : activeLinkCount > 0 ?
            {
                key: "intake",
                label: "Responses",
                statusLabel: "Awaiting responses",
                nextHint: "Share link is live",
                anchor: FORM_LIFECYCLE_ANCHORS.intake,
                state: "active",
                tone: "info",
            }
        :   {
                key: "intake",
                label: "Responses",
                statusLabel: "No activity",
                nextHint: "Share the form first",
                anchor: FORM_LIFECYCLE_ANCHORS.intake,
                state: "pending",
                tone: "neutral",
            };

    const review: FormLifecycleStepView =
        submittedCount > 0 ?
            {
                key: "review",
                label: "Follow up",
                statusLabel: `${submittedCount} to review`,
                nextHint: "Open intake inbox",
                anchor: FORM_LIFECYCLE_ANCHORS.review,
                state: "active",
                tone: "warning",
            }
        : submissionCount > 0 ?
            {
                key: "review",
                label: "Follow up",
                statusLabel: "Draft responses only",
                nextHint: "Wait for submitted responses",
                anchor: FORM_LIFECYCLE_ANCHORS.review,
                state: "pending",
                tone: "neutral",
            }
        :   {
                key: "review",
                label: "Follow up",
                statusLabel: "Nothing yet",
                nextHint: "Responses appear after families submit",
                anchor: FORM_LIFECYCLE_ANCHORS.review,
                state: "pending",
                tone: "neutral",
            };

    const documents: FormLifecycleStepView =
        documentGenerationConfigured ?
            {
                key: "documents",
                label: "Documents",
                statusLabel: "PDF mapping configured",
                nextHint: "Generate from reviewed submissions",
                anchor: FORM_LIFECYCLE_ANCHORS.documents,
                state: "complete",
                tone: "success",
            }
        : hasPublished ?
            {
                key: "documents",
                label: "Documents",
                statusLabel: "Optional output",
                nextHint: "Configure PDF mapping on publish",
                anchor: FORM_LIFECYCLE_ANCHORS.documents,
                state: "pending",
                tone: "neutral",
            }
        :   {
                key: "documents",
                label: "Documents",
                statusLabel: "Not available",
                nextHint: "Publish first",
                anchor: FORM_LIFECYCLE_ANCHORS.documents,
                state: "pending",
                tone: "neutral",
            };

    return [design, publish, distribute, intake, review, documents];
}

export function formLifecyclePublishSummaryLabel(hasDraft: boolean, hasPublished: boolean): string {
    if (hasPublished && hasDraft) return "Published · changes in progress";
    if (hasPublished) return "Published";
    if (hasDraft) return "Draft";
    return "Not published";
}

export function formLifecyclePurposeLine(
    purpose: string | null | undefined,
    description: string | null,
    _kind: string
): string | null {
    if (purpose?.trim()) return purpose.trim();
    if (description?.trim()) return description.trim();
    return null;
}
