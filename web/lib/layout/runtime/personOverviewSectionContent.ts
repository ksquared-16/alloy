/**
 * Person overview section visibility — real data only, no invented content.
 */

import { resolvePersonActivityPreview } from "@/lib/layout/runtime/resolvePersonActivityPreview";
import {
    layoutRuntimeCommunicationWidgetHasContent,
    layoutRuntimeNotesWidgetHasContent,
} from "@/components/layout/LayoutRuntimeNotesCommunicationWidget";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export function personActivitySectionHasVisibleContent(record: ProofRuntimeRecord): boolean {
    return resolvePersonActivityPreview(record).length > 0;
}

export function personNotesCommunicationSectionHasVisibleContent(record: ProofRuntimeRecord): boolean {
    return (
        layoutRuntimeNotesWidgetHasContent(record)
        || layoutRuntimeCommunicationWidgetHasContent(record)
    );
}

export function personDocumentsSectionHasVisibleContent(record: ProofRuntimeRecord): boolean {
    const overview =
        record._overview_data && typeof record._overview_data === "object"
            ? (record._overview_data as Record<string, unknown>)
            : record;
    const docs = record.documents ?? overview.documents ?? record._documents_preview;
    return Array.isArray(docs) && docs.length > 0;
}
