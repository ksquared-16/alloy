/**
 * POS — shared FP8a recommendation computation for a form submission.
 *
 * Extracted from `GET /api/admin/processing/cases/[caseId]/recommendation` so the
 * SAME match-first logic backs both the per-case detail endpoint and the batched
 * queue enrichment — no duplicated matching. READ-ONLY (writes nothing). Reuses
 * `extractBoundPerson` (meaning layer) + `resolveIntakeIdentity` (FP8a) + the
 * shared person lookups.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractBoundPerson } from "@/lib/pos/processingCase/approveHandoff";
import {
    resolveIntakeIdentity,
    type IntakeIdentityResolverDeps,
    type IntakeRecommendation,
} from "@/lib/forms/intake/resolveIntakeIdentity";
import {
    getPersonLabels,
    listPersonIdsByEmail,
    listPersonIdsByPhone,
} from "@/lib/forms/intake/intakeIdentityLookups";
import { readStoredOperationalIntent, type OperationalIntentKey } from "@/lib/forms/operationalIntentTemplates";
import { enrichCandidateDetail, type CandidateDetail } from "./candidateDetail";

/**
 * The record this submission was deliberately made against.
 *
 * A participant session launched at a known child carries stronger identity evidence than any
 * inference drawn from the answers, and it survives all the way onto the submission row. Reporting
 * it lets the operator surface stop asking a question that is already settled.
 */
export type RecommendationAuthoritativeSubject = {
    customerMemberId: string;
    customerId: string | null;
    displayName: string | null;
    dob: string | null;
};

export type FormSubmissionRecommendation =
    | {
          supported: true;
          recommendation: IntakeRecommendation;
          /**
           * Set when the submission names an existing child. Identity is NOT inferred in that case:
           * the operator surface must link to this record rather than offer to create another.
           */
          authoritativeSubject: RecommendationAuthoritativeSubject | null;
          /** Configured operational intent of the source form — drives operator-facing decision language. */
          intent: OperationalIntentKey | null;
          /** Identifying detail for each existing-match candidate (§3), keyed by candidate id. */
          candidateDetails: CandidateDetail[];
          source: { kind: "form_submission"; hasEmailBinding: boolean; mappedPersonValues: number };
      }
    | { supported: false; reason: string };

export async function recommendationFromFormSubmission(
    supabase: SupabaseClient,
    orgId: string,
    submissionId: string,
    /** Enrich candidates with identifying detail (§3) — only for the per-case view, not the queue. */
    options?: { enrichCandidates?: boolean }
): Promise<FormSubmissionRecommendation> {
    const { data: sub, error: subErr } = await supabase
        .from("form_submissions")
        .select("payload, form_definition_version_id, customer_member_id, customer_id")
        .eq("org_id", orgId)
        .eq("id", submissionId)
        .maybeSingle();
    if (subErr) throw new Error(subErr.message);
    const subRow = sub as {
        payload?: Record<string, unknown>;
        form_definition_version_id?: string | null;
        customer_member_id?: string | null;
        customer_id?: string | null;
    } | null;
    if (!subRow) return { supported: false, reason: "Submission not found." };

    const valuesRaw = subRow.payload?.values;
    const values =
        valuesRaw && typeof valuesRaw === "object" && !Array.isArray(valuesRaw)
            ? (valuesRaw as Record<string, unknown>)
            : {};

    let schemaJson: unknown = null;
    let formDefinitionId: string | null = null;
    if (subRow.form_definition_version_id) {
        const { data: ver, error: verErr } = await supabase
            .from("form_definition_versions")
            .select("schema_json, form_definition_id")
            .eq("org_id", orgId)
            .eq("id", subRow.form_definition_version_id)
            .maybeSingle();
        if (verErr) throw new Error(verErr.message);
        const verRow = ver as { schema_json?: unknown; form_definition_id?: string | null } | null;
        schemaJson = verRow?.schema_json ?? null;
        formDefinitionId = verRow?.form_definition_id ?? null;
    }

    // The form's configured operational intent (Purpose / Business Process) — decides the business
    // noun + action the operator sees ("enrollment lead" vs "waitlist opportunity" …).
    let intent: OperationalIntentKey | null = null;
    if (formDefinitionId) {
        const { data: form } = await supabase
            .from("form_definitions")
            .select("metadata")
            .eq("org_id", orgId)
            .eq("id", formDefinitionId)
            .maybeSingle();
        intent = readStoredOperationalIntent((form as { metadata?: Record<string, unknown> } | null)?.metadata);
    }

    const bound = extractBoundPerson(schemaJson, values);

    const deps: IntakeIdentityResolverDeps = {
        listPersonIdsByEmail: (o, e) => listPersonIdsByEmail(supabase, o, e),
        listPersonIdsByPhone: (o, p) => listPersonIdsByPhone(supabase, o, p),
        getPersonLabels: (o, ids) => getPersonLabels(supabase, o, ids),
    };

    const recommendation = await resolveIntakeIdentity(deps, {
        orgId,
        person: { email: bound.email, phone: bound.phone, firstName: bound.firstName, lastName: bound.lastName },
    });

    // Enrich each existing-match candidate with identifying context (§3). Usually 0–1 candidates.
    // Skipped on the queue path (compact summary only) to avoid per-row joins.
    const candidateDetails = options?.enrichCandidates
        ? await Promise.all(
              recommendation.candidates.map((c) => enrichCandidateDetail(supabase, orgId, { id: c.id, matchReason: c.matchReason }))
          )
        : [];

    const mappedPersonValues = [bound.email, bound.phone, bound.firstName, bound.lastName].filter(Boolean).length;
    /*
     * AUTHORITATIVE LAUNCH SUBJECT BEATS IDENTITY INFERENCE.
     *
     * The submission row already carries the child the session was launched against — stamped at
     * submit time from the session's own CRM snapshot. Reading it here is the whole fix: this
     * function used to select only the payload and version, so a packet deliberately launched for an
     * existing child arrived with no subject at all, the person spine found no email or phone to
     * match on, and the operator rail offered to CREATE that child again. The evidence was never
     * lost upstream; it was simply not read at the last step.
     *
     * The person spine is left exactly as it was. Identity of the PARENT is still resolved by
     * matching, and an untargeted public intake has no subject here and behaves unchanged.
     */
    const authoritativeSubject = subRow.customer_member_id
        ? await loadAuthoritativeSubject(supabase, orgId, subRow.customer_member_id, subRow.customer_id ?? null)
        : null;

    return {
        supported: true,
        recommendation,
        authoritativeSubject,
        intent,
        candidateDetails,
        source: { kind: "form_submission", hasEmailBinding: bound.hasEmailBinding, mappedPersonValues },
    };
}

/** Read the named child for display. Identity is already settled; this is only what to call it. */
async function loadAuthoritativeSubject(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    customerId: string | null,
): Promise<RecommendationAuthoritativeSubject | null> {
    const { data } = await supabase
        .from("customer_members")
        .select("id, customer_id, first_name, last_name, dob")
        .eq("org_id", orgId)
        .eq("id", customerMemberId)
        .maybeSingle();
    const row = data as { id: string; customer_id: string | null; first_name: string | null; last_name: string | null; dob: string | null } | null;
    // A subject we cannot read is not asserted — better no claim than a wrong one.
    if (!row) return null;
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    return {
        customerMemberId: row.id,
        customerId: row.customer_id ?? customerId,
        displayName: name || null,
        dob: row.dob ?? null,
    };
}
