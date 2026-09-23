/**
 * The pure ask-once collapse: pinned Form schemas x session values x confirmations -> unique needs.
 *
 * Separated from I/O so every Slice 2.4 proof is a function of explicit inputs — "15 occurrences
 * become one need" is then a statement about the RULE, not about a query.
 *
 * @see enrollmentNeedIdentity.ts — why identity is scope + subject + canonical key
 * @see enrollmentSessionConfirmations.ts — D-99, and why confirmation is bound to the value
 */

import { fieldIsInsideCollectionBoundGroup } from "@/lib/forms/prefill/formsCollectionPrefill";
import { formFieldAsksParticipant } from "@/lib/forms/formFieldCollectsValue";
import {
    declineSatisfiesAbsence,
    type EnrollmentNeedDeclineMap,
} from "@/lib/enrollment/informationNeeds/enrollmentSessionDeclines";
import {
    participantFacingLabel,
    sourceFieldNamesByFieldId,
    type SourceFieldMapping,
} from "@/lib/enrollment/participantRuntime/sourceLabelIdentity";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";
import {
    partyCollectionChildFieldIds,
    partyCollectionGroups,
    projectPartyCollection,
    readPartyEntries,
    mergeKnownEntries,
    partyCollectionComplete,
    partyCollectionValid,
    readPartySettled,
    partyCollectionStateKey,
    type ParticipantPartyEntry,
} from "@/lib/enrollment/informationNeeds/participantPartyCollection";
import { evaluateFieldVisibility } from "@/lib/forms/validateSubmission";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import {
    resolveEnrollmentNeedIdentity,
    type EnrollmentNeedIdentity,
} from "@/lib/enrollment/informationNeeds/enrollmentNeedIdentity";
import { inferUnboundDestinationEntity } from "@/lib/enrollment/informationNeeds/unboundDestinationSubject";
import { artifactPartySlots, broadcastingPartyFieldIds } from "@/lib/enrollment/participantRuntime/artifactPartySlots";
import {
    confirmationSatisfiesCurrentValue,
    type EnrollmentNeedConfirmationMap,
} from "@/lib/enrollment/informationNeeds/enrollmentSessionConfirmations";
import type {
    EnrollmentInformationNeed,
    EnrollmentNeedOccurrence,
    EnrollmentNeedState,
    EnrollmentNeedValueSource,
} from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

/** One realized, D-94-pinned Form the participant must complete for this objective. */
export type PinnedRequirementForm = {
    readonly requirement_id: string;
    readonly form_definition_id: string;
    readonly form_definition_version_id: string;
    readonly session_item_id: string;
    /** `schema_json` of THAT version. Never the definition's latest. */
    readonly schema: FormSchemaV1;
    /**
     * `pdf_mapping_json` of THAT version, when the artifact is source-fidelity.
     *
     * Carried so the projection can tell an authored question from the source document's own name
     * for a box. Absent for a composed document, where every label is authored by definition.
     */
    readonly pdfMapping?: unknown;
};

export type ProjectNeedsInput = {
    readonly forms: readonly PinnedRequirementForm[];
    /** The Enrollment journey's subject — `process_instances.subject_id`. */
    readonly subjectId: string | null;
    /** `form_packet_sessions.shared_values`. */
    readonly sharedValues: Readonly<Record<string, unknown>>;
    /** Canonical record prefill, by the same shared key. Lower precedence than session values. */
    readonly canonicalValues?: Readonly<Record<string, unknown>>;
    /**
     * People Alloy already knows for a party collection, keyed by the collection's group field id.
     *
     * Resolved by the CALLER from the canonical relationship read model, never matched here — a
     * Forms-local person matcher is exactly the second identity system this must not become. Absent
     * means "nothing known", which fails closed: the family is asked rather than shown a guess.
     */
    readonly knownPartyEntries?: Readonly<Record<string, readonly ParticipantPartyEntry[]>>;
    readonly confirmations: EnrollmentNeedConfirmationMap;
    /**
     * Needs the participant was asked about and chose to leave blank.
     *
     * Kept apart from `sharedValues` for the reason the decline store states: settlement is not a
     * value, and storing the shortcut's label as one is what put "Nothing to add" in a middle-name
     * box on a state health form.
     */
    readonly declines?: EnrollmentNeedDeclineMap;
    /**
     * How each settled value came to be — the confirmation/collection distinction.
     *
     * Passed in beside the confirmations and declines because it lives in the same session
     * metadata and answers a question neither of them can: a D-99 entry proves a value was
     * evidenced, never that it pre-existed the ask.
     */
    readonly provenance?: import("@/lib/enrollment/informationNeeds/enrollmentValueProvenance").EnrollmentValueProvenanceMap;
    /**
     * The tenant's canonical person-role vocabulary (`customer_person_role_types`).
     *
     * Supplied so party-slot destinations can be recognised and excluded from the conversation.
     * Absent, nothing is excluded and the historical behaviour stands.
     */
    readonly partyRoles?: readonly string[];
    /**
     * Which canonical keys require participant confirmation for this objective.
     *
     * NARROW BY DESIGN. No repository-wide assurance framework exists, and inventing one would be a
     * far larger claim than this slice earns. The caller states the policy explicitly; absent a
     * policy, a known value is simply `known`.
     */
    readonly requiresConfirmation?: ReadonlySet<string>;
};

