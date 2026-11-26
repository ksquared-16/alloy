import type {
    RelationshipResolutionDiagnostic,
    RelationshipResolutionSource,
} from "@/lib/fields/relationship/relationshipResolutionMetadata";

/**
 * Canonical relationship runtime resolution contract.
 *
 * Shared across Forms / Documents and future consumers. Relationship resolution
 * returns typed status — never collapses missing and ambiguous into null.
 */

export type RelationshipResolutionStatus =
    | "resolved"
    | "missing"
    | "ambiguous"
    | "unavailable"
    | "unsupported"
    | "invalid_context";

export type CanonicalRelationshipResolution = {
    status: RelationshipResolutionStatus;
    relationship_id: string;
    role?: string;
    source_entity_type: string;
    source_record_id?: string;
    target_entity_type: string;
    target_record_id?: string;
    candidate_count?: number;
    reason?: string;
    resolution_source?: RelationshipResolutionSource;
    diagnostics?: RelationshipResolutionDiagnostic[];
};

export function isResolvedRelationship(
    resolution: CanonicalRelationshipResolution,
): resolution is CanonicalRelationshipResolution & { status: "resolved"; target_record_id: string } {
    return resolution.status === "resolved" && Boolean(resolution.target_record_id?.trim());
}

export function relationshipResolutionFailureReason(
    resolution: CanonicalRelationshipResolution,
): string | undefined {
    if (resolution.status === "resolved") return undefined;
    return resolution.reason ?? resolution.status;
}
