/**
 * POS-FP16 / M5C — apply approved Configuration Discovery proposals.
 *
 * Consumes only APPROVED, valid proposals and applies them to the form/requirement draft, producing
 * a STRUCTURED result (never "success" because a UI flag changed). Pure + deterministic + idempotent:
 * an application ledger (applied proposal identities) makes re-apply a no-op (`already_applied`).
 *
 * Outcomes by disposition:
 *   • reuse_canonical_field → bind the matching draft form question(s) to the approved FormFieldSource
 *     (the canonical form binding that drives the published form + prefill). → applied
 *   • create_proposed_field → needs the canonical Field System to create the field first →
 *     requires_confirmation (the field is prepared, not silently created).
 *   • relationship_binding → project through the canonical collection provider (M5B) → applied
 *     (recorded on the section; person create/link happens at participant submission, not config time).
 *   • acknowledgement/signature/static/output → confirm the section disposition that already
 *     drives draftFormToFormSchemaV1's requirement/static/signature constructs → applied.
 *   • upload_requirement → attach a CLAUSE-LEVEL upload to its section → applied. This one is not a
 *     section disposition: the real packet asks for documents in the middle of prose ("Completed
 *     immunization records must be provided on or before the first day of care"), so the enclosing
 *     section is a consent page, not an upload page. Confirming a section disposition that was never
 *     `upload` applied nothing, and four discovered obligations published as zero participant asks.
 *   • form_only_response → no configuration to apply → skipped (it is a form question, not a record field).
 *
 * This module owns the pure decision + draft mutation. Live Field System field creation and the
 * relationship WRITE happen through their canonical services at the caller boundary; this planner
 * records what must happen and never fabricates a durable write.
 */