function usableValue(raw: unknown): boolean {
    if (raw === null || raw === undefined) return false;
    if (typeof raw === "string") return raw.trim() !== "";
    return true;
}

type Accumulator = {
    identity: EnrollmentNeedIdentity;
    occurrences: EnrollmentNeedOccurrence[];
    requirementIds: Set<string>;
};

/**
 * Collapse every scalar control across every pinned Form into unique needs.
 *
 * Order is first-appearance across `forms` in input order, matching `buildPacketFieldPlan`, so the
 * output is a pure function of the input and never of the participant's progress.
 */
export function projectEnrollmentInformationNeeds(
    input: ProjectNeedsInput,
): EnrollmentInformationNeed[] {
    const byKey = new Map<string, Accumulator>();

    for (const form of input.forms) {
        // Per artifact: which of its destinations are waiting for a person rather than an answer.
        /*
         * Always on. Role detection is owned by `relationshipDefinitions.ts`, which needs no tenant
         * list — the tenant vocabulary is only a narrow fallback for roles the relationship model
         * does not define. Gating recognition on that list meant a tenant with no configured
         * `customer_person_role_types` rows kept broadcasting one phone number across six people.
         */
        const partySlots = broadcastingPartyFieldIds(form.schema, input.partyRoles ?? []);
        /*
         * WHOSE question each destination is — read from the same artifact, by the same owner.
         *
         * `broadcastingPartyFieldIds` above answers "would asking this write one answer into
         * several people's boxes". This answers "who is this box about", which is a different
         * question with the same evidence: role, ordinal and a person attribute. A destination can
         * be a party's without being a broadcast risk — "Parent/Guardian #2 Name" is nobody else's
         * and is still asked — and those are precisely the ones that arrived with no subject.
         *
         * Subject only. It is handed to the identity resolver, which keeps it out of `key`,
         * `canonical_key` and `shared_value_key`.
         */
        const partyByFieldId = new Map(
            artifactPartySlots(form.schema, input.partyRoles ?? []).map((slot) => [
                slot.field_id,
                { role: slot.role, ordinal: slot.ordinal, canonical_role: slot.canonical_role },
            ]),
        );
        // The authored section each destination sits in — read once per Form, not per field.
        const sectionByFieldId = new Map<string, string>();
        for (const sec of ((form.schema as { sections?: { title?: string; field_ids?: string[] }[] }).sections ?? [])) {
            const title = (sec.title ?? "").trim();
            if (!title) continue;
            for (const id of sec.field_ids ?? []) if (!sectionByFieldId.has(id)) sectionByFieldId.set(id, title);
        }

        const sourceFieldNames = sourceFieldNamesByFieldId(form.pdfMapping as SourceFieldMapping);

        /*
         * A COLLECTION OF PEOPLE IS ONE OBLIGATION, NOT N LOOSE QUESTIONS.
         *
         * `walkScalarFormFields` descends into every group and visits each child alone, so a
         * repeated emergency-contact collection arrived as "Full name?", "Phone?", "Relationship to
         * the child?" — asked once each, with no repetition and nothing to say the three answers
         * belong to one person. The children of a party collection are therefore skipped here and
         * the collection is projected once, below, carrying its own declaration.
         *
         * Only PARTY collections are excluded. An ordinary repeating group still flattens exactly
         * as it did, because nothing has declared what its rows mean.
         */
        const partyChildIds = partyCollectionChildFieldIds(form.schema);
        walkScalarFormFields(form.schema, (field) => {
            if (partyChildIds.has(field.id)) return;
            // Not a participant need unless the participant is the one who supplies it. Display-only
            // prose was the first case — without it a handbook paragraph became an artifact-specific
            // item called "Page 3" and counted against the parent. Placed-not-asked destinations and
            // derived values are the same mistake at scale: 100 boxes the family never fills and 7
            // the platform writes itself were being counted as work they had to do.
            if (!formFieldAsksParticipant(field)) return;

            /*
             * A CONVERSATION CANNOT ASK A QUESTION IT HAS NO WORDS FOR.
             *
             * An imported control's label is often the source PDF's internal widget name, so the
             * runtime asked a parent "Var History?" and "Prov Sp?" — and, having no words, could
             * not rephrase, could not explain, and could not accept anything but a guess. Suppressing
             * the label at the review surface (`participant_label`) fixed the printing and left the
             * conversation asking it out loud.
             *
             * These destinations belong to the artifact, and the parent meets them ON the document,
             * where the school's own sentence sits beside the box. None of the 72 across this packet
             * is required, so nothing is blocked by declining to ask about them in words — and a
             * required one would be an authoring defect worth seeing rather than papering over.
             */
            if (participantFacingLabel(field.label, sourceFieldNames[field.id]) == null) return;

            /*
             * A DOCUMENT IS BROUGHT, NOT TYPED.
             *
             * An upload destination holds a document id — `validateSubmission` requires exactly
             * that — so a conversation asking "What is your Immunization record?" can only collect
             * words that the submission will then refuse. All three certified upload obligations
             * were projected this way.
             *
             * They are not dropped: they are participant WORK, presented at the artifact that asks
             * for them, where the parent attaches a file and the answer becomes the id of a
             * canonical Document. The conversation collects values; this is not one.
             */
            if (field.type === "file_ref") return;

            /*
             * A SHARED PARTY DESTINATION IS NOT A QUESTION.
             *
             * "Parent/Guardian #2 Phone Number", "Emergency Contact #3 Phone Number", the
             * physician's and the dentist's all carry `entity_type: person, field_key: phone`, so
             * the ask-once layer collapsed six different people's phones into ONE canonical need —
             * and one answer would have printed into all six boxes. These are filled by projecting
             * a party into them; they never join dedupe and are never asked about directly.
             */
            if (partySlots.has(field.id)) return;

            const identity = resolveEnrollmentNeedIdentity({
                field,
                subjectId: input.subjectId,
                formDefinitionId: form.form_definition_id,
                insideCollectionBoundGroup: fieldIsInsideCollectionBoundGroup(form.schema, field.id),
                // The packet's own layout, for grammar and ordering only — never for identity.
                inferredEntityType: inferUnboundDestinationEntity(form.schema, field.id),
                // The person this box is about, when the artifact names one. Subject, not identity.
                partySlot: partyByFieldId.get(field.id) ?? null,
                formDefinitionVersionId: form.form_definition_version_id,
                sessionItemId: form.session_item_id,
            });

            /*
             * A STATEMENT IS ACCEPTED, NOT ANSWERED.
             *
             * Same shape of rule as the upload return above, and for the same reason. An
             * acknowledgement says something about the document — "I acknowledge the information
             * above is accurate" — so asking it in the conversation asks a parent to attest to
             * information that does not exist yet. Kelly met it as a bare Yes / No immediately
             * after confirming a birthday, phrased "What is I acknowledge the information above is
             * accurate.?" by the generic prompt builder, with no meaning attached to No.
             *
             * It is not dropped: `compileParticipantArtifact` already classifies this exact field
             * as an `acknowledgment`, and the sign step already renders it from the Form's own
             * schema beside the document it refers to. This return removes the DUPLICATE, leaving
             * the occurrence where the statement is.
             */
            if (identity.collection_mode === "acknowledgement") return;

            const occurrence: EnrollmentNeedOccurrence = {
                requirement_id: form.requirement_id,
                form_definition_id: form.form_definition_id,
                form_definition_version_id: form.form_definition_version_id,
                session_item_id: form.session_item_id,
                form_field_id: field.id,
                label: field.label,
                required: field.required === true,
                section_title: sectionByFieldId.get(field.id) ?? null,
                field_type: conversationalControlType(field),
                options: readFieldOptions(field),
            };

            const existing = byKey.get(identity.key);
            if (existing) {
                existing.occurrences.push(occurrence);
                existing.requirementIds.add(form.requirement_id);
                return;
            }
            byKey.set(identity.key, {
                identity,
                occurrences: [occurrence],
                requirementIds: new Set([form.requirement_id]),
            });
        });
    }

    /*
     * CONDITIONAL DESTINATIONS, decided by the Form and only by the Form.
     *
     * Runs after the whole walk because a condition names another FIELD, and that field's value is
     * only known once every destination has been collapsed onto its need.
     */
    pruneInvisibleOccurrences(byKey, input);

    const scalar = [...byKey.values()].map((acc) => finalize(acc, input));
    return [...scalar, ...projectPartyCollectionNeeds(input)];
}

