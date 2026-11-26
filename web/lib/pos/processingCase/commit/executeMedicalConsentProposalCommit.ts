/**
 * Commit an approved MEDICAL CONSENT proposal — a signed release or treatment authorization the
 * form declared — as the child's consent STATE, through Medical's one writer.
 *
 *   operator approval (Processing) → Health access (health.manage) → the submission's own child
 *   → the exact text authorized (form version + declared blocks, hashed) → the signed artifact as
 *   evidence (pointer to the Forms-owned signed document) → recordMedicalConsent
 *
 * An unsigned or rejected proposal never records; a retry of a recorded one is `already_applied`.
 */

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRelatedRecordProposalForCase } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import { isRejectedProposal } from "@/lib/pos/processingCase/commit/participantChildRequestCommit";
import { evaluateHealthAccess, HEALTH_MANAGE_PERMISSION, type HealthAccessSubject } from "@/lib/health/healthAccess";
import { MedicalConsentError, recordMedicalConsent } from "@/lib/health/medicalConsentService";
import { safeParseFormSchema, type FormField } from "@/lib/forms/schema";

export const MEDICAL_CONSENT_COMMIT_LEDGER_KEY = "medical_consent_commits";

export type MedicalConsentCommitRecord = {
    outcome: "applied" | "already_on_record";
    proposal_id: string;
    consent_id: string;
    consent_kind: string;
    customer_member_id: string;
    superseded_consent_id: string | null;
    actor_user_id: string | null;
    committed_at: string;
};

export type MedicalConsentCommitOutcome =
    | { ok: true; status: 200; already_applied: boolean; record: MedicalConsentCommitRecord }
    | { ok: false; status: number; code: string; error: string };

function ledgerFrom(metadata: Record<string, unknown>): Record<string, MedicalConsentCommitRecord> {
    const raw = metadata[MEDICAL_CONSENT_COMMIT_LEDGER_KEY];
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, MedicalConsentCommitRecord>) : {};
}

function blockText(fields: readonly FormField[], id: string): string | null {
    for (const f of fields) {
        if (f.id === id) return f.type === "text_block" ? `${f.label ?? ""}\n${(f as { content?: string }).content ?? ""}` : f.label ?? "";
        if (f.type === "group") {
            const hit = blockText(f.fields, id);
            if (hit !== null) return hit;
        }
    }
    return null;
}

/** The authorized text, exactly as published on that version — so "what did they agree to" survives edits. */
export function consentTextSha256(fields: readonly FormField[], textFieldIds: readonly string[]): string | null {
    const parts = textFieldIds.map((id) => blockText(fields, id)).filter((t): t is string => t !== null);
    if (parts.length === 0) return null;
    return createHash("sha256").update(parts.join("\n\n"), "utf8").digest("hex");
}