import type { StoredFormDraftPreview, DraftFormField, DraftClauseUpload } from "@/lib/pos/processingCase/formDraft/types";
import { CLASSIFICATION_KEY_LABELS } from "@/lib/pos/processingCase/classification/operatorCorrection";
import type { ProcessingClassificationKey } from "@/lib/pos/processingCase/classification/types";
import { canonicalCollectionProviderForRole } from "@/lib/fields/collection/canonicalCollectionProviderRegistry";
import { relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";
import { projectRelationshipCollection, applyProjectionToDraft } from "./projectRelationshipCollections";
import type { ConfigurationDiscoveryResult, ConfigurationProposal, ProposalDecisionState } from "./contracts";
import { proposalIdentity, semanticConceptIdentity } from "./reconciliation";

export type ApplicationOutcome =
    | "applied"
    | "skipped" // not approved, or nothing to apply (form-only response)
    | "already_applied" // idempotent no-op
    | "requires_confirmation" // needs an explicit follow-up (new field creation)
    | "conflicted" // two approved proposals target the same field
    | "failed";

export interface AppliedProposalResult {
    proposal_id: string;
    concept_label: string;
    disposition: ConfigurationProposal["disposition"];
    outcome: ApplicationOutcome;
    detail: string;
    /** For applied field bindings: the draft field ids bound. */
    bound_field_ids?: string[];
    /** For relationships: the collection provider projected through. */
    provider_ref?: string;
    /** For relationships: the canonical apply command + scope executed at Processing/submission time
     *  (relationshipExecutionAdapter → executeRelationshipAction) — config-apply binds the form; the
     *  Person create/link + role assignment happens when a response is committed. */
    relationship_apply?: { command_key: string; role_key: string; default_scope: string };
    /** For new fields: the prepared definition awaiting Field System creation. */
    prepared_field?: { entity_type: string; field_key: string; data_type: string };
    /** For relationships: the collection group the concept was projected into. */
    collection_group_id?: string;
    /** For relationships: flat questions replaced by the group (retained on the draft as evidence). */
    suppressed_field_ids?: string[];
}

export interface ApplicationResult {
    results: AppliedProposalResult[];
    counts: Record<ApplicationOutcome, number>;
    /** Applied proposal identities — the idempotency ledger, persisted with the draft. */
    ledger: string[];
}

const emptyCounts = (): Record<ApplicationOutcome, number> => ({
    applied: 0,
    skipped: 0,
    already_applied: 0,
    requires_confirmation: 0,
    conflicted: 0,
    failed: 0,
});

function conceptLabel(discovery: ConfigurationDiscoveryResult, candidateId: string): string {
    return discovery.concepts.find((c) => c.id === candidateId)?.label ?? candidateId;
}

/** Draft field ids whose label matches the concept's source labels — EXCLUDING output-copy sections
 *  (a classroom/office copy reproduces earlier questions; we never bind its duplicate fields). */
function draftFieldsForConcept(draft: StoredFormDraftPreview, discovery: ConfigurationDiscoveryResult, candidateId: string): DraftFormField[] {
    const concept = discovery.concepts.find((c) => c.id === candidateId);
    if (!concept) return [];
    const labels = new Set(concept.source.labels.map((l) => l.trim().toLowerCase()));
    // Field ids that live in an output/duplicate section (disposition static_reference or a "(… Copy)" title).
    const outputCopyFieldIds = new Set<string>();
    for (const s of draft.sections) {
        if (s.disposition === "static_reference" || /\bcopy\b/i.test(s.title)) for (const id of s.field_ids) outputCopyFieldIds.add(id);
    }
    return draft.fields.filter((f) => labels.has(f.label.trim().toLowerCase()) && !outputCopyFieldIds.has(f.id));
}

export interface ApplyInput {
    draft: StoredFormDraftPreview;
    discovery: ConfigurationDiscoveryResult;
    /** UI decisions keyed by proposal id; only `accepted` proposals apply. */
    decisions: Record<string, ProposalDecisionState>;
    /** Proposal ids the operator explicitly confirmed for NEW-field creation. */
    confirmedNewFields?: Set<string>;
    /** Prior application ledger (idempotency). */
    ledger?: string[];
}

export interface ApplyOutput {
    /** The draft with approved field bindings written onto it (deep-copied — input not mutated). */
    updatedDraft: StoredFormDraftPreview;
    result: ApplicationResult;
}

/**
 * Apply approved proposals. Pure: returns an updated draft + structured result. Idempotent via the
 * proposal-identity ledger. Field bindings are written onto the draft; new fields and relationship
 * writes are recorded for the caller's canonical-service execution.
 */
/**
 * Attach an approved clause-level document obligation to its section.
 *
 * Deliberately does NOT touch `section.disposition`. A consent page that happens to ask for a
 * record is still a consent page, and retyping it would drop every acknowledgement it carries.
 */
function attachClauseUpload(
    draft: StoredFormDraftPreview,
    proposal: ConfigurationProposal,
    concept: ConfigurationDiscoveryResult["concepts"][number] | undefined,
    identity: string,
):
    | { ok: true; duplicate: boolean; upload: DraftClauseUpload; sectionTitle: string }
    | { ok: false; reason: string } {
    if (!concept) return { ok: false, reason: "No concept for this proposal." };

    const section =
        draft.sections.find((s) => s.id === concept.source.section_key) ??
        draft.sections.find((s) => s.title === concept.source.section_title);
    if (!section) return { ok: false, reason: `No draft section matches "${concept.source.section_title}".` };

    const existing = section.clause_uploads ?? [];
    const already = existing.find((u) => u.obligation_id === identity || u.concept_id === concept.id);
    if (already) return { ok: true, duplicate: true, upload: already, sectionTitle: section.title };

    const documentType = proposal.target_document_classification;
    const clause = concept.label.trim();
    // Two clauses can classify to the SAME document type and still be different obligations — the
    // CIS asks for proof of immunization and, separately, for a physician's exemption letter, and
    // both are `immunization_record` because the vocabulary has no name for the second. Labelling
    // both "Immunization record" shows a family two identical asks for two different documents, so
    // the later one keeps its own wording. This disambiguates; it does not classify.
    const takenLabels = new Set(draft.sections.flatMap((sec) => (sec.clause_uploads ?? []).map((u) => u.label)));
    const upload: DraftClauseUpload = {
        // Derived from the CONCEPT id, so the same clause always produces the same control and a
        // re-apply cannot create a second participant ask.
        id: `upload_${concept.id.replace(/[^a-zA-Z0-9]+/g, "_")}`.slice(0, 72),
        obligation_id: identity,
        concept_id: concept.id,
        label: uniqueLabel(participantLabel(clause, documentType), clause, takenLabels),
        // The clause verbatim. A participant label is a summary; the sentence is the obligation.
        description: clause,
        // An obligation that is not required is not an obligation. The operator can relax it in
        // Packet Composition, which is where responsibility already lives.
        required: true,
        ...(documentType ? { document_type: documentType } : {}),
    };

    section.clause_uploads = [...existing, upload];
    return { ok: true, duplicate: false, upload, sectionTitle: section.title };
}

/**
 * What the family sees above the file picker.
 *
 * A whole sentence is the obligation, not a label — "Oregon law requires proof of immunization or
 * exemption signed prior to a child's attendance at school…" is not something to put above a button.
 * When discovery recognised the document type, its canonical name IS the label; otherwise the clause
 * is trimmed and the full sentence stays in the description. No new classification happens here.
 */
function uniqueLabel(preferred: string, clause: string, taken: ReadonlySet<string>): string {
    if (!taken.has(preferred)) return preferred;
    const fromClause = participantLabel(clause, undefined);
    return taken.has(fromClause) ? `${preferred} (${fromClause})`.slice(0, 96) : fromClause;
}

function participantLabel(clause: string, documentType: string | undefined): string {
    if (documentType && documentType in CLASSIFICATION_KEY_LABELS) {
        return CLASSIFICATION_KEY_LABELS[documentType as ProcessingClassificationKey];
    }
    const firstSentence = clause.split(/(?<=[.:?])\s/)[0] ?? clause;
    const trimmed = firstSentence.trim().replace(/\s+/g, " ");
    return trimmed.length <= 72 ? trimmed : `${trimmed.slice(0, 69).trimEnd()}…`;
}

export function applyDiscovery(input: ApplyInput): ApplyOutput {
    const draft: StoredFormDraftPreview = JSON.parse(JSON.stringify(input.draft));
    const fieldById = new Map(draft.fields.map((f) => [f.id, f]));
    const results: AppliedProposalResult[] = [];
    const counts = emptyCounts();
    const ledger = new Set(input.ledger ?? []);
    const boundTargets = new Map<string, string>(); // "entity.field" → proposal_id (conflict detection)

    for (const p of input.discovery.proposals) {
        const state = input.decisions[p.id] ?? p.decision_state;
        const label = conceptLabel(input.discovery, p.candidate_id);
        const concept = input.discovery.concepts.find((c) => c.id === p.candidate_id);
        const identity = concept ? proposalIdentity(p, semanticConceptIdentity(concept)) : p.id;

        const record = (outcome: ApplicationOutcome, detail: string, extra: Partial<AppliedProposalResult> = {}) => {
            counts[outcome]++;
            results.push({ proposal_id: p.id, concept_label: label, disposition: p.disposition, outcome, detail, ...extra });
        };

        if (state !== "accepted") {
            record("skipped", state === "ignored" ? "Ignored by the operator." : "Not accepted.");
            continue;
        }
        if (ledger.has(identity)) {
            record("already_applied", "Already applied — idempotent no-op.");
            continue;
        }

        switch (p.disposition) {
            case "form_only_response":
                record("skipped", "Form response — no durable configuration to apply.");
                break;

            case "reuse_canonical_field":
            case "reuse_existing_field": {
                const target = p.target_field_source;
                if (!target) {
                    record("failed", "No target field on an approved field proposal.");
                    break;
                }
                const key = `${target.entity_type}.${target.field_key}`;
                const prior = boundTargets.get(key);
                if (prior && prior !== p.id) {
                    record("conflicted", `Another approved proposal already binds ${key}.`);
                    break;
                }
                const fields = draftFieldsForConcept(draft, input.discovery, p.candidate_id);
                if (fields.length === 0) {
                    record("failed", `No form question matched "${label}" to bind.`);
                    break;
                }
                for (const f of fields) {
                    const live = fieldById.get(f.id);
                    if (live) live.field_source = { entity_type: target.entity_type, field_key: target.field_key, ...(target.shared_value_key ? { shared_value_key: target.shared_value_key } : {}) };
                }
                boundTargets.set(key, p.id);
                ledger.add(identity);
                record("applied", `Bound ${fields.length} form question(s) to ${key}.`, { bound_field_ids: fields.map((f) => f.id) });
                break;
            }

            case "held_for_canonical_owner": {
                // Belt and braces. The proposal carries no prepared field, so this cannot create
                // anything — but an operator who accepted it deserves to be told why nothing happened.
                const owner = p.ownership_hold?.owner;
                record(
                    "skipped",
                    owner
                        ? `"${label}" is collected on the form. ${owner} owns the durable record, so no field is created here.`
                        : `"${label}" is collected on the form. No canonical owner exists for it yet, so no field is created here.`,
                );
                break;
            }

            case "create_proposed_field": {
                if (!input.confirmedNewFields?.has(p.id)) {
                    record("requires_confirmation", `New field "${label}" must be explicitly confirmed before the Field System creates it.`);
                    break;
                }
                if (!p.proposed_field) {
                    record("failed", "No prepared field definition.");
                    break;
                }
                // Confirmed: record the prepared field for canonical Field System creation at the caller.
                ledger.add(identity);
                record("requires_confirmation", `Prepared "${label}" for creation via the Field System.`, {
                    prepared_field: { entity_type: p.proposed_field.entity_type, field_key: p.proposed_field.suggested_field_key, data_type: p.proposed_field.data_type },
                });
                break;
            }

            case "relationship_binding": {
                const role = p.target_relationship_role ?? "";
                const provider = role ? canonicalCollectionProviderForRole(role) : undefined;
                const def = role ? relationshipDefinitionForRole(role) : undefined;
                if (!provider || !def) {
                    record("failed", `No configured relationship definition/provider for role ${role}.`);
                    break;
                }
                // PROJECT the concept into a real collection-bound group. Recording the resolution is
                // not enough: without this the generated form ships flat questions, carries no
                // collection binding, and the canonical write path is unreachable from a form.
                const projection = projectRelationshipCollection({
                    draft,
                    proposal: p,
                    concept,
                    proposalIdentity: identity,
                });
                if (!projection) {
                    record("failed", `Could not project ${label} into a collection group.`);
                    break;
                }
                // Idempotent: stable group id, so a retry replaces rather than duplicates.
                applyProjectionToDraft(draft, projection);
                ledger.add(identity);
                record(
                    "applied",
                    `Projected ${label} into the ${provider.label} collection (role ${role}, ${projection.group.nested_fields.length} nested field(s), ${projection.suppressedFieldIds.length} source question(s) replaced); at submission it applies via "${def.apply_command_key}".`,
                    {
                        provider_ref: provider.refKey,
                        relationship_apply: { command_key: def.apply_command_key, role_key: def.operational_role_key, default_scope: def.scopes[0] ?? "this_child" },
                        collection_group_id: projection.group.id,
                        suppressed_field_ids: projection.suppressedFieldIds,
                    },
                );
                break;
            }

            case "upload_requirement": {
                const attached = attachClauseUpload(draft, p, concept, identity);
                if (!attached.ok) {
                    record("failed", attached.reason);
                    break;
                }
                if (attached.duplicate) {
                    // Two artifacts correlated to one obligation must produce ONE participant ask.
                    ledger.add(identity);
                    record("already_applied", `"${label}" is already an upload requirement on this form.`);
                    break;
                }
                ledger.add(identity);
                record("applied", `Added an upload requirement for "${attached.upload.label}" to ${attached.sectionTitle}.`, {
                    bound_field_ids: [attached.upload.id],
                });
                break;
            }

            case "financial_payment": {
                // Deliberately terminal, and deliberately NOT `requires_confirmation`. There is
                // nothing to confirm: the obligation is held for an owner Alloy has not built. The
                // ledger says so in words, because a reader who finds no requirement and no reason
                // cannot tell a deferral from a bug.
                ledger.add(identity);
                record(
                    "skipped",
                    p.deferred_capability
                        ? `Held for ${p.deferred_capability.owner_label} — ${p.deferred_capability.obligation}. No requirement is configured here, and nothing was dropped.`
                        : "Payment detail — owned by Financials. Nothing durable is configured here.",
                );
                break;
            }

            case "acknowledgement":
            case "signature_requirement":
            case "static_content":
            case "output_binding": {
                ledger.add(identity);
                record("applied", `Confirmed the ${p.disposition.replace(/_/g, " ")} disposition — carried into the form/requirement projection.`);
                break;
            }

            default:
                record("requires_confirmation", "Needs manual classification.");
        }
    }

    return {
        updatedDraft: draft,
        result: { results, counts, ledger: [...ledger] },
    };
}
