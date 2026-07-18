import type { ConfigurationPublicationRecord } from "@/lib/configPublication/types";

export type ConfigurationDetailSection =
    | "overview"
    | "draft"
    | "assignment"
    | "distribution"
    | "history";

export type ConfigurationRuntimeAttentionGrade = "fix" | "improve" | "good";

export type ConfigurationRuntimeAttentionItem = {
    key: string;
    grade: ConfigurationRuntimeAttentionGrade;
    label: string;
    consequence: string;
    section: ConfigurationDetailSection;
    nextLabel: string;
};

export type ConfigurationRuntimeSetupArea = {
    key: string;
    label: string;
    complete: boolean | null;
    section: ConfigurationDetailSection;
};

export type ConfigurationAssignmentEvidence = {
    locationId: string;
    locationLabel: string;
    revisionId: string;
    revisionNumber: number | null;
    consumedAt: string;
};

export type ConfigurationDistributionTargetEvidence = {
    locationId: string;
    status: "pending" | "delivered" | "unchanged" | "failed";
};

export type ConfigurationDistributionRunEvidence = {
    id: string;
    publicationId: string;
    status: "planned" | "running" | "completed" | "partial_failure" | "failed";
    createdAt: string;
    targets: ConfigurationDistributionTargetEvidence[];
};

export type ConfigurationPublicationPosture = {
    state: "draft_only" | "published" | "changes_ready";
    label: string;
    activeRevisionLabel: string;
    draftLabel: string;
    hasUnpublishedChanges: boolean;
    canPublish: boolean;
};

export type ConfigurationAssignmentPosture = {
    assignedCount: number;
    targetCount: number;
    currentCount: number;
    driftCount: number;
    failedCount: number;
    pendingCount: number;
    state: "not_assigned" | "current" | "attention";
    label: string;
};

export type ConfigurationReadinessPosture = {
    percent: number;
    completeCount: number;
    assessedCount: number;
    unknownCount: number;
    areas: ConfigurationRuntimeSetupArea[];
};

export type ConfigurationRuntimeModel = {
    publication: ConfigurationPublicationPosture;
    assignment: ConfigurationAssignmentPosture;
    readiness: ConfigurationReadinessPosture;
    attention: ConfigurationRuntimeAttentionItem[];
};

function plural(value: number, singular: string, pluralLabel = `${singular}s`): string {
    return `${value} ${value === 1 ? singular : pluralLabel}`;
}

