import type {
    ConfigurationPublicationDomainAdapter,
    ConfigurationTargetPreview,
} from "@/lib/configPublication/types";
import type { ProgramRevision } from "@/lib/programs/publication/programPublicationModel";

export type ProgramConsumerContext = {
    currentRevisionId: string | null;
    offeringExists: boolean;
    offered: boolean | null;
    localDescriptionOverride: string | null;
    localAuthorizationEvidence: string | null;
    protectedResourceAssignmentCount: number;
};

export const PROGRAM_PUBLICATION_PROVIDER_KEY = "programs.v1";
export const PROGRAM_PUBLICATION_PROVIDER_VERSION = 1;

export function previewProgramDelivery(input: {
    revision: ProgramRevision;
    locationId: string;
    locationLabel: string;
    context: ProgramConsumerContext;
}): ConfigurationTargetPreview {
    const { revision, context } = input;
    const sameRevision = context.currentRevisionId === revision.id;
    const impacts: ConfigurationTargetPreview["impacts"] = [];

    if (!context.offeringExists) {
        impacts.push({
            fieldKey: "offering",
            kind: "create",
            source: "location",
            message: "Create an unavailable Location offering linked to this published Program.",
        });
    } else if (sameRevision) {
        impacts.push({
            fieldKey: "revision",
            kind: "unchanged",
            source: "organization",
            message: "This Location already consumes the selected published revision.",
        });
    } else {
        impacts.push({
            fieldKey: "revision",
            kind: "update",
            source: "organization",
            message: `Update inherited Program identity to revision ${revision.revisionNumber}.`,
        });
    }

    if (context.localDescriptionOverride != null) {
        impacts.push({
            fieldKey: "description",
            kind: "unchanged",
            source: "location_override",
            message: "Preserve the permitted Location description.",
        });
    }
    if (context.offeringExists) {
        impacts.push({
            fieldKey: "offered",
            kind: "unchanged",
            source: "location",
            message: "Preserve whether this Location offers the Program.",
        });
    }
    if (context.protectedResourceAssignmentCount > 0) {
        impacts.push({
            fieldKey: "assignedResources",
            kind: "unchanged",
            source: "runtime_derived",
            message: `Preserve ${context.protectedResourceAssignmentCount} local delivery-resource assignment${
                context.protectedResourceAssignmentCount === 1 ? "" : "s"
            }.`,
        });
    }

    const requiredInputs: string[] = [];
    if (!context.localAuthorizationEvidence?.trim()) {
        requiredInputs.push("Local authorization evidence is not supplied.");
        impacts.push({
            fieldKey: "localAuthorizationEvidence",
            kind: "required_input",
            source: "missing",
            message: "The Location must supply local authorization evidence before readiness is complete.",
        });
    }

    return {
        locationId: input.locationId,
        locationLabel: input.locationLabel,
        eligible: true,
        currentRevisionId: context.currentRevisionId,
        nextRevisionId: revision.id,
        impacts,
        conflicts: [],
        requiredInputs,
    };
}

/**
 * Programs proves the generic adapter boundary. Persistence is injected by the
 * server service because each domain owns its authoritative consumer write.
 */
export function createProgramPublicationAdapter(
    deliver: ConfigurationPublicationDomainAdapter<
        ProgramRevision,
        ProgramConsumerContext
    >["deliver"],
): ConfigurationPublicationDomainAdapter<ProgramRevision, ProgramConsumerContext> {
    return {
        domainKey: "programs",
        providerKey: PROGRAM_PUBLICATION_PROVIDER_KEY,
        providerVersion: PROGRAM_PUBLICATION_PROVIDER_VERSION,
        preview: ({ revision, target, context }) =>
            previewProgramDelivery({
                revision,
                locationId: target.locationId,
                locationLabel: target.locationLabel,
                context,
            }),
        deliver,
    };
}