export async function executeMedicalConsentProposalCommit(args: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string | null;
    access: HealthAccessSubject;
    caseId: string;
    proposalId: string;
    metadata: Record<string, unknown>;
}): Promise<MedicalConsentCommitOutcome> {
    const fail = (status: number, code: string, error: string): MedicalConsentCommitOutcome => ({ ok: false, status, code, error });
    const access = evaluateHealthAccess(args.access, HEALTH_MANAGE_PERMISSION);
    if (!access.allowed) return fail(403, access.code, access.message);

    const prior = ledgerFrom(args.metadata)[args.proposalId];
    if (prior) return { ok: true, status: 200, already_applied: true, record: prior };
    if (isRejectedProposal(args.metadata, args.proposalId)) return fail(409, "declined", "This proposal was rejected, so it cannot be recorded.");

    const context = await loadRelatedRecordProposalForCase({ supabase: args.supabase, orgId: args.orgId, caseId: args.caseId, proposalId: args.proposalId });
    if (!context) return fail(404, "proposal_not_found", "That proposal is no longer on this case.");
    const intent = context.proposal.medical_consent_intent;
    if (context.proposal.execution_kind !== "medical_consent" || !intent) return fail(400, "not_a_consent", "This proposal is not a medical authorization.");
    if (!intent.signed || context.proposal.status !== "valid") return fail(409, "proposal_incomplete", "The authorization is not signed, so it cannot be recorded.");

    const childId = (context.expectedCustomerMemberId ?? "").trim();
    if (!childId) return fail(400, "missing_child_anchor", "This paperwork does not name a child, so the authorization has nowhere to go.");
    const { data: child } = await args.supabase.from("customer_members").select("id, customer_id").eq("org_id", args.orgId).eq("id", childId).maybeSingle();
    if (!child) return fail(404, "anchor_not_found", "The child this paperwork is about was not found.");
    if (context.expectedCustomerId && (child as { customer_id?: string }).customer_id !== context.expectedCustomerId) {
        return fail(403, "anchor_wrong_household", "The child does not belong to the family that submitted this paperwork.");
    }

    const submissionId = context.proposal.source_lineage.source_record_id;
    const [{ data: version }, { data: sub }, { data: docs }, { data: sigRows }] = await Promise.all([
        intent.form_definition_version_id
            ? args.supabase.from("form_definition_versions").select("schema_json").eq("org_id", args.orgId).eq("id", intent.form_definition_version_id).maybeSingle()
            : Promise.resolve({ data: null }),
        args.supabase.from("form_submissions").select("submitted_at").eq("org_id", args.orgId).eq("id", submissionId).maybeSingle(),
        args.supabase.from("form_submission_documents").select("document_id, role, created_at").eq("form_submission_id", submissionId).eq("role", "generated_pdf").order("created_at", { ascending: false }).limit(1),
        // The signature record carries who signed (`metadata.signer`, FI-02) and when they acknowledged.
        args.supabase.from("form_submission_signatures").select("field_id, typed_full_name, signer_acknowledged_at, metadata").eq("org_id", args.orgId).eq("form_submission_id", submissionId).in("field_id", intent.signature_field_ids),
    ]);
    const firstSig = ((sigRows ?? []) as { field_id: string; typed_full_name: string | null; signer_acknowledged_at: string | null; metadata: { signer?: { printed_name?: string | null; printed_name_matches_recipient?: boolean | null; channel?: string | null } } | null }[])
        .find((r) => r.field_id === intent.signature_field_ids[0]);
    // The grantor is who the signer said they are — never the link's recipient, never inferred.
    const grantedByName = intent.signed_by_name?.trim() || firstSig?.metadata?.signer?.printed_name?.trim() || firstSig?.typed_full_name?.trim() || null;
    if (!grantedByName) {
        return fail(409, "signer_unknown", "The signature does not say who signed, so the authorization cannot be recorded. Ask the family to sign again with their printed name.");
    }
    /*
     * SIGNER AUTHORITY. The only adult whose authority Alloy has established is the one the link
     * was sent to (validated at mint). A different adult who signed on that link is RECORDED as
     * themselves, but nothing has verified that they may authorize this child's medical care — so
     * their signature does not become a consent. Never substituted with the recipient either.
     */
    if (firstSig?.metadata?.signer?.printed_name_matches_recipient === false) {
        return fail(
            409,
            "signer_not_authorized",
            `This authorization was signed by ${grantedByName}, not the parent the paperwork was sent to. Alloy cannot confirm their authority to consent, so it was not recorded. Send the paperwork to that adult, or ask the parent to sign.`,
        );
    }
    const parsed = safeParseFormSchema((version as { schema_json?: unknown } | null)?.schema_json ?? null);
    const textSha = parsed.success ? consentTextSha256(parsed.data.fields, intent.text_field_ids) : null;
    const grantedAt = intent.signed_at || firstSig?.signer_acknowledged_at || (sub as { submitted_at?: string | null } | null)?.submitted_at || new Date().toISOString();

    let result: Awaited<ReturnType<typeof recordMedicalConsent>>;
    try {
        result = await recordMedicalConsent(args.supabase, {
            orgId: args.orgId,
            access: args.access,
            customerMemberId: childId,
            consentKind: intent.consent_kind,
            textFormDefinitionVersionId: intent.form_definition_version_id,
            textFieldIds: intent.text_field_ids,
            textSha256: textSha,
            grantedByName,
            grantedAt,
            sourceKind: "form_submission",
            sourceRef: `form_submission:${submissionId}`,
            evidenceDocumentId: ((docs ?? []) as { document_id: string }[])[0]?.document_id ?? null,
            actorUserId: args.userId,
        });
    } catch (e) {
        if (e instanceof MedicalConsentError) return fail(e.code === "invalid_input" ? 400 : 500, e.code, e.message);
        throw e;
    }

    const record: MedicalConsentCommitRecord = {
        outcome: result.alreadyRecorded ? "already_on_record" : "applied",
        proposal_id: args.proposalId,
        consent_id: result.consent.id,
        consent_kind: intent.consent_kind,
        customer_member_id: childId,
        superseded_consent_id: result.superseded?.id ?? null,
        actor_user_id: args.userId,
        committed_at: new Date().toISOString(),
    };
    const { error } = await args.supabase
        .from("processing_cases")
        .update({ metadata: { ...args.metadata, [MEDICAL_CONSENT_COMMIT_LEDGER_KEY]: { ...ledgerFrom(args.metadata), [args.proposalId]: record } } })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);
    if (error) throw new Error(error.message);
    return { ok: true, status: 200, already_applied: false, record };
}
