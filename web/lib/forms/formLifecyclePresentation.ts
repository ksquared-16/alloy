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
    } = input;

    const design: FormLifecycleStepView =
        hasDraft ?
            {
                key: "design",
                label: "Design",
                statusLabel: hasPublished ? "Draft in progress" : "Draft started",
                nextHint: hasPublished ? "Edit draft fields, then publish" : "Add fields and publish",
                anchor: FORM_LIFECYCLE_ANCHORS.design,
                state: "active",
                tone: "info",
            }
        : hasPublished ?
            {
                key: "design",
                label: "Design",
                statusLabel: "Published",
                nextHint: "Start a new draft to change fields",
                anchor: FORM_LIFECYCLE_ANCHORS.design,
                state: "complete",
                tone: "success",
            }
        :   {
                key: "design",
                label: "Design",
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
                statusLabel: "Live version",
                nextHint: hasDraft ? "Publish draft when ready" : "Version is live",
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
                label: "Distribute",
                statusLabel: `${activeLinkCount} active link${activeLinkCount === 1 ? "" : "s"}`,
                nextHint: "Share links or create another",
                anchor: FORM_LIFECYCLE_ANCHORS.distribute,
                state: "complete",
                tone: "success",
            }
        : hasPublished ?
            {
                key: "distribute",
                label: "Distribute",
                statusLabel: "No links yet",
                nextHint: "Create a public link",
                anchor: FORM_LIFECYCLE_ANCHORS.distribute,
                state: "active",
                tone: "warning",
            }
        :   {
                key: "distribute",
                label: "Distribute",
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
                label: "Intake",
                statusLabel: `${submissionCount} response${submissionCount === 1 ? "" : "s"}`,
                nextHint: "Monitor new submissions",
                anchor: FORM_LIFECYCLE_ANCHORS.intake,
                state: "complete",
                tone: "success",
            }
        : activeLinkCount > 0 ?
            {
                key: "intake",
                label: "Intake",
                statusLabel: "Awaiting responses",
                nextHint: "Links are live — watch for intake",
                anchor: FORM_LIFECYCLE_ANCHORS.intake,
                state: "active",
                tone: "info",
            }
        :   {
                key: "intake",
                label: "Intake",
                statusLabel: "No activity",
                nextHint: "Distribute a link first",
                anchor: FORM_LIFECYCLE_ANCHORS.intake,
                state: "pending",
                tone: "neutral",
            };

    const review: FormLifecycleStepView =
        submittedCount > 0 ?
            {
                key: "review",
                label: "Review",
                statusLabel: `${submittedCount} to review`,
                nextHint: "Open intake inbox",
                anchor: FORM_LIFECYCLE_ANCHORS.review,
                state: "active",
                tone: "warning",
            }
        : submissionCount > 0 ?
            {
                key: "review",
                label: "Review",
                statusLabel: "Draft responses only",
                nextHint: "Wait for submitted responses",
                anchor: FORM_LIFECYCLE_ANCHORS.review,
                state: "pending",
                tone: "neutral",
            }
        :   {
                key: "review",
                label: "Review",
                statusLabel: "Nothing yet",
                nextHint: "Submissions appear after intake",
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
    if (hasPublished && hasDraft) return "Published · draft in progress";
    if (hasPublished) return "Published";
    if (hasDraft) return "Draft only";
    return "Not published";
}

export function formLifecyclePurposeLine(
    purpose: string | null | undefined,
    description: string | null,
    kind: string
): string | null {
    if (purpose?.trim()) return purpose.trim();
    if (description?.trim()) return description.trim();
    if (kind?.trim()) return `Form kind: ${kind.replace(/_/g, " ")}`;
    return null;
}
