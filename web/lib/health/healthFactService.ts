/**
 * H4 — the ONE canonical Health mutation seam.
 *
 * Per `docs/platform/operator/health-foundation-h1-h4-contract.md`:
 *
 *   `health_fact.add`   new row, status = active, source_kind + source_ref required
 *   `health_fact.edit`  new row with supersedes_id; old row status = superseded, effective_to closed
 *   `health_fact.end`   status = ended, effective_to set. NEVER a delete
 *
 * ── WHY ONE SEAM ──
 *
 * Forms collect, Trust interprets and proposes, the card reads. If any of them wrote health storage
 * directly there would be three implementations of supersession, and the first one to forget the
 * lineage would silently destroy a child's medical history. Trust emits a proposal; THIS performs
 * the write. That is the whole reason the module exists.
 *
 * ── EDIT IS NOT AN UPDATE ──
 *
 * Editing an allergy writes a NEW row and closes the old one. The database enforces it — the
 * immutability trigger refuses any in-place change to what a fact says — but the point is that the
 * history survives, not that the database stops us. Attendance taught this the expensive way.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    assertHealthAccess,
    HEALTH_MANAGE_PERMISSION,
    type HealthAccessSubject,
} from "@/lib/health/healthAccess";
import {
    PERSON_HEALTH_FACTS_TABLE,
    PERSON_HEALTH_FACT_SELECT,
    isHealthFactKind,
    type HealthFactKind,
    type HealthFactSourceKind,
    type HealthSubjectType,
    type PersonHealthFactRow,
} from "@/lib/health/healthFactModel";

export class HealthFactError extends Error {
    constructor(
        readonly code: "invalid_input" | "not_found" | "invalid_state" | "db_error",
        message: string,
    ) {
        super(message);
        this.name = "HealthFactError";
    }
}

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

export type AddHealthFactInput = {
    orgId: string;
    /** D-H6. Required — see the note on HealthFactQuery.access. */
    access: HealthAccessSubject;
    subjectEntityType: HealthSubjectType;
    subjectEntityId: string;
    factKind: HealthFactKind;
    payload: Record<string, unknown>;
    /** Provenance is REQUIRED: a health fact with no answer to "who said so" cannot be acted on. */
    sourceKind: HealthFactSourceKind;
    sourceRef?: string | null;
    effectiveFrom?: string | null;
    /** A medication points at the allergy or condition it treats. */
    relatedFactId?: string | null;
    actorUserId?: string | null;
};

function assertAddInput(input: AddHealthFactInput): void {
    assertHealthAccess(input.access, HEALTH_MANAGE_PERMISSION);
    if (!t(input.orgId)) throw new HealthFactError("invalid_input", "orgId is required");
    if (!t(input.subjectEntityId)) {
        throw new HealthFactError("invalid_input", "a subject is required");
    }
    if (!isHealthFactKind(input.factKind)) {
        throw new HealthFactError("invalid_input", `unknown health fact kind: ${String(input.factKind)}`);
    }
    if (!t(input.sourceKind)) {
        throw new HealthFactError("invalid_input", "source_kind is required — a health fact must say who asserted it");
    }
    /*
     * A payload with nothing in it is not a health fact.
     *
     * The per-kind readers are deliberately tolerant of missing keys, so an empty payload would
     * round-trip as an allergy with no allergen and no severity — a row that occupies a critical
     * region of the card and says nothing. Refuse it at the seam instead.
     */
    if (!input.payload || Object.keys(input.payload).length === 0) {
        throw new HealthFactError("invalid_input", "a health fact needs a payload");
    }
}