/**
 * The authored choices for a closed field, normalized to strings.
 *
 * Shape-tolerant on purpose: option lists appear as bare strings and as `{value,label}` rows across
 * the form library's history, and a participant control that silently rendered nothing for the older
 * shape would be worse than the text box it replaced.
 */
function readFieldOptions(field: unknown): readonly string[] {
    /*
     * `static_options` is where a realized Form actually keeps its choices.
     *
     * `draftFormToFormSchemaV1` publishes an authored choice list as `static_options` — the schema's
     * own inline-choice construct — and this reader only ever looked at `options`. So every select
     * need reached the participant with no choices at all, and any answer they gave was refused as
     * "That is not one of the available choices". A question with no visible answers that rejects
     * every answer is a loop with no way out; it is how a parent gets stuck.
     */
    const f = field as { options?: unknown; static_options?: unknown };
    const raw = Array.isArray(f?.options) && f.options.length ? f.options : f?.static_options;
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item === "string" && item.trim()) out.push(item.trim());
        else if (item && typeof item === "object") {
            const v = (item as { value?: unknown; label?: unknown }).value ?? (item as { label?: unknown }).label;
            if (typeof v === "string" && v.trim()) out.push(v.trim());
        }
    }
    return out;
}

/**
 * The authored control type as the CONVERSATION needs to hear it.
 *
 * `text` with `multiline` is ONE control in the Form schema and TWO in a conversation: a one-line
 * answer and a paragraph. `valueControlForTurn` has always understood `long_text`; the projection
 * simply never said it, so every narrative question in a real packet — "Developmental history",
 * "How is your child comforted?" — reached the parent as a single-line box.
 *
 * Nothing else is translated. The authored type is the operator's decision and this only carries a
 * flag that already sits beside it.
 */
