/**
 * Resolve drawer target ids for queue record configured link fields.
 */

import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";
import { resolveLayoutRuntimeChildOpenTarget } from "@/lib/layout/runtime/resolveLayoutRuntimeChildOpenTarget";
import { resolveLinkId } from "@/lib/layout/runtime/queueRecordScopedResolve";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

function resolveChildLinkTarget(
    field: QueueRecordFieldConfig,
    record: ProofRuntimeRecord,
    anchorRecord: ProofRuntimeRecord,
) {
    const rowRecord = record !== anchorRecord ? record : anchorRecord;
    return resolveLayoutRuntimeChildOpenTarget(rowRecord, {
        idPath: field.link?.idFieldKey ?? "child.id",
        refKey: field.fieldKey,
        anchorRecord,
    });
}

/** Resolve the entity id for a queue row link field from record context. */
export function resolveQueueRecordLinkTargetId(
    field: QueueRecordFieldConfig,
    record: ProofRuntimeRecord,
    anchorRecord: ProofRuntimeRecord,
): string | null {
    const target = field.link?.target;
    if (!target || target === "none") return null;

    if (target === "opportunity_drawer") {
        const idPath = field.link?.idFieldKey ?? "opportunity.id";
        return (
            resolveLinkId(anchorRecord, { ...field, link: { target, idFieldKey: idPath } })
            ?? resolveLinkId(record, { ...field, link: { target, idFieldKey: idPath } })
            ?? trimId(anchorRecord["opportunity.id"])
            ?? trimId(anchorRecord.id)
        );
    }

    if (target === "person_drawer") {
        const idPath = field.link?.idFieldKey ?? "opportunity.primary_person_id";
        return (
            resolveLinkId(record, { ...field, link: { target, idFieldKey: idPath } })
            ?? resolveLinkId(anchorRecord, { ...field, link: { target, idFieldKey: idPath } })
            ?? trimId(anchorRecord["opportunity.primary_person_id"])
            ?? trimId(anchorRecord["person.id"])
            ?? trimId(anchorRecord._primary_person_id)
            ?? trimId(anchorRecord.primary_person_id)
        );
    }

    if (target === "child_drawer" || target === "related_record_drawer") {
        const openTarget = resolveChildLinkTarget(field, record, anchorRecord);
        return openTarget.personId?.trim() || null;
    }

    return null;
}

/** True when a configured link field can open its drawer (person/opp id or child person/member id). */
export function isQueueRecordLinkResolvable(
    field: QueueRecordFieldConfig,
    record: ProofRuntimeRecord,
    anchorRecord: ProofRuntimeRecord,
): boolean {
    const target = field.link?.target;
    if (!target || target === "none") return false;
    if (target === "opportunity_drawer" || target === "person_drawer") {
        return Boolean(resolveQueueRecordLinkTargetId(field, record, anchorRecord));
    }
    if (target === "child_drawer" || target === "related_record_drawer") {
        const openTarget = resolveChildLinkTarget(field, record, anchorRecord);
        return Boolean(openTarget.personId?.trim() || openTarget.customerMemberId?.trim());
    }
    return false;
}