export async function addHealthFact(
    supabase: SupabaseClient,
    input: AddHealthFactInput,
): Promise<PersonHealthFactRow> {
    assertAddInput(input);
    const { data, error } = await supabase
        .from(PERSON_HEALTH_FACTS_TABLE)
        .insert({
            org_id: input.orgId,
            subject_entity_type: input.subjectEntityType,
            subject_entity_id: input.subjectEntityId,
            fact_kind: input.factKind,
            payload: input.payload,
            status: "active",
            effective_from: t(input.effectiveFrom) || todayYmd(),
            effective_to: null,
            source_kind: input.sourceKind,
            source_ref: t(input.sourceRef) || null,
            related_fact_id: t(input.relatedFactId) || null,
            created_by: input.actorUserId ?? null,
            updated_by: input.actorUserId ?? null,
        })
        .select(PERSON_HEALTH_FACT_SELECT)
        .single();
    if (error) throw new HealthFactError("db_error", error.message);
    return data as unknown as PersonHealthFactRow;
}

async function loadFact(
    supabase: SupabaseClient,
    orgId: string,
    factId: string,
): Promise<PersonHealthFactRow> {
    const { data, error } = await supabase
        .from(PERSON_HEALTH_FACTS_TABLE)
        .select(PERSON_HEALTH_FACT_SELECT)
        .eq("org_id", orgId)
        .eq("id", factId)
        .maybeSingle();
    if (error) throw new HealthFactError("db_error", error.message);
    if (!data) throw new HealthFactError("not_found", "health fact not found");
    return data as unknown as PersonHealthFactRow;
}

export type EditHealthFactInput = {
    orgId: string;
    /** D-H6. Required — see the note on HealthFactQuery.access. */
    access: HealthAccessSubject;
    factId: string;
    /** The corrected payload IN FULL — a partial patch would make the new row an incomplete fact. */
    payload: Record<string, unknown>;
    sourceKind: HealthFactSourceKind;
    sourceRef?: string | null;
    relatedFactId?: string | null;
    actorUserId?: string | null;
};

/**
 * Correct a fact: assert the replacement, then close the original.
 *
 * ── ORDER MATTERS, AND THIS IS THE SAFE ONE ──
 *
 * The successor is written FIRST. If the process dies between the two writes, the subject has two
 * active facts — visibly duplicated, and obvious to an operator. Closing first would leave a window
 * in which the child has NO recorded allergy, which is the failure that hurts someone. Between a
 * visible duplicate and a silent absence, health takes the duplicate.
 */
export async function editHealthFact(
    supabase: SupabaseClient,
    input: EditHealthFactInput,
): Promise<{ superseded: PersonHealthFactRow; created: PersonHealthFactRow }> {
    assertHealthAccess(input.access, HEALTH_MANAGE_PERMISSION);
    const original = await loadFact(supabase, input.orgId, t(input.factId));
    if (original.status !== "active") {
        throw new HealthFactError(
            "invalid_state",
            `this health fact is ${original.status} and cannot be corrected — assert a new fact instead`,
        );
    }
    if (!input.payload || Object.keys(input.payload).length === 0) {
        throw new HealthFactError("invalid_input", "a correction needs the full corrected payload");
    }

    const { data: createdRow, error: createError } = await supabase
        .from(PERSON_HEALTH_FACTS_TABLE)
        .insert({
            org_id: original.org_id,
            subject_entity_type: original.subject_entity_type,
            subject_entity_id: original.subject_entity_id,
            fact_kind: original.fact_kind,
            payload: input.payload,
            status: "active",
            effective_from: todayYmd(),
            effective_to: null,
            source_kind: input.sourceKind,
            source_ref: t(input.sourceRef) || null,
            supersedes_id: original.id,
            related_fact_id: t(input.relatedFactId) || original.related_fact_id,
            created_by: input.actorUserId ?? null,
            updated_by: input.actorUserId ?? null,
        })
        .select(PERSON_HEALTH_FACT_SELECT)
        .single();
    if (createError) throw new HealthFactError("db_error", createError.message);

    const { data: closedRow, error: closeError } = await supabase
        .from(PERSON_HEALTH_FACTS_TABLE)
        .update({ status: "superseded", effective_to: todayYmd(), updated_by: input.actorUserId ?? null })
        .eq("org_id", original.org_id)
        .eq("id", original.id)
        // Never close a row that something else already closed underneath us.
        .eq("status", "active")
        .select(PERSON_HEALTH_FACT_SELECT)
        .maybeSingle();
    if (closeError) throw new HealthFactError("db_error", closeError.message);
    if (!closedRow) {
        throw new HealthFactError(
            "invalid_state",
            "the original fact changed while the correction was being written — re-read and try again",
        );
    }

    return {
        superseded: closedRow as unknown as PersonHealthFactRow,
        created: createdRow as unknown as PersonHealthFactRow,
    };
}

