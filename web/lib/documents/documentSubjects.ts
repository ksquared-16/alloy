/**
 * D2 — typed document subjects. ONE way to say what a document belongs to.
 *
 * `document_subjects` (migration 20261208090000) holds the associations: an `owner` belongs to the document's subject
 * matter, a `context` only links it. Exactly one active owner is PRIMARY; the legacy `documents.entity_type` /
 * `entity_id` are a projection of it, kept by the database for the consumers that still read them.
 *
 * ACCESS IS DECIDED BY THE PRIMARY OWNER ALONE (through the projection the D1a scope check already reads). Being linked
 * to a record an actor can read never grants that actor the document.
 *
 * The table is written ONLY through the governed functions (`document_set_primary_subject`, `document_link_subject`,
 * `document_unlink_subject`); the database refuses anything else. `document_subject_links` (view) adds the context
 * links other domains already hold — form submissions and Processing case sources — without copying them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { canonicalDocumentEntityType } from "@/lib/documents/documentEntityTypes";

export const DOCUMENT_SUBJECT_TYPES = Object.freeze([
    "household",
    "person",
    "child",
    "opportunity",
    "vendor",
    "processing_case",
    "form_submission",
] as const);
export type DocumentSubjectType = (typeof DOCUMENT_SUBJECT_TYPES)[number];

/** Subject types that may OWN a document. Processing cases and form submissions are context only. */
export const DOCUMENT_OWNER_SUBJECT_TYPES: readonly DocumentSubjectType[] = Object.freeze([
    "household",
    "person",
    "child",
    "opportunity",
    "vendor",
]);

/** Canonical owner type ↔ the legacy `entity_type` existing consumers read. Staff are `person` (canonical Person identity). */
const LEGACY_BY_SUBJECT: Readonly<Record<string, string>> = Object.freeze({
    child: "customer_member",
    person: "person",
    household: "customer",
    opportunity: "opportunity",
    vendor: "vendor",
});
const SUBJECT_BY_LEGACY: Readonly<Record<string, DocumentSubjectType>> = Object.freeze({
    customer_member: "child",
    person: "person",
    customer: "household",
    opportunity: "opportunity",
    vendor: "vendor",
});

export function isDocumentSubjectType(value: unknown): value is DocumentSubjectType {
    return typeof value === "string" && (DOCUMENT_SUBJECT_TYPES as readonly string[]).includes(value);
}

export function isDocumentOwnerSubjectType(value: unknown): value is DocumentSubjectType {
    return typeof value === "string" && (DOCUMENT_OWNER_SUBJECT_TYPES as readonly string[]).includes(value);
}

/** The owning subject type for a legacy `entity_type` (either spelling), or null when it is not a D2 owner type. */
export function documentSubjectTypeForLegacy(entityType: unknown): DocumentSubjectType | null {
    const canonical = canonicalDocumentEntityType(entityType);
    return canonical ? SUBJECT_BY_LEGACY[canonical] ?? null : null;
}

export function legacyEntityTypeForSubject(subjectType: DocumentSubjectType): string | null {
    return LEGACY_BY_SUBJECT[subjectType] ?? null;
}

export type DocumentSubjectLink = {
    subject_type: DocumentSubjectType;
    subject_id: string;
    association: "owner" | "context";
    is_primary: boolean;
    derived_from: string;
};

/** Every active association of one document, owned and derived. Read through the service-role client only. */
export async function listDocumentSubjects(
    supabase: SupabaseClient,
    orgId: string,
    documentId: string,
): Promise<{ ok: true; subjects: DocumentSubjectLink[] } | { ok: false; error: string }> {
    const { data, error } = await supabase
        .from("document_subject_links")
        .select("subject_type, subject_id, association, is_primary, derived_from")
        .eq("org_id", orgId)
        .eq("document_id", documentId);
    if (error) return { ok: false, error: error.message };
    const subjects = ((data ?? []) as DocumentSubjectLink[]).sort(
        (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.association.localeCompare(b.association),
    );
    return { ok: true, subjects };
}

export type SubjectChangeResult = { ok: true; result: Record<string, unknown> } | { ok: false; code: string; error: string };

function subjectError(error: { message?: string } | null): SubjectChangeResult {
    const message = error?.message ?? "unknown error";
    const code = /document_subject_unresolved/.test(message)
        ? "SUBJECT_NOT_IN_ORG"
        : /document_subject_not_owner_type|chk_document_subjects_owner_type/.test(message)
          ? "SUBJECT_CANNOT_OWN"
          : /document_primary_subject_required/.test(message)
            ? "PRIMARY_REQUIRED"
            : /document_not_found/.test(message)
              ? "NOT_FOUND"
              : "SUBJECT_CHANGE_FAILED";
    return { ok: false, code, error: message };
}

export async function setPrimaryDocumentSubject(
    supabase: SupabaseClient,
    input: { orgId: string; documentId: string; subjectType: DocumentSubjectType; subjectId: string; actorUserId: string | null },
): Promise<SubjectChangeResult> {
    const { data, error } = await supabase.rpc("document_set_primary_subject", {
        p_org_id: input.orgId,
        p_document_id: input.documentId,
        p_subject_type: input.subjectType,
        p_subject_id: input.subjectId,
        p_actor: input.actorUserId,
    });
    if (error) return subjectError(error);
    return { ok: true, result: (data ?? {}) as Record<string, unknown> };
}

export async function linkDocumentSubject(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        documentId: string;
        subjectType: DocumentSubjectType;
        subjectId: string;
        association: "owner" | "context";
        actorUserId: string | null;
    },
): Promise<SubjectChangeResult> {
    const { data, error } = await supabase.rpc("document_link_subject", {
        p_org_id: input.orgId,
        p_document_id: input.documentId,
        p_subject_type: input.subjectType,
        p_subject_id: input.subjectId,
        p_association: input.association,
        p_actor: input.actorUserId,
    });
    if (error) return subjectError(error);
    return { ok: true, result: (data ?? {}) as Record<string, unknown> };
}

export async function unlinkDocumentSubject(
    supabase: SupabaseClient,
    input: { orgId: string; documentId: string; subjectType: DocumentSubjectType; subjectId: string; actorUserId: string | null },
): Promise<SubjectChangeResult> {
    const { data, error } = await supabase.rpc("document_unlink_subject", {
        p_org_id: input.orgId,
        p_document_id: input.documentId,
        p_subject_type: input.subjectType,
        p_subject_id: input.subjectId,
        p_actor: input.actorUserId,
    });
    if (error) return subjectError(error);
    return { ok: true, result: (data ?? {}) as Record<string, unknown> };
}
