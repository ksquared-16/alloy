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

export type FormSubmissionRecommendation =
    | {
          supported: true;
          recommendation: IntakeRecommendation;
          /** Configured operational intent of the source form — drives operator-facing decision language. */
          intent: OperationalIntentKey | null;
          source: { kind: "form_submission"; hasEmailBinding: boolean; mappedPersonValues: number };
      }
    | { supported: false; reason: string };

export async function recommendationFromFormSubmission(
    supabase: SupabaseClient,
    orgId: string,
    submissionId: string
): Promise<FormSubmissionRecommendation> {
    const { data: sub, error: subErr } = await supabase
        .from("form_submissions")
        .select("payload, form_definition_version_id")
        .eq("org_id", orgId)
        .eq("id", submissionId)
        .maybeSingle();
    if (subErr) throw new Error(subErr.message);
    const subRow = sub as { payload?: Record<string, unknown>; form_definition_version_id?: string | null } | null;
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

    const mappedPersonValues = [bound.email, bound.phone, bound.firstName, bound.lastName].filter(Boolean).length;
    return {
        supported: true,
        recommendation,
        intent,
        source: { kind: "form_submission", hasEmailBinding: bound.hasEmailBinding, mappedPersonValues },
    };
}