export type EndHealthFactInput = {
    orgId: string;
    /** D-H6. Required — see the note on HealthFactQuery.access. */
    access: HealthAccessSubject;
    factId: string;
    /** The day it stopped being true. Defaults to today; never in the future by accident. */
    effectiveTo?: string | null;
    reason?: string | null;
    actorUserId?: string | null;
};

/** End a fact. NEVER a delete — the row stays and says when it stopped being true. */
export async function endHealthFact(
    supabase: SupabaseClient,
    input: EndHealthFactInput,
): Promise<PersonHealthFactRow> {
    assertHealthAccess(input.access, HEALTH_MANAGE_PERMISSION);
    const original = await loadFact(supabase, input.orgId, t(input.factId));
    if (original.status !== "active") {
        throw new HealthFactError("invalid_state", `this health fact is already ${original.status}`);
    }
    const effectiveTo = t(input.effectiveTo) || todayYmd();
    const { data, error } = await supabase
        .from(PERSON_HEALTH_FACTS_TABLE)
        .update({
            status: "ended",
            effective_to: effectiveTo,
            updated_by: input.actorUserId ?? null,
            metadata: { ...(original.metadata ?? {}), end_reason: t(input.reason) || null },
        })
        .eq("org_id", input.orgId)
        .eq("id", original.id)
        .eq("status", "active")
        .select(PERSON_HEALTH_FACT_SELECT)
        .maybeSingle();
    if (error) throw new HealthFactError("db_error", error.message);
    if (!data) throw new HealthFactError("invalid_state", "the fact changed while it was being ended");
    return data as unknown as PersonHealthFactRow;
}

export type VerifyImmunizationFactInput = {
    orgId: string;
    /** D-H6. Required: verification is Medical's canonical fact authority (`health.manage`). */
    access: HealthAccessSubject;
    factId: string;
    /**
     * EN-FI-10: the certificate the verifier checked, when there is one. It must be the child's own immunization record
     * whose CURRENT version Documents review ACCEPTED — an uploaded or rejected certificate is evidence of nothing yet.
     * Absent: the verifier attests from another source (e.g. the state registry) and says so in `basis`.
     */
    evidenceDocumentId?: string | null;
    /** Why this is verified (e.g. "Checked against the accepted certificate", "State registry lookup"). Required. */
    basis: string;
    actorUserId?: string | null;
};

export const IMMUNIZATION_EVIDENCE_DOCUMENT_TYPE = "immunization_record";

/**
 * EN-FI-10 — VERIFY an immunization fact: the one act that turns REPORTED vaccine information into the VERIFIED Medical
 * immunization state.
 *
 * It is never a side effect. A Forms answer becomes a reported proposal (`healthCaptureProposals`, `reported: true`);
 * an upload becomes a document; a Documents review accepts or rejects that document's evidence — and none of those
 * touch `person_health_facts`. Only a holder of `health.manage` verifies, by this call, one active immunization fact at a
 * time. What the fact SAYS is not changed (the immutability trigger forbids it); `confirmed_by` / `confirmed_at` record
 * who verified it and when, and `metadata.verification` records the basis and the certificate version checked.
 * Compare-and-set on `confirmed_at IS NULL`: verifying twice is a no-op that reports the first verification.
 */
