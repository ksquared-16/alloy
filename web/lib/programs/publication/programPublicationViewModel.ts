import type { ConfigCollectionItem } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    deriveConfigurationRuntimeModel,
    sortConfigurationHistory,
    type ConfigurationAssignmentEvidence,
    type ConfigurationHistoryEntry,
    type ConfigurationRuntimeModel,
} from "@/lib/configPublication/runtimeModel";
import { programPayloadChecksum } from "@/lib/programs/publication/programPublicationModel";
import type {
    ProgramAssignment,
    ProgramCatalogItem,
    ProgramDistributionRun,
    ProgramPublicationSnapshot,
} from "@/lib/programs/publication/programPublicationService";

export type ProgramPublicationViewModel = {
    runtime: ConfigurationRuntimeModel;
    assignments: ConfigurationAssignmentEvidence[];
    runs: ProgramDistributionRun[];
    history: ConfigurationHistoryEntry[];
};

function runsForProgram(
    program: ProgramCatalogItem,
    snapshot: ProgramPublicationSnapshot,
): ProgramDistributionRun[] {
    const publicationIds = new Set(program.publications.map((publication) => publication.id));
    return snapshot.runs.filter((run) => publicationIds.has(run.publicationId));
}

function assignmentsForProgram(
    program: ProgramCatalogItem,
    snapshot: ProgramPublicationSnapshot,
): ProgramAssignment[] {
    return snapshot.assignments.filter((assignment) => assignment.programId === program.id);
}

export function buildProgramPublicationViewModel(
    program: ProgramCatalogItem,
    snapshot: ProgramPublicationSnapshot,
): ProgramPublicationViewModel {
    const assignments = assignmentsForProgram(program, snapshot);
    const runs = runsForProgram(program, snapshot);
    const assignmentEvidence: ConfigurationAssignmentEvidence[] = assignments.map((assignment) => ({
        locationId: assignment.locationId,
        locationLabel: assignment.locationLabel,
        revisionId: assignment.revisionId,
        revisionNumber: assignment.revisionNumber,
        consumedAt: assignment.consumedAt,
    }));
    const draftHasUnpublishedChanges =
        program.latestPublication == null
        || programPayloadChecksum(program.draft) !== program.latestPublication.revision.checksum;
    const runtime = deriveConfigurationRuntimeModel({
        objectLabel: "Program",
        draftStatus: program.draft.status,
        draftHasUnpublishedChanges,
        latestPublication: program.latestPublication,
        assignments: assignmentEvidence,
        targetCount: snapshot.locations.length,
        distributionRuns: runs,
        setupAreas: [
            {
                key: "identity",
                label: "Program identity",
                complete: Boolean(program.key.trim() && program.draft.label.trim()),
                section: "draft",
            },
            {
                key: "publication",
                label: "Published revision",
                complete: program.latestPublication != null,
                section: "draft",
            },
            {
                key: "assignment",
                label: "Location assignment",
                complete: assignments.length > 0,
                section: "assignment",
            },
        ],
    });

    const publicationById = new Map(
        program.publications.map((publication) => [publication.id, publication]),
    );
    const runById = new Map(runs.map((run) => [run.id, run]));
    const locationLabelById = new Map(
        snapshot.locations.map((location) => [location.id, location.label]),
    );
    const history: ConfigurationHistoryEntry[] = [];
    for (const publication of program.publications) {
        history.push({
            id: `publication:${publication.id}`,
            occurredAt: publication.publishedAt,
            kind: "publication",
            title: `Revision ${publication.revision.number} published`,
            detail: "This immutable revision became available for Location assignment.",
            tone: "good",
        });
    }
    for (const run of runs) {
        const publication = publicationById.get(run.publicationId);
        const failed = run.targets.filter((target) => target.status === "failed");
        const succeeded = run.targets.filter((target) =>
            target.status === "delivered" || target.status === "unchanged",
        );
        history.push({
            id: `run:${run.id}`,
            occurredAt: run.completedAt ?? run.createdAt,
            kind: failed.length > 0 ? "failure" : "assignment",
            title:
                failed.length > 0 ? "Location assignment needs attention"
                : `Revision ${publication?.revision.number ?? "—"} assigned`,
            detail:
                `${succeeded.length} succeeded · ${failed.length} failed`
                + (
                    failed.length > 0 ?
                        ` · ${failed.map((target) => locationLabelById.get(target.locationId) ?? "Location").join(", ")}`
                    :   ""
                ),
            tone: failed.length > 0 ? "attention" : "good",
            actionLabel: failed.length > 0 ? "Retry failed assignments" : undefined,
        });
    }
    for (const attempt of snapshot.attempts) {
        if (attempt.attemptNumber <= 1 || !runById.has(attempt.runId)) continue;
        const run = runById.get(attempt.runId)!;
        const publication = publicationById.get(run.publicationId);
        history.push({
            id: `attempt:${attempt.id}`,
            occurredAt: attempt.attemptedAt,
            kind: attempt.status === "failed" ? "failure" : "retry",
            title:
                attempt.status === "failed" ? "Assignment retry failed"
                : "Assignment retry completed",
            detail:
                `${locationLabelById.get(attempt.locationId) ?? "Location"} · Revision ${publication?.revision.number ?? "—"} · attempt ${attempt.attemptNumber}`,
            tone: attempt.status === "failed" ? "attention" : "good",
        });
    }

    return {
        runtime,
        assignments: assignmentEvidence,
        runs,
        history: sortConfigurationHistory(history),
    };
}

export function buildProgramCollectionItem(
    program: ProgramCatalogItem,
    snapshot: ProgramPublicationSnapshot,
): ConfigCollectionItem {
    const viewModel = buildProgramPublicationViewModel(program, snapshot);
    return {
        id: program.id,
        label: program.draft.label,
        publicationLabel: viewModel.runtime.publication.label,
        assignmentLabel: viewModel.runtime.assignment.label,
        setupLabel: `${viewModel.runtime.readiness.percent}% ready`,
        hasAttention: viewModel.runtime.attention.some((item) => item.grade === "fix"),
        publicationState: viewModel.runtime.publication.state,
    };
}
