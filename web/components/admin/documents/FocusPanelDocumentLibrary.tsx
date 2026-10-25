"use client";

/**
 * D4 — the Focus Panel's document library for a case: the household behind the case, its adults, children and cases.
 *
 * The selected child (`child.customer_member_id` on the record) opens the library narrowed to that child; the operator
 * can widen it to the household. Mutation follows the portal's mutate access in the UI; every write is decided again by
 * the canonical routes (`documents.write`, subject scope, screening).
 */
import DocumentLibraryPanel from "@/components/admin/documents/DocumentLibraryPanel";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { LibrarySubjectRef } from "@/lib/documents/library/documentLibraryModel";

export function documentLibraryFocusFromRecord(record: Record<string, unknown> | null | undefined): LibrarySubjectRef | null {
    const child = record?.["child.customer_member_id"];
    return typeof child === "string" && child.trim() ? { subject_type: "child", subject_id: child.trim() } : null;
}

export default function FocusPanelDocumentLibrary({ opportunityId, record }: { opportunityId: string; record: Record<string, unknown> }) {
    const { canMutate } = useAdminAuth();
    return (
        <DocumentLibraryPanel
            anchor={{ subject_type: "opportunity", subject_id: opportunityId }}
            initialFocus={documentLibraryFocusFromRecord(record)}
            canMutate={Boolean(canMutate)}
        />
    );
}