export function deriveConfigurationRuntimeModel(input: {
    objectLabel: string;
    draftStatus: "draft" | "validated";
    draftHasUnpublishedChanges: boolean;
    latestPublication: ConfigurationPublicationRecord | null;
    assignments: ConfigurationAssignmentEvidence[];
    targetCount: number;
    distributionRuns: ConfigurationDistributionRunEvidence[];
    setupAreas: ConfigurationRuntimeSetupArea[];
}): ConfigurationRuntimeModel {
    const activeRevision = input.latestPublication?.revision ?? null;
    const hasUnpublishedChanges =
        input.latestPublication == null || input.draftHasUnpublishedChanges;
    const publicationState: ConfigurationPublicationPosture["state"] =
        input.latestPublication == null ? "draft_only"
        : input.draftHasUnpublishedChanges ? "changes_ready"
        : "published";
    const publicationLabel =
        publicationState === "draft_only" ? "Draft only"
        : publicationState === "changes_ready" ?
            `Unpublished changes · Revision ${activeRevision?.number ?? "—"} active`
        :   `Published · Revision ${activeRevision?.number ?? "—"}`;

    const currentAssignments = input.assignments.filter(
        (assignment) => activeRevision != null && assignment.revisionId === activeRevision.id,
    );
    const driftAssignments = input.assignments.filter(
        (assignment) => activeRevision != null && assignment.revisionId !== activeRevision.id,
    );
    const failedTargets = input.distributionRuns.flatMap((run) =>
        run.targets.filter((target) => target.status === "failed"),
    );
    const pendingTargets = input.distributionRuns.flatMap((run) =>
        run.targets.filter((target) => target.status === "pending"),
    );
    const assignmentState: ConfigurationAssignmentPosture["state"] =
        failedTargets.length > 0 || driftAssignments.length > 0 ? "attention"
        : input.assignments.length > 0 ? "current"
        : "not_assigned";
    const assignmentLabel =
        assignmentState === "attention" ?
            `${plural(input.assignments.length, "Location")} assigned · attention needed`
        : assignmentState === "current" ?
            `${plural(input.assignments.length, "Location")} assigned`
        :   "Not assigned";

    const knownSetupAreas = input.setupAreas.filter((area) => area.complete !== null);
    const completeSetupAreas = knownSetupAreas.filter((area) => area.complete === true);
    const readiness: ConfigurationReadinessPosture = {
        percent:
            knownSetupAreas.length > 0 ?
                Math.round((completeSetupAreas.length / knownSetupAreas.length) * 100)
            :   0,
        completeCount: completeSetupAreas.length,
        assessedCount: knownSetupAreas.length,
        unknownCount: input.setupAreas.length - knownSetupAreas.length,
        areas: input.setupAreas,
    };

    const attention: ConfigurationRuntimeAttentionItem[] = [];
    if (input.latestPublication == null) {
        attention.push({
            key: "publication-missing",
            grade: "fix",
            label: `${input.objectLabel} has not been published`,
            consequence: "Locations cannot consume this configuration until an active revision is published.",
            section: "draft",
            nextLabel: "Review draft",
        });
    } else if (input.draftHasUnpublishedChanges) {
        attention.push({
            key: "unpublished-changes",
            grade: "improve",
            label: "Working draft has unpublished changes",
            consequence: `Locations continue to consume Revision ${activeRevision?.number ?? "—"} until the draft is published.`,
            section: "draft",
            nextLabel: "Review changes",
        });
    }
    if (failedTargets.length > 0) {
        attention.push({
            key: "distribution-failed",
            grade: "fix",
            label: `${plural(failedTargets.length, "Location")} failed assignment`,
            consequence: "Those Locations are not consuming the intended published revision.",
            section: "distribution",
            nextLabel: "Review failures",
        });
    }
    if (driftAssignments.length > 0) {
        attention.push({
            key: "assignment-drift",
            grade: "fix",
            label: `${plural(driftAssignments.length, "Location")} on an earlier revision`,
            consequence: "Their consumed revision differs from the active Organization revision.",
            section: "assignment",
            nextLabel: "Review assignments",
        });
    }
    const missingSetup = input.setupAreas.filter((area) => area.complete === false);
    if (missingSetup.length > 0) {
        attention.push({
            key: "setup-missing",
            grade: "improve",
            label: `${plural(missingSetup.length, "area")} needs setup`,
            consequence: "Complete the remaining configuration before treating this object as ready.",
            section: missingSetup[0]?.section ?? "overview",
            nextLabel: "Continue setup",
        });
    }

    return {
        publication: {
            state: publicationState,
            label: publicationLabel,
            activeRevisionLabel:
                activeRevision ? `Revision ${activeRevision.number}` : "Nothing published",
            draftLabel:
                input.draftStatus === "validated" && hasUnpublishedChanges ? "Ready to publish"
                : input.draftStatus === "validated" ? "Validated · no unpublished changes"
                : hasUnpublishedChanges ? "Working draft"
                : "Matches active revision",
            hasUnpublishedChanges,
            canPublish: hasUnpublishedChanges && input.draftStatus === "validated",
        },
        assignment: {
            assignedCount: input.assignments.length,
            targetCount: input.targetCount,
            currentCount: currentAssignments.length,
            driftCount: driftAssignments.length,
            failedCount: failedTargets.length,
            pendingCount: pendingTargets.length,
            state: assignmentState,
            label: assignmentLabel,
        },
        readiness,
        attention,
    };
}

export type ConfigurationHistoryEntry = {
    id: string;
    occurredAt: string;
    kind: "publication" | "assignment" | "retry" | "failure";
    title: string;
    detail: string;
    tone: "default" | "good" | "attention";
    actionLabel?: string;
};

export function sortConfigurationHistory(
    entries: readonly ConfigurationHistoryEntry[],
): ConfigurationHistoryEntry[] {
    return [...entries].sort(
        (left, right) =>
            new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
    );
}