function conversationalControlType(field: FormField): string {
    if (field.type === "text" && (field as { multiline?: boolean }).multiline === true) return "long_text";
    return field.type;
}

/** Does any destination in this schema declare a condition at all? Almost none do. */
function schemaDeclaresVisibility(schema: FormSchemaV1): boolean {
    let found = false;
    const walk = (fields: readonly FormField[]) => {
        for (const f of fields) {
            if (found) return;
            if (f.visibility) { found = true; return; }
            if (f.type === "group") walk(f.fields);
        }
    };
    walk(schema.fields);
    return found;
}

/**
 * The value this need currently holds — session first, canonical record second.
 *
 * Extracted from `finalize` because the conditional pass below needs exactly the same answer BEFORE
 * any need is finalized, and two readings of "what does this field hold" that could drift apart is
 * how a follow-up gets asked after a parent has already said no.
 */
function resolveNeedValue(
    identity: EnrollmentNeedIdentity,
    input: ProjectNeedsInput,
): { readonly value: unknown; readonly source: EnrollmentNeedValueSource } {
    if (!identity.session_value_key) return { value: null, source: "none" };
    // Precedence mirrors `mergeFormPrefillPayload`: the session's own shared value outranks canonical
    // record prefill. Anything else would let a stale record overwrite what the parent just typed.
    const sessionValue = input.sharedValues[identity.session_value_key];
    // Canonical prefill can only speak for a canonical datum. A process-scoped answer has no record
    // behind it by construction, so there is nothing for a record to prefill.
    const canonicalValue = identity.shared_value_key ? input.canonicalValues?.[identity.shared_value_key] : undefined;
    if (usableValue(sessionValue)) return { value: sessionValue, source: "session_shared_value" };
    if (usableValue(canonicalValue)) return { value: canonicalValue, source: "canonical_prefill" };
    return { value: null, source: "none" };
}

