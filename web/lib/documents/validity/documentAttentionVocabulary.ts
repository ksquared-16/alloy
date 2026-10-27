/**
 * D7 — the Documents attention vocabulary (client-safe; no server imports). The projection itself is
 * `documentAttention.ts`; Processing, Work Items and the Focus Panel label its rows from here.
 */
import type { RequirementSubjectType } from "@/lib/documents/requirements/documentRequirementPolicy";

export const DOCUMENT_ATTENTION_KINDS = Object.freeze(["expired", "expiring_soon", "review_due", "date_missing"] as const);
export type DocumentAttentionKind = (typeof DOCUMENT_ATTENTION_KINDS)[number];

export type DocumentAttentionRow = {
    /** Stable, derived: `document_attention:<document id>:<kind>`. Never a stored task. */
    id: string;
    kind: DocumentAttentionKind;
    document_id: string;
    document_title: string | null;
    document_type_key: string;
    document_type_label: string;
    subject_type: RequirementSubjectType;
    subject_id: string;
    subject_label: string;
    household_id: string | null;
    /** The expiration that applies (recorded or derived), when known. */
    expires_on: string | null;
    days_remaining: number | null;
    /** The date the row is due: the expiration for validity rows, the received date for review rows. */
    due_on: string | null;
    overdue: boolean;
    review_status: "pending" | "accepted" | "rejected" | null;
};

export const DOCUMENT_ATTENTION_ACTION: Readonly<Record<DocumentAttentionKind, string>> = Object.freeze({
    expired: "Collect the renewed document",
    expiring_soon: "Renew before it expires",
    review_due: "Review the document",
    date_missing: "Record the expiration date",
});
export const DOCUMENT_ATTENTION_LABEL: Readonly<Record<DocumentAttentionKind, string>> = Object.freeze({
    expired: "Expired",
    expiring_soon: "Expiring soon",
    review_due: "Review due",
    date_missing: "Date missing",
});

