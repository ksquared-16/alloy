import { dispatchDrawerLayoutRuntimeBodyRecordPatch } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch";
import type {
    RelationshipActionExecutionRequest,
    RelationshipActionExecutionResult,
} from "@/lib/admin/relationship/relationshipActionContract";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export async function submitRelationshipAction(
    request: RelationshipActionExecutionRequest,
): Promise<RelationshipActionExecutionResult> {
    const response = await fetch("/api/admin/relationship-actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    const payload = (await response.json()) as RelationshipActionExecutionResult | { error?: string };
    if (!response.ok) {
        const message = "error" in payload && typeof payload.error === "string" ? payload.error : "Relationship action failed.";
        throw new Error(message);
    }
    return payload as RelationshipActionExecutionResult;
}

function mapRefreshEntityType(
    entityType: RelationshipActionExecutionResult["refresh_hints"]["entityType"],
): "opportunities" | "persons" | "child" {
    if (entityType === "person") return "persons";
    return entityType;
}

/** Persist relationship action and refresh layout runtime record in-place. */
export async function patchDrawerAfterRelationshipAction(args: {
    anchorRecord: ProofRuntimeRecord;
    request: RelationshipActionExecutionRequest;
}): Promise<ProofRuntimeRecord> {
    const result = await submitRelationshipAction(args.request);
    const nextRecord: ProofRuntimeRecord = {
        ...args.anchorRecord,
        _child_scoped_contact_links: result.scoped_contact_links,
        _child_scoped_contact_links_query_failed: false,
        ...(result.person_child_relationships_by_member
            ? { _person_child_relationships_by_member: result.person_child_relationships_by_member }
            : {}),
    };
    delete (nextRecord as Record<string, unknown>)._child_scoped_contact_links_query_error;

    dispatchDrawerLayoutRuntimeBodyRecordPatch({
        entityType: mapRefreshEntityType(result.refresh_hints.entityType),
        entityId: result.refresh_hints.entityId,
        record: nextRecord,
    });

    return nextRecord;
}

/** @deprecated use patchDrawerAfterRelationshipAction */
export async function patchChildDrawerAfterEmergencyContact(args: {
    childPersonId: string;
    anchorRecord: ProofRuntimeRecord;
    request: RelationshipActionExecutionRequest;
}): Promise<ProofRuntimeRecord> {
    return patchDrawerAfterRelationshipAction({
        anchorRecord: args.anchorRecord,
        request: args.request,
    });
}