/**
 * A QUESTION THE FORM SAYS DOES NOT APPLY IS NOT ASKED.
 *
 * ## The distinction this enforces
 *
 * "If yes, please explain arrangements and custody" is not a question. It is the second half of one,
 * and a family who has just said there are no custody arrangements must not meet it — not greyed
 * out, not skipped past with an explanation, not asked. The paperwork has always said so: the Form
 * schema has carried `visibility` since v1, the public renderer honours it, and `validateSubmission`
 * will not demand a hidden required field. The PARTICIPANT projection was the one reader that never
 * asked, so every conditional destination in every packet became an unconditional turn.
 *
 * ## Why it lives here and not in the conversation
 *
 * Conditionality is authored, not inferred. The alternative — a runtime rule that notices a label
 * beginning "If yes" and attaches it to whatever came before — would be a second, invisible
 * information architecture that no operator could see, change, or be held to. This function knows
 * nothing about Admissions, nothing about labels, and nothing about English; it evaluates the
 * operator's own condition with the platform's own evaluator.
 *
 * ## Safe direction
 *
 * A controlling field with no value reads as `undefined`, so `equals true` is not satisfied and the
 * dependent question is withheld until the answer exists. Withholding a follow-up nobody has earned
 * is recoverable on the next turn; asking a parent to explain a custody arrangement they have just
 * told us does not exist is not.
 */
function pruneInvisibleOccurrences(byKey: Map<string, Accumulator>, input: ProjectNeedsInput): void {
    const conditioned = input.forms.filter((f) => schemaDeclaresVisibility(f.schema));
    if (conditioned.length === 0) return;

    // Every destination's current value, at Form-field grain — the grain a condition names.
    const valueByFieldId = new Map<string, unknown>();
    for (const acc of byKey.values()) {
        const { value } = resolveNeedValue(acc.identity, input);
        for (const o of acc.occurrences) valueByFieldId.set(o.form_field_id, value);
    }

    const schemaByVersion = new Map<string, FormSchemaV1>();
    for (const f of conditioned) schemaByVersion.set(f.form_definition_version_id, f.schema);

    for (const [key, acc] of [...byKey.entries()]) {
        const visible = acc.occurrences.filter((o) => {
            const schema = schemaByVersion.get(o.form_definition_version_id);
            // A Form that authors no condition is not consulted; its destinations always apply.
            if (!schema) return true;
            return evaluateFieldVisibility(o.form_field_id, schema, (id) => valueByFieldId.get(id));
        });
        if (visible.length === acc.occurrences.length) continue;
        // Every destination this need had is conditioned away: the need itself does not exist yet.
        if (visible.length === 0) {
            byKey.delete(key);
            continue;
        }
        acc.occurrences = visible;
    }
}

function finalize(acc: Accumulator, input: ProjectNeedsInput): EnrollmentInformationNeed {
    const { identity } = acc;
    const base = {
        identity,
        scope: identity.scope,
        subject_id: identity.subject_id,
        occurrence_count: acc.occurrences.length,
        occurrences: acc.occurrences,
        requirement_ids: [...acc.requirementIds],
    } as const;

    /*
     * Whether a value may be REUSED and whether it is ASKED are different questions.
     *
     * This branch used to answer both: no canonical identity meant `artifact_specific`, and
     * `artifact_specific` meant the conversation skipped it. Sixty-four questions the school
     * actually asks were therefore never asked out loud — the parent answered twenty turns and was
     * then handed the raw controls.
     *
     * A need with no place to keep an answer is still artifact work. A need with a session key is a
     * question, whether or not its answer may ever be reused.
     */
    if (!identity.session_value_key) {
        return {
            ...base,
            state: "artifact_specific",
            has_value: false,
            current_value: null,
            value_source: "none",
            value_origin: null,
            requires_participant_action: false,
        };
    }

    const resolved = resolveNeedValue(identity, input);
    const current_value: unknown = resolved.value;
    const value_source: EnrollmentNeedValueSource = resolved.source;

    const has_value = value_source !== "none";
    if (!has_value) {
        /**
         * REQUIREDNESS IS THE FORM'S, NOT THE RUNTIME'S.
         *
         * `field.required` on the authored control is the only owner of "must this be answered",
         * and it is carried on every occurrence. A need is blocking when ANY occurrence requires it:
         * one artifact demanding a fact is enough, and the strictest occurrence has to win or the
         * packet could be submitted incomplete.
         *
         * An optional missing fact is still SURFACED — the parent may want to give it — but it does
         * not inflate "things left to check", and it must offer a real way out. Without this, the
         * only way past an optional allergies field was to type something untrue, which is exactly
         * what QA did: "na".
         */
        const blocking = acc.occurrences.some((o) => o.required);

        /*
         * A decline settles an OPTIONAL need and nothing else.
         *
         * Where the Form insists on an answer there is nothing to decline, so a stored decline is
         * ignored rather than honoured — the question comes back, which is the safe direction.
         */
        if (!blocking && declineSatisfiesAbsence(input.declines?.[identity.key], false)) {
            return {
                ...base,
                state: "declined",
                has_value: false,
                current_value: null,
                value_source: "none",
                value_origin: null,
                requires_participant_action: false,
                optional: true,
            };
        }

        return {
            ...base,
            state: "missing",
            has_value: false,
            current_value: null,
            value_source: "none",
            value_origin: null,
            requires_participant_action: blocking,
            optional: !blocking,
        };
    }

    // D-99. A confirmation only counts against the value it was made about, so a later change
    // invalidates it with no flag to clear.
    const confirmed = confirmationSatisfiesCurrentValue(
        input.confirmations[identity.key],
        current_value,
    );
    // Confirmation policy names canonical data. A process-scoped answer has no canonical key, so
    // nothing can require its confirmation — it is simply asked.
    const confirmationKey = identity.canonical_key ?? identity.shared_value_key;
    const mustConfirm = confirmationKey !== null && input.requiresConfirmation?.has(confirmationKey) === true;

    let state: EnrollmentNeedState;
    if (confirmed) state = "confirmed";
    else if (mustConfirm) state = "known_requires_confirmation";
    else state = "known";

    return {
        ...base,
        state,
        has_value: true,
        current_value,
        value_source,
        value_origin: input.provenance?.[identity.key]?.origin ?? null,
        requires_participant_action: state === "known_requires_confirmation",
    };
}


