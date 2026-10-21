/**
 * MEDICAL CONSENT — the one writer and reader of `person_medical_consents`.
 *
 * A consent is a STATE: granted (from a specific text, by a named person, at a time), effective,
 * then withdrawn or superseded. The database refuses to rewrite what was granted and only lets the
 * state move forward; this module adds the access boundary (health.manage to write, health.view to
 * read) and the lifecycle rules:
 *
 *   record   — a new grant SUPERSEDES the child's active consent of the same kind (one active).
 *   withdraw — an operator records the family's withdrawal, with a reason. It is never deleted.
 *
 * The signed artifact is NOT stored here. `evidence_document_id` points at the Forms-owned signed
 * document and `source_ref` at the submission; Documents owns retention of that artifact.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertHealthAccess, HEALTH_MANAGE_PERMISSION, HEALTH_VIEW_PERMISSION, type HealthAccessSubject } from "@/lib/health/healthAccess";
import type { MedicalConsentKind } from "@/lib/health/healthCaptureDeclaration";

export const MEDICAL_CONSENTS_TABLE = "person_medical_consents";

export type MedicalConsentRow = {
    id: string;
    org_id: string;
    subject_entity_id: string;
    consent_kind: MedicalConsentKind;
    text_form_definition_version_id: string | null;
    text_field_ids: string[];
    text_sha256: string | null;
    scope: Record<string, unknown>;
    granted_by_name: string | null;
    granted_by_person_id: string | null;
    granted_at: string;
    effective_from: string;
    effective_to: string | null;
    status: "active" | "withdrawn" | "superseded";
    withdrawn_at: string | null;
    withdrawn_by: string | null;
    withdrawal_reason: string | null;
    supersedes_id: string | null;
    source_kind: "form_submission" | "operator";
    source_ref: string | null;
    evidence_document_id: string | null;
    created_at: string;
};

export const MEDICAL_CONSENT_SELECT =
    "id, org_id, subject_entity_id, consent_kind, text_form_definition_version_id, text_field_ids, text_sha256, scope, granted_by_name, granted_by_person_id, granted_at, effective_from, effective_to, status, withdrawn_at, withdrawn_by, withdrawal_reason, supersedes_id, source_kind, source_ref, evidence_document_id, created_at";

export class MedicalConsentError extends Error {
    constructor(readonly code: "invalid_input" | "not_found" | "not_active" | "db_error", message: string) {
        super(message);
        this.name = "MedicalConsentError";
    }
}

const ymd = (iso: string) => iso.slice(0, 10);

export async function recordMedicalConsent(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        access: HealthAccessSubject;
        customerMemberId: string;
        consentKind: MedicalConsentKind;
        textFormDefinitionVersionId: string | null;
        textFieldIds: readonly string[];
        textSha256: string | null;
        grantedByName: string | null;
        grantedAt: string;
        sourceKind: "form_submission" | "operator";
        sourceRef: string | null;
        evidenceDocumentId: string | null;
        actorUserId: string | null;
    },
): Promise<{ consent: MedicalConsentRow; superseded: MedicalConsentRow | null; alreadyRecorded: boolean }> {
    assertHealthAccess(input.access, HEALTH_MANAGE_PERMISSION);
    if (!input.customerMemberId.trim()) throw new MedicalConsentError("invalid_input", "a child is required");

    // Idempotent on the source: the same signed submission is one consent, whatever retries do.
    if (input.sourceRef) {
        const { data: existing, error } = await supabase
            .from(MEDICAL_CONSENTS_TABLE)
            .select(MEDICAL_CONSENT_SELECT)
            .eq("org_id", input.orgId)
            .eq("consent_kind", input.consentKind)
            .eq("source_ref", input.sourceRef)
            .maybeSingle();
        if (error) throw new MedicalConsentError("db_error", error.message);
        if (existing) return { consent: existing as unknown as MedicalConsentRow, superseded: null, alreadyRecorded: true };
    }

    const { data: active, error: activeError } = await supabase
        .from(MEDICAL_CONSENTS_TABLE)
        .select(MEDICAL_CONSENT_SELECT)
        .eq("org_id", input.orgId)
        .eq("subject_entity_id", input.customerMemberId)
        .eq("consent_kind", input.consentKind)
        .eq("status", "active")
        .maybeSingle();
    if (activeError) throw new MedicalConsentError("db_error", activeError.message);

    // One active per child and kind: the prior grant is superseded BEFORE the new one is inserted
    // (the partial unique index would refuse the second active row otherwise).
    let superseded: MedicalConsentRow | null = null;
    if (active) {
        const { data: closed, error } = await supabase
            .from(MEDICAL_CONSENTS_TABLE)
            .update({ status: "superseded", effective_to: ymd(input.grantedAt) })
            .eq("org_id", input.orgId)
            .eq("id", (active as { id: string }).id)
            .eq("status", "active")
            .select(MEDICAL_CONSENT_SELECT)
            .maybeSingle();
        if (error) throw new MedicalConsentError("db_error", error.message);
        superseded = (closed as unknown as MedicalConsentRow) ?? null;
    }

    const { data, error } = await supabase
        .from(MEDICAL_CONSENTS_TABLE)
        .insert({
            org_id: input.orgId,
            subject_entity_type: "customer_member",
            subject_entity_id: input.customerMemberId,
            consent_kind: input.consentKind,
            text_form_definition_version_id: input.textFormDefinitionVersionId,
            text_field_ids: [...input.textFieldIds],
            text_sha256: input.textSha256,
            granted_by_name: input.grantedByName,
            granted_at: input.grantedAt,
            effective_from: ymd(input.grantedAt),
            status: "active",
            supersedes_id: superseded?.id ?? null,
            source_kind: input.sourceKind,
            source_ref: input.sourceRef,
            evidence_document_id: input.evidenceDocumentId,
            recorded_by: input.actorUserId,
        })
        .select(MEDICAL_CONSENT_SELECT)
        .single();
    if (error) throw new MedicalConsentError("db_error", error.message);
    return { consent: data as unknown as MedicalConsentRow, superseded, alreadyRecorded: false };
}

export async function withdrawMedicalConsent(
    supabase: SupabaseClient,
    input: { orgId: string; access: HealthAccessSubject; consentId: string; reason: string; actorUserId: string | null; withdrawnAt?: string },
): Promise<MedicalConsentRow> {
    assertHealthAccess(input.access, HEALTH_MANAGE_PERMISSION);
    const reason = input.reason.trim();
    if (!reason) throw new MedicalConsentError("invalid_input", "a withdrawal needs a reason");
    const at = input.withdrawnAt ?? new Date().toISOString();
    const { data, error } = await supabase
        .from(MEDICAL_CONSENTS_TABLE)
        .update({ status: "withdrawn", withdrawn_at: at, withdrawn_by: input.actorUserId, withdrawal_reason: reason, effective_to: ymd(at) })
        .eq("org_id", input.orgId)
        .eq("id", input.consentId)
        .eq("status", "active")
        .select(MEDICAL_CONSENT_SELECT)
        .maybeSingle();
    if (error) throw new MedicalConsentError("db_error", error.message);
    if (!data) throw new MedicalConsentError("not_active", "Only an active authorization can be withdrawn.");
    return data as unknown as MedicalConsentRow;
}

/** A child's consents, newest first — the current state and its history. Requires health.view. */
export async function readMedicalConsents(
    supabase: SupabaseClient,
    input: { orgId: string; access: HealthAccessSubject; customerMemberId: string },
): Promise<MedicalConsentRow[]> {
    assertHealthAccess(input.access, HEALTH_VIEW_PERMISSION);
    const { data, error } = await supabase
        .from(MEDICAL_CONSENTS_TABLE)
        .select(MEDICAL_CONSENT_SELECT)
        .eq("org_id", input.orgId)
        .eq("subject_entity_id", input.customerMemberId)
        .order("granted_at", { ascending: false });
    if (error) throw new MedicalConsentError("db_error", error.message);
    return (data ?? []) as unknown as MedicalConsentRow[];
}
