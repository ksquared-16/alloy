/**
 * Child overview section visibility — real data only.
 */

import { resolveChildActivityPreview } from "@/lib/layout/runtime/resolveChildActivityPreview";
import {
    layoutRuntimeCommunicationWidgetHasContent,
    layoutRuntimeNotesWidgetHasContent,
} from "@/components/layout/LayoutRuntimeNotesCommunicationWidget";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export function childActivitySectionHasVisibleContent(record: ProofRuntimeRecord): boolean {
    return resolveChildActivityPreview(record).length > 0;
}

export function childNotesCommunicationSectionHasVisibleContent(record: ProofRuntimeRecord): boolean {
    return (
        layoutRuntimeNotesWidgetHasContent(record)
        || layoutRuntimeCommunicationWidgetHasContent(record)
    );
}

export function childDocumentsSectionHasVisibleContent(record: ProofRuntimeRecord): boolean {
    const overview =
        record._overview_data && typeof record._overview_data === "object"
            ? (record._overview_data as Record<string, unknown>)
            : record;
    const docs = record.documents ?? overview.documents ?? record._documents_preview;
    return Array.isArray(docs) && docs.length > 0;
}