/**
 * One need per party collection — the obligation, not its questions.
 *
 * The state vocabulary is the one the rest of the runtime already speaks: a collection whose
 * minimum is met and whose family-added entries are complete is `confirmed`; anything else is
 * `missing` and still the participant's work. `optional` is true when the Form asks for none,
 * because a collection with no minimum is a place to add people, not a demand to.
 */
function projectPartyCollectionNeeds(input: ProjectNeedsInput): EnrollmentInformationNeed[] {
    const out: EnrollmentInformationNeed[] = [];
    for (const form of input.forms) {
        for (const group of partyCollectionGroups(form.schema)) {
            const held = readPartyEntries(input.sharedValues, form.form_definition_id, group.id);
            const base = projectPartyCollection(group, held);
            if (!base) continue;
            const known = input.knownPartyEntries?.[group.id] ?? [];
            const entries = mergeKnownEntries(known, held, { showKnown: base.show_known });
            const collection = { ...base, entries };
            /*
             * VALIDITY AND FINALITY, KEPT APART.
             *
             * The minimum being met does not mean the family is finished — a list of people is
             * open-ended, and only they know when it ends. The need therefore stays the
             * participant's work until they say "that's everyone", which is what stops the
             * collection vanishing the moment a first contact is added.
             */
            const settledMarker = readPartySettled(input.sharedValues, form.form_definition_id, group.id);
            const valid = partyCollectionValid(collection);
            const satisfied = partyCollectionComplete(collection, settledMarker);
            const key = `party:${form.form_definition_id}:${group.id}`;
            out.push({
                identity: {
                    key,
                    scope: "shared",
                    subject_party: null,
                    journey_subject_id: input.subjectId,
                    entity_type: collection.subject === "child" ? "customer_member" : "person",
                    subject_entity_type: collection.subject === "child" ? "customer_member" : "person",
                    field_key: group.id,
                    shared_value_key: null,
                    session_value_key: partyCollectionStateKey(form.form_definition_id, group.id),
                    collection_mode: "participant",
                    label: group.label,
                } as unknown as EnrollmentNeedIdentity,
                scope: "shared" as EnrollmentInformationNeed["scope"],
                subject_id: input.subjectId,
                state: satisfied ? "confirmed" : "missing",
                occurrence_count: 1,
                occurrences: [
                    {
                        requirement_id: form.requirement_id,
                        form_definition_id: form.form_definition_id,
                        form_definition_version_id: form.form_definition_version_id,
                        session_item_id: form.session_item_id,
                        form_field_id: group.id,
                        label: group.label,
                        required: collection.min > 0,
                        section_title: null,
                        field_type: "party_collection",
                        options: [],
                    },
                ],
                optional: collection.min === 0,
                requirement_ids: [form.requirement_id],
                has_value: entries.length > 0,
                current_value: entries,
                value_source: entries.length ? "session_shared_value" : "none",
                value_origin: null,
                requires_participant_action: !satisfied,
                party_collection: { ...collection, valid, settled: settledMarker },
            } as EnrollmentInformationNeed);
        }
    }
    return out;
}
