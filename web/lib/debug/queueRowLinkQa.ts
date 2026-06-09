import {
    isQueueRecordLinkResolvable,
    resolveQueueRecordLinkTargetId,
} from "@/lib/layout/runtime/resolveQueueRecordLinkTargetId";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export function isQueueRowLinkQaEnabled(): boolean {
    return process.env.NEXT_PUBLIC_QUEUE_ROW_LINK_QA === "1";
}

export function resolveQueueRowLinkQaLabel(
    field: QueueRecordFieldConfig,
    record: ProofRuntimeRecord,
    anchorRecord: ProofRuntimeRecord,
): string {
    const target = field.link?.target;
    if (!target || target === "none") return "";
    const resolvable = isQueueRecordLinkResolvable(field, record, anchorRecord);
    const id = resolveQueueRecordLinkTargetId(field, record, anchorRecord);
    if (target === "person_drawer") return resolvable ? "person id ✓" : "missing person id";
    if (target === "child_drawer" || target === "related_record_drawer") return resolvable ? "child id ✓" : "missing child id";
    if (target === "opportunity_drawer") return id ? "opp id ✓" : "missing opp id";
    return id ? "id ✓" : "missing id";
}
