/**
 * A submission's answers about the RESPONDING ADULT's work and contact → one Processing proposal.
 *
 * Read (pure) from fields whose binding resolves to one of `PERSON_CONTACT_FACT_KEYS` on the adult
 * (`person.employer`, `guardian.guardian_work_phone`, …) — the canonical prefill map is the one
 * place that answers "which fact does this binding mean". Only the respondent's own top-level
 * answers count: a row of a repeatable group (another guardian, an emergency contact) is a
 * different person, owned by its relationship collection, and is never read here.
 *
 * The proposal names no person. The adult is the submission's own `person_id`, resolved at commit
 * — and refused there when the answers name a different adult (`executePersonContactFactsProposalCommit`).
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { canonicalPrefillPathForField } from "@/lib/forms/prefill/canonicalPrefillMap";
import type { RelatedRecordCollectionProposal } from "@/lib/intake/proposals/types";
import { stableRelatedRecordProposalId } from "@/lib/intake/proposals/normalize";
import {
    isPersonContactFactKey,
    normalizePersonContactFactValue,
    PERSON_CONTACT_FACT_LABELS,
    type PersonContactFactKey,
} from "@/lib/fields/personContactFacts/personContactFacts";

export const PERSON_CONTACT_FACTS_PROVIDER_REF = "person.contact_facts";
const INSTANCE_KEY = "respondent";

/** The respondent's own scalar fields: top level, and non-repeating groups (an address block). */
function respondentFields(fields: readonly FormField[], out: FormField[] = []): FormField[] {
    for (const f of fields) {
        if (f.type === "group") {
            const g = f as FormField & { repeat?: unknown; collection_binding?: unknown };
            if (!g.repeat && !g.collection_binding) respondentFields(f.fields, out);
            continue;
        }
        out.push(f);
    }
    return out;
}

export type RespondentContactFactReading = {
    facts: Partial<Record<PersonContactFactKey, string>>;
    /** Which field each fact came from. */
    source_field_ids: Partial<Record<PersonContactFactKey, string>>;
    /** The name the respondent gave for THEMSELVES (bound to the adult's first / last name). */
    stated_first_name: string | null;
    stated_last_name: string | null;
    /** An answer that is not one of the fact's own values (a preferred method we cannot read). */
    unrecognized: { key: PersonContactFactKey; field_id: string; value: string }[];
};

export function readRespondentContactFacts(schema: FormSchemaV1, payload: FormPayload | null | undefined): RespondentContactFactReading {
    const values = (payload?.values ?? {}) as Record<string, unknown>;
    const reading: RespondentContactFactReading = { facts: {}, source_field_ids: {}, stated_first_name: null, stated_last_name: null, unrecognized: [] };
    for (const field of respondentFields(schema.fields)) {
        const path = canonicalPrefillPathForField(field);
        if (!path?.startsWith("person.")) continue;
        const col = path.slice("person.".length);
        const raw = values[field.id];
        if (col === "first_name" || col === "last_name") {
            const v = typeof raw === "string" && raw.trim() ? raw.trim() : null;
            if (col === "first_name") reading.stated_first_name ??= v;
            else reading.stated_last_name ??= v;
            continue;
        }
        if (!isPersonContactFactKey(col) || reading.facts[col] !== undefined) continue;
        const value = normalizePersonContactFactValue(col, raw);
        if (value) {
            reading.facts[col] = value;
            reading.source_field_ids[col] = field.id;
        } else if (typeof raw === "string" && raw.trim()) {
            reading.unrecognized.push({ key: col, field_id: field.id, value: raw.trim() });
        }
    }
    return reading;
}

export function adaptPersonContactFactsToProposals(
    schema: FormSchemaV1,
    payload: FormPayload | null | undefined,
    ctx: { readonly formSubmissionId: string; readonly formDefinitionVersionId: string | null },
): RelatedRecordCollectionProposal[] {
    const reading = readRespondentContactFacts(schema, payload);
    const keys = Object.keys(reading.facts) as PersonContactFactKey[];
    if (keys.length === 0) return [];
    const diagnostics = reading.unrecognized.map((u) => ({
        code: "malformed_value" as const,
        message: `"${u.value}" is not a contact method Alloy records (email, text or phone call); it was not proposed.`,
        path: `values.${u.field_id}`,
    }));
    return [{
        collection_key: "person_contact_facts",
        collection_provider_ref: PERSON_CONTACT_FACTS_PROVIDER_REF,
        status: "valid",
        diagnostics: [],
        instances: [{
            proposal_id: stableRelatedRecordProposalId({ source_kind: "form_submission", source_record_id: ctx.formSubmissionId, collection_provider_ref: PERSON_CONTACT_FACTS_PROVIDER_REF, instance_key: INSTANCE_KEY }),
            collection_provider_ref: PERSON_CONTACT_FACTS_PROVIDER_REF,
            item_entity_type: "person",
            instance_key: INSTANCE_KEY,
            origin: "proposed_new_record",
            field_proposals: keys.map((k) => ({ provider_ref: `person.${k}`, submitted_value: reading.facts[k], label: PERSON_CONTACT_FACT_LABELS[k], source_fact_ref: reading.source_field_ids[k] })),
            execution_kind: "person_contact_facts",
            person_contact_facts_intent: {
                facts: reading.facts,
                source_field_ids: reading.source_field_ids,
                stated_first_name: reading.stated_first_name,
                stated_last_name: reading.stated_last_name,
            },
            source_lineage: {
                source_kind: "form_submission",
                source_record_id: ctx.formSubmissionId,
                source_path: "person_contact_facts[respondent]",
                source_metadata: { form_definition_version_id: ctx.formDefinitionVersionId ?? "" },
            },
            diagnostics,
            status: "valid",
        }],
    }];
}
