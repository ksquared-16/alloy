"use client";

import type { MouseEvent } from "react";
import { QueueRecordLinkedField } from "@/components/layout/QueueRecordFieldRenderer";
import type { LayoutItem } from "@/lib/layout/layoutV2";
import type { QueueLayoutDrawerIconHandlers } from "@/lib/layout/runtime/buildQueueLayoutRuntimeAdornmentHandler";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    field: QueueRecordFieldConfig;
    item: LayoutItem;
    record: ProofRuntimeRecord;
    anchorRecord: ProofRuntimeRecord;
    display: string;
    drawerHandlers?: QueueLayoutDrawerIconHandlers;
    onOpenOpportunity?: () => void;
};

/** Thin wrapper — all link rendering lives in QueueRecordLinkedField. */
export default function QueueRowLinkedFieldButton(props: Props) {
    return <QueueRecordLinkedField {...props} />;
}
