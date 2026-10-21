/**
 * A submission's declared medical capture → Processing proposals (pure, read-only).
 *
 *   immunization grid → one IMMUNIZATION proposal per vaccine with at least one dose date (or a
 *                       declared history such as "had chickenpox"); the doses are the family's
 *                       REPORT — committed as reported, never as verified.
 *   medical consent   → one CONSENT proposal when every declared signature is present.
 *
 * Proposal ids are stable (`stableRelatedRecordProposalId`), so a re-read, a retry and the review
 * surface all name the same proposal, and the existing ledger / reject machinery applies unchanged.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import type { HealthCaptureDeclaration } from "@/lib/health/healthCaptureDeclaration";
import { immunizationVaccineLabel } from "@/lib/health/immunizationVaccines";
import type { RelatedRecordCollectionProposal, RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";
import { stableRelatedRecordProposalId } from "@/lib/intake/proposals/normalize";

export const IMMUNIZATION_PROVIDER_REF = "health.immunizations";
export const MEDICAL_CONSENT_PROVIDER_REF = "medical.consents";

const SOURCE_KIND = "form_submission";

function findField(fields: readonly FormField[], id: string): FormField | null {
    for (const f of fields) {
        if (f.id === id) return f;
        if (f.type === "group") {
            const hit = findField(f.fields, id);
            if (hit) return hit;
        }
    }
    return null;
}

/** A date the family wrote, as ISO yyyy-mm-dd, or null. Never a guessed date. */
export function reportedDoseDate(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const v = value.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
    if (us) return `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
    return null;
}

export function adaptHealthCaptureToProposals(
    schema: FormSchemaV1,
    payload: FormPayload | null | undefined,
    declaration: HealthCaptureDeclaration,
    ctx: { readonly formSubmissionId: string; readonly formDefinitionVersionId: string | null },
): RelatedRecordCollectionProposal[] {
    const values = (payload?.values ?? {}) as Record<string, unknown>;
    const collections: RelatedRecordCollectionProposal[] = [];
    const lineage = (instanceKey: string, groupId: string) => ({
        source_kind: SOURCE_KIND,
        source_record_id: ctx.formSubmissionId,
        source_path: `health_capture.${groupId}[${instanceKey}]`,
        source_metadata: { schema_group_id: groupId, form_definition_version_id: ctx.formDefinitionVersionId ?? "" },
    });

    // ── immunizations ────────────────────────────────────────────────────────────────────────
    const grid = declaration.immunization_grid;
    if (grid) {
        const instances: RelatedRecordInstanceProposal[] = [];
        const keys = [...new Set([...grid.vaccines.map((v) => v.vaccine_key), ...grid.history.map((h) => h.vaccine_key)])];
        for (const key of keys) {
            const vaccine = grid.vaccines.find((v) => v.vaccine_key === key);
            const doses = (vaccine?.dose_field_ids ?? [])
                .map((fieldId, i) => ({ fieldId, dose_number: i + 1, administered_on: reportedDoseDate(values[fieldId]) }))
                .filter((d) => d.administered_on);
            const history = grid.history.find((h) => h.vaccine_key === key && (values[h.field_id] === true || values[h.field_id] === "yes"));
            if (doses.length === 0 && !history) continue;
            const label = immunizationVaccineLabel(key);
            instances.push({
                proposal_id: stableRelatedRecordProposalId({ source_kind: SOURCE_KIND, source_record_id: ctx.formSubmissionId, collection_provider_ref: IMMUNIZATION_PROVIDER_REF, instance_key: key }),
                collection_provider_ref: IMMUNIZATION_PROVIDER_REF,
                item_entity_type: "person_health_fact",
                instance_key: key,
                origin: "proposed_new_record",
                field_proposals: [
                    ...doses.map((d) => ({ provider_ref: `immunization.${key}.dose_${d.dose_number}`, submitted_value: d.administered_on, source_fact_ref: d.fieldId, label: `${label} — dose ${d.dose_number}` })),
                    ...(history ? [{ provider_ref: `immunization.${key}.history`, submitted_value: history.state, source_fact_ref: history.field_id, label: `${label} — history` }] : []),
                ],
                execution_kind: "health_fact",
                health_fact_intent: {
                    fact_kind: "immunization",
                    payload: {
                        vaccine_key: key,
                        doses: doses.map((d) => ({ administered_on: d.administered_on, dose_number: d.dose_number })),
                        ...(history ? { history_state: history.state } : {}),
                        // What the family wrote is a report; verification needs evidence (Documents).
                        reported: true,
                    },
                    missing_required: [],
                    unresolved_member_field_ids: [],
                    unrecognized_severity: null,
                },
                source_lineage: lineage(key, "immunization_grid"),
                diagnostics: [],
                status: "valid",
            });
        }
        if (instances.length > 0) {
            collections.push({ collection_key: "immunization_grid", collection_provider_ref: IMMUNIZATION_PROVIDER_REF, instances, status: "valid", diagnostics: [] });
        }
    }

    // ── medical consent ──────────────────────────────────────────────────────────────────────
    const consent = declaration.medical_consent;
    if (consent) {
        const sigs = consent.signature_field_ids.map((id) => ({ id, sig: payload?.signatures?.[id] ?? null, field: findField(schema.fields, id) }));
        // A conditional second signature that is not shown is not required (e.g. "a second guardian
        // will also sign" unchecked); a shown, unsigned one leaves the consent unsigned.
        const required = sigs.filter((s, i) => i === 0 || s.sig);
        const signed = required.length > 0 && required.every((s) => Boolean(s.sig));
        const first = sigs[0]?.sig ?? null;
        // WHO signed is only what the signer typed — the typed signature, or the printed name beside
        // a drawn mark (FI-02). Never the link's recipient. A consent with no named signer is not
        // recordable: the grantor of a medical authorization is part of what was authorized.
        const signerName = first?.typed_full_name?.trim() || first?.signer_printed_name?.trim() || null;
        const recordable = signed && signerName !== null;
        const key = consent.consent_kind;
        collections.push({
            collection_key: "medical_consent",
            collection_provider_ref: MEDICAL_CONSENT_PROVIDER_REF,
            status: recordable ? "valid" : "incomplete",
            diagnostics: [],
            instances: [{
                proposal_id: stableRelatedRecordProposalId({ source_kind: SOURCE_KIND, source_record_id: ctx.formSubmissionId, collection_provider_ref: MEDICAL_CONSENT_PROVIDER_REF, instance_key: key }),
                collection_provider_ref: MEDICAL_CONSENT_PROVIDER_REF,
                item_entity_type: "person_medical_consent",
                instance_key: key,
                origin: "proposed_new_record",
                field_proposals: [
                    { provider_ref: "consent.kind", submitted_value: key === "medical_records_release" ? "Medical records release" : "Emergency medical treatment", label: "Authorization" },
                    { provider_ref: "consent.signed_by", submitted_value: signerName, label: "Signed by" },
                ],
                execution_kind: "medical_consent",
                medical_consent_intent: {
                    consent_kind: key,
                    form_definition_version_id: ctx.formDefinitionVersionId,
                    text_field_ids: [...consent.text_field_ids],
                    signature_field_ids: [...consent.signature_field_ids],
                    signed_by_name: signerName,
                    signed_at: first?.acknowledged_at ?? null,
                    signed,
                },
                source_lineage: lineage(key, "medical_consent"),
                diagnostics: !signed
                    ? [{ code: "missing_field_binding", message: "The authorization is not signed, so it cannot be recorded." }]
                    : !signerName
                      ? [{ code: "missing_field_binding", message: "The signature does not say who signed, so the authorization cannot be recorded. Ask the family to sign again with their printed name." }]
                      : [],
                status: recordable ? "valid" : "incomplete",
            }],
        });
    }
    return collections;
}