export async function verifyImmunizationFact(
    supabase: SupabaseClient,
    input: VerifyImmunizationFactInput,
): Promise<{ fact: PersonHealthFactRow; alreadyVerified: boolean }> {
    assertHealthAccess(input.access, HEALTH_MANAGE_PERMISSION);
    const basis = t(input.basis);
    if (basis.length < 3) throw new HealthFactError("invalid_input", "say what the verification is based on");
    const fact = await loadFact(supabase, input.orgId, t(input.factId));
    if (fact.fact_kind !== "immunization") throw new HealthFactError("invalid_input", "only an immunization fact is verified here");
    if (fact.status !== "active") throw new HealthFactError("invalid_state", `this immunization fact is ${fact.status}; verify its current version`);
    if (fact.confirmed_at) return { fact, alreadyVerified: true };

    let evidence: { document_id: string; version_id: string } | null = null;
    const evidenceId = t(input.evidenceDocumentId);
    if (evidenceId) {
        const { data: doc, error: docErr } = await supabase
            .from("documents")
            .select("id, doc_type, status, current_version_id")
            .eq("org_id", input.orgId)
            .eq("id", evidenceId)
            .maybeSingle();
        if (docErr) throw new HealthFactError("db_error", docErr.message);
        const d = doc as { id: string; doc_type: string | null; status: string | null; current_version_id: string | null } | null;
        if (!d || d.doc_type !== IMMUNIZATION_EVIDENCE_DOCUMENT_TYPE || !d.current_version_id || ["deleted", "quarantined", "restricted"].includes(String(d.status ?? ""))) {
            throw new HealthFactError("invalid_input", "the evidence must be an available immunization record");
        }
        const { data: owners, error: ownErr } = await supabase
            .from("document_subjects")
            .select("subject_type, subject_id")
            .eq("org_id", input.orgId)
            .eq("document_id", d.id)
            .eq("association", "owner")
            .is("ended_at", null);
        if (ownErr) throw new HealthFactError("db_error", ownErr.message);
        const childOwns = ((owners ?? []) as Array<{ subject_type: string; subject_id: string }>).some(
            (o) => o.subject_type === (fact.subject_entity_type === "customer_member" ? "child" : "person") && o.subject_id === fact.subject_entity_id,
        );
        if (!childOwns) throw new HealthFactError("invalid_input", "the certificate does not belong to this child");
        const { data: version, error: vErr } = await supabase
            .from("document_versions")
            .select("id, review_status")
            .eq("org_id", input.orgId)
            .eq("id", d.current_version_id)
            .maybeSingle();
        if (vErr) throw new HealthFactError("db_error", vErr.message);
        if ((version as { review_status?: string | null } | null)?.review_status !== "accepted") {
            throw new HealthFactError("invalid_state", "the certificate has not been accepted in Documents review");
        }
        evidence = { document_id: d.id, version_id: d.current_version_id };
    }

    const verifiedAt = new Date().toISOString();
    const { data, error } = await supabase
        .from(PERSON_HEALTH_FACTS_TABLE)
        .update({
            confirmed_by: input.actorUserId ?? null,
            confirmed_at: verifiedAt,
            updated_by: input.actorUserId ?? null,
            metadata: {
                ...(fact.metadata ?? {}),
                verification: { basis, evidence_document_id: evidence?.document_id ?? null, evidence_version_id: evidence?.version_id ?? null, verified_at: verifiedAt },
            },
        })
        .eq("org_id", input.orgId)
        .eq("id", fact.id)
        .eq("status", "active")
        .is("confirmed_at", null)
        .select(PERSON_HEALTH_FACT_SELECT)
        .maybeSingle();
    if (error) throw new HealthFactError("db_error", error.message);
    if (!data) {
        const again = await loadFact(supabase, input.orgId, fact.id);
        if (again.confirmed_at) return { fact: again, alreadyVerified: true };
        throw new HealthFactError("invalid_state", "the fact changed while it was being verified — re-read and try again");
    }
    return { fact: data as unknown as PersonHealthFactRow, alreadyVerified: false };
}
