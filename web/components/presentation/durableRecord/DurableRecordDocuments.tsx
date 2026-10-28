"use client";

/**
 * The durable record's Documents section — where "Open the record's documents" lands for a child, person or household.
 *
 * A durable child's composition is `[children]` (no Documents grain: D4 anchored the library on the case), so a
 * `card=documents` focus on a durable record used to raise a card that was never composed and the operator saw no
 * documents (D6 hosted walk). The library already accepts any subject as its anchor; this section mounts it for the
 * record's own subject, opens it narrowed to a child or person, and scrolls it into view. Published surfaces are not
 * involved. Mutation follows the portal's mutate access in the UI; every read and write is decided again by the
 * canonical routes (subject scope, sensitivity clearance, `documents.write`).
 */
import { useEffect, useRef } from "react";

import DocumentLibraryPanel from "@/components/admin/documents/DocumentLibraryPanel";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { LibrarySubjectRef } from "@/lib/documents/library/documentLibraryModel";
import type { DurableSubjectType } from "@/lib/runtime/focus/durableRecordRoute";
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";

/** The card key every "open the record's documents" caller sends (`OPERATOR_FOCUS_CARDS.documents`). */
export const DURABLE_RECORD_DOCUMENTS_CARD: string = OPERATOR_FOCUS_CARDS.documents;

export function durableRecordDocumentsFocus(subjectType: DurableSubjectType, subjectId: string): {
    anchor: LibrarySubjectRef;
    initialFocus: LibrarySubjectRef | null;
} {
    const anchor: LibrarySubjectRef = { subject_type: subjectType, subject_id: subjectId };
    return { anchor, initialFocus: subjectType === "household" ? null : anchor };
}

export default function DurableRecordDocuments({ subjectType, subjectId }: { subjectType: DurableSubjectType; subjectId: string }) {
    const { canMutate } = useAdminAuth();
    const ref = useRef<HTMLElement | null>(null);
    useEffect(() => {
        ref.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }, [subjectType, subjectId]);
    const { anchor, initialFocus } = durableRecordDocumentsFocus(subjectType, subjectId);
    return (
        <section ref={ref} className="mt-3" data-durable-record-documents={`${subjectType}:${subjectId}`} aria-label="Documents">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Documents</h2>
            <DocumentLibraryPanel anchor={anchor} initialFocus={initialFocus} canMutate={Boolean(canMutate)} />
        </section>
    );
}
