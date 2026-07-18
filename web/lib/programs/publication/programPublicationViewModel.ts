import type { ConfigCollectionItem } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    buildConfigurationHistory,
    deriveConfigurationRuntimeModel,
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
    const offerings = snapshot.offerings.filter((offering) => offering.program_key === program.key);
    const offeringIds = new Set(offerings.map((offering) => offering.id));
    const variants = snapshot.variants.filter((variant) => offeringIds.has(variant.offering_id));
    const variantIds = new Set(variants.map((variant) => variant.id));
    const relatedPolicies = snapshot.policies.filter(
        (policy) =>
            policy.programKey === program.key
            || (policy.offeringId != null && offeringIds.has(policy.offeringId))
            || (policy.variantId != null && variantIds.has(policy.variantId)),
    );
    const relatedProducts = snapshot.products.filter((product) => product.program_key === program.key);
    const hasRequirementDefinition =
        Object.keys(program.draft.audience).length > 0
        || Object.keys(program.draft.eligibility).length > 0
        || program.draft.qualificationRequirements.length > 0;
    const availability = snapshot.availability.filter(
        (item) => item.programId === program.id || item.programKey === program.key,
    );
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
                section: "definition",
            },
            {
                key: "requirements",
                label: "Program requirements",
                complete: hasRequirementDefinition,
                section: "requirements",
            },
            {
                key: "resources",
                label: "Resource requirement",
                complete: Boolean(program.draft.requiredResourceType?.trim()),
                section: "resources",
            },
            {
                key: "offerings",
                label: "Offering structure",
                complete: offerings.length > 0 && variants.length > 0,
                section: "offerings",
            },
            {
                key: "pricing",
                label: "Related pricing",
                complete:
                    variants.length === 0
                        ? null
                        : snapshot.tuitionRates.some((rate) => variantIds.has(rate.variant_id)),
                section: "pricing",
            },
            {
                key: "policies",
                label: "Program policies",
                complete: relatedPolicies.length === 0 ? null : true,
                section: "policies",
            },
            {
                key: "relationships",
                label: "Commercial relationships",
                complete: relatedProducts.length === 0 ? null : true,
                section: "relationships",
            },
            {
                key: "publication",
                label: "Published revision",
                complete: program.latestPublication != null,
                section: "publication",
            },
            {
                key: "assignment",
                label: "Location assignment",
                complete: assignments.length > 0,
                section: "assignment",
            },
            {
                key: "availability",
                label: "Location availability",
                complete: assignments.length === 0 ? null : availability.length > 0,
                section: "availability",
            },
        ],
    });

    const locationLabelById = new Map(
        snapshot.locations.map((location) => [location.id, location.label]),
    );
    const revisionLabelByPublicationId = new Map(
        program.publications.map((publication) => [
            publication.id,
            `Revision ${publication.revision.number}`,
        ]),
    );
    const history = buildConfigurationHistory({
        publications: program.publications,
        runs,
        attempts: snapshot.attempts,
        revisionLabelByPublicationId,
        locationLabelById,
    });

    return {
        runtime,
        assignments: assignmentEvidence,
        runs,
        history,
    };
}

export function buildProgramCollectionItem(
    program: ProgramCatalogItem,
    snapshot: ProgramPublicationSnapshot,
): ConfigCollectionItem {
    const viewModel = buildProgramPublicationViewModel(program, snapshot);
    const offerings = snapshot.offerings.filter((offering) => offering.program_key === program.key);
    const offeringIds = new Set(offerings.map((offering) => offering.id));
    const variantIds = new Set(
        snapshot.variants
            .filter((variant) => offeringIds.has(variant.offering_id))
            .map((variant) => variant.id),
    );
    return {
        id: program.id,
        label: program.draft.label,
        publicationLabel: viewModel.runtime.publication.label,
        hasPublishedRevision: program.latestPublication != null,
        assignmentLabel: viewModel.runtime.assignment.label,
        isAssigned: viewModel.runtime.assignment.assignedCount > 0,
        setupLabel: `${viewModel.runtime.readiness.percent}% ready`,
        supportingLabel:
            `${offerings.length} ${offerings.length === 1 ? "offering" : "offerings"} · `
            + `${snapshot.tuitionRates.filter((rate) => variantIds.has(rate.variant_id)).length} rates · `
            + `${snapshot.products.filter((product) => product.program_key === program.key).length} catalog`,
        hasAttention: viewModel.runtime.attention.some((item) => item.grade === "fix"),
        publicationState: viewModel.runtime.publication.state,
        lifecycleStatus: program.lifecycleStatus,
    };
}
