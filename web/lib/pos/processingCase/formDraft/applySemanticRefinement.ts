/**
 * Let semantics decide what a family is asked; let the source keep deciding where ink lands.
 *
 * `buildFormDraftFromStructure` maps one source destination to one participant field, taking the
 * label from the OCR string and the type from the reader's widget guess. The published Forms show
 * the cost: 173 participant fields for 86 correlated facts, 63 labels like "Phone Number NúMero De
 * TeléFono Row1", `shared_value_key` on 5 of 173, and a phone stored as the number 1231231234.
 *
 * This is the refinement pass that corrects that WITHOUT forking the builder. The builder still owns
 * destination identity, page, bbox and structure. This pass owns eligibility, participant copy,
 * semantic type and shared identity — and it reaches the destinations through the correlation the
 * platform already certified (`draftFieldsForConcept`), which returns MANY fields for ONE concept.
 * That is the whole model in one line:
 *
 *     semantic concept → participant interaction (or none) → one shared identity → many destinations
 *
 * Pure. No I/O.
 */

import type { ConfigurationDiscoveryResult } from "@/lib/pos/discovery/contracts";
import { OPERATIONAL_FORM_SYSTEM_FIELDS, PHONE_PATTERN, EMAIL_PATTERN } from "@/lib/forms/systemFieldRegistry";
import { draftFieldsForConcept } from "@/lib/pos/discovery/applyDiscovery";
import type { StoredFormDraftPreview, DraftFormField, DraftFormFieldType } from "./types";
import { isParticipantFacing, PARTICIPANT_ACT_ROLES, projectParticipantRole, semanticTypeFor, type ParticipantProjection } from "./participantQuestionEligibility";

export type SemanticRefinementReport = {
    /** Concepts by the role they resolved to. */
    roles: Record<string, number>;
    /** Destinations touched, by role. */
    destinationsByRole: Record<string, number>;
    /** Shared identities that reached the schema. */
    sharedIdentities: number;
    /** Shared identities feeding more than one destination — the ask-once population. */
    sharedIdentitiesMultiDestination: number;
    /** Destinations covered by a multi-destination shared identity. */
    destinationsUnderSharedIdentity: number;
    /** Participant-asked fields still wearing a source label. Must be 0. */
    noisyAskedLabels: string[];
    /**
     * Destinations the source marked required whose concept is owned elsewhere. The question stops
     * being asked AND stops being mandatory — recorded here so the owner is visible.
     */
    relinquishedRequirements: { field_id: string; label: string; role: string; basis: string }[];
    /** Concepts with no recoverable participant treatment. Must be 0 to publish. */
    unresolved: string[];
    /** Destinations no concept claimed — left exactly as the builder produced them. */
    unclaimedDestinations: number;
};

/**
 * A phone is a string with a shape, never a scalar.
 *
 * FormSchemaV1 has no `phone` type, so phone semantics are carried as text plus the canonical
 * validation the platform already owns. What matters is what it is NOT: `number`, which is how a
 * phone lost its leading digits and its formatting on the live run.
 */
const SEMANTIC_TO_DRAFT_TYPE: Record<NonNullable<ParticipantProjection["semanticType"]>, DraftFormFieldType> = {
    text: "text",
    phone: "text",
    email: "text",
    date: "date",
    number: "number",
    boolean: "boolean",
    select: "select",
};

/** The platform's own shapes. Inventing a second phone pattern is how two truths appear. */
const PHONE_VALIDATION = { pattern: PHONE_PATTERN } as const;
const EMAIL_VALIDATION = { pattern: EMAIL_PATTERN } as const;


/**
 * The Spanish half of a bilingual state form.
 *
 * The Oregon CIS prints every prompt twice — "Childs Last Name Apellido Delde La Menor Row1" is one
 * label containing two languages and a widget suffix. Cutting at the first Spanish marker recovers
 * the English prompt without inventing a word that is not on the page.
 */
const SPANISH_MARKER =
    /\b(apellido|primer|segundo|nombre|nombres|fecha|dosis|numero|telefono|firma|actualizar|marque|certifico|solicito|exencion|documentacion|vacuna|vacunas|menor|padres|tutores|creencias|opciona|opcional)\b/;

/** Widget suffixes the reader appends to distinguish boxes: "Row1", "Row1 2", "_2". */
const WIDGET_SUFFIX = /\s*(?:row\s*\d+)(?:\s+\d+)?\s*$/i;

const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * The distinguishing prompt of ONE destination.
 *
 * This is the pass's load-bearing idea. `draftFieldsForConcept` returns every destination a concept
 * touches, and those destinations are FACETS, not repeats: `child.name` reaches last name, first
 * name and middle name; `child.hib` reaches doses one through five. Treating them as one fact is how
 * a single answer would end up written into all three name boxes.
 */
export function facetOf(destinationLabel: string): string {
    let label = (destinationLabel ?? "").replace(WIDGET_SUFFIX, "").trim();
    const folded = fold(label);
    const m = SPANISH_MARKER.exec(folded);
    if (m && m.index > 0) {
        const english = label.slice(0, m.index).trim().replace(/[,;:]$/, "");
        // Only when an English prompt actually remains. A Spanish-only label keeps its own words.
        if (english.split(/\s+/).filter(Boolean).length >= 1 && english.length >= 2) label = english;
    }
    return label.replace(/\s+/g, " ").trim();
}

const slug = (v: string) => fold(v).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);

const STOPWORDS = new Set(["of", "the", "a", "an", "and", "s"]);
/** Entity nouns the facet may omit because the concept already supplies the grain. */
const GRAIN_NOUNS = new Set(["child", "children", "student", "guardian", "parent", "person", "customer", "member"]);

function tokens(v: string): Set<string> {
    return new Set(
        fold(v)
            .replace(/[^a-z0-9]+/g, " ")
            .split(" ")
            .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t))
            .filter((t) => t && !STOPWORDS.has(t) && !GRAIN_NOUNS.has(t)),
    );
}

const sameTokens = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((t) => b.has(t));

/**
 * The facet's own canonical field, when the platform already registers one.
 *
 * `child.name` binds to `child_first_name`, but it reaches three boxes. The last-name box is not an
 * unknown: `child_last_name` is a registered system field. Consulting the registry is how the right
 * canonical field is found without inventing one — and a facet with no registered field gets NO
 * binding at all, because a proposed field would be an ownership claim nobody approved.
 */
export function registryFieldForFacet(facet: string) {
    const want = tokens(facet);
    if (!want.size) return null;
    return (
        OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => !e.deprecated && sameTokens(want, tokens(e.default_label))) ?? null
    );
}

/**
 * The source's own numbering. "Parent/Guardian #1 Phone Number" and "#2" are two people, not one
 * fact asked twice — and two boxes printed with the SAME prompt are one fact asked twice.
 */
function ordinalOf(facet: string): number | null {
    const m = /#\s*(\d+)|\b(\d+)\b/.exec(facet);
    return m ? Number(m[1] ?? m[2]) : null;
}

function baseOf(facet: string): string {
    return facet.replace(/#\s*\d+/g, " ").replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim() || facet;
}

/** Does this facet name the canonical field the proposal bound to? */
function facetMatchesCanonicalField(facet: string, sharedValueKey: string | undefined): boolean {
    if (!sharedValueKey) return false;
    const key = fold(sharedValueKey.split(":").pop() ?? "").replace(/[^a-z0-9]/g, "");
    const f = fold(facet).replace(/[^a-z0-9]/g, "");
    if (!key || !f) return false;
    return f === key || f.includes(key) || key.includes(f);
}

const NOISE = /\bRow\s*\d+\b|Dosis|NúMero|Apellido|Fecha\s+De|Nombre\s+De|Segundo\s+Nombre|Primer\s+Nombre/i;


/**
 * Declare a derived destination, from the semantics discovery already published.
 *
 * Two rules, and neither reads a label. The KIND comes from `derived_kind` on the proposal, so this
 * layer computes what discovery said to compute. The INPUTS are found by canonical identity inside
 * the same artifact — the DOB destination and the date the artifact itself calls the child's first
 * day — because an age is only ever an age on a date, and the date this school means is the one it
 * asks for on the same page.
 *
 * Returns null when the inputs are not present. A derivation whose sources are missing is not
 * declared, so the value-production gate still sees the destination as unfilled rather than being
 * told a story about it.
 */
function declareDerived(
    kind: string | undefined,
    fields: DraftFormField[],
    allFields: DraftFormField[],
): DraftFormField["derived"] | null {
    if (kind === "execution_date") return { kind: "execution_date" };
    if (kind !== "age_at_date") return null;

    const byIdentity = (test: (key: string) => boolean) =>
        allFields.find((f) => {
            const k = f.field_source?.shared_value_key ?? "";
            const c = f.field_source ? `${f.field_source.entity_type}:${f.field_source.field_key}` : "";
            return !f.read_only && (test(k) || test(c));
        });

    const dob = byIdentity((k) => /(^|[:_])dob$|date_of_birth/i.test(k));
    const asOf = byIdentity((k) => /(^|[:_])start_date$/i.test(k));
    if (!dob || !asOf) return null;
    return { kind: "age_from_date_of_birth", source_key: dob.id, as_of_key: asOf.id };
}

export function applySemanticRefinement(input: {
    draft: StoredFormDraftPreview;
    discovery: ConfigurationDiscoveryResult;
    /** Artifacts that own their own structured logic — the exemption's controls stay with it. */
    selfContained?: boolean;
}): { draft: StoredFormDraftPreview; report: SemanticRefinementReport } {
    const concepts = input.discovery.concepts;
    const proposalByCandidate = new Map(input.discovery.proposals.map((p) => [p.candidate_id, p]));

    const report: SemanticRefinementReport = {
        roles: {}, destinationsByRole: {}, relinquishedRequirements: [], sharedIdentities: 0, sharedIdentitiesMultiDestination: 0,
        destinationsUnderSharedIdentity: 0, noisyAskedLabels: [], unresolved: [], unclaimedDestinations: 0,
    };
    const claimed = new Set<string>();
    const destinationsPerIdentity = new Map<string, number>();
    /**
     * Which prompt already owns each canonical identity.
     *
     * The facet rule stops ONE concept's destinations from collapsing. This stops the same collapse
     * one level up, between concepts: three different questions — "Toilet habits", "How does your
     * child indicate their needs", "Any specific toileting needs we need to know?" — all bound to
     * `customer_member.toileting_routine`, so a single answer would have been printed under all
     * three prompts. The first prompt keeps the canonical field; the others are their own facts.
     */
    const identityOwner = new Map<string, string>();
    const pendingDerived: { kind: string; fields: DraftFormField[] }[] = [];

    concepts.forEach((concept, index) => {
        const proposal = proposalByCandidate.get(concept.id);
        if (!proposal) return;

        // The gate a dependent fragment hangs from: the nearest preceding choice in its own section,
        // which is the pairing the certified structure shows.
        let gate: string | null = null;
        for (let j = index - 1; j >= 0; j--) {
            if (concepts[j]!.source?.section_title !== concept.source?.section_title) break;
            if (concepts[j]!.kind === "choice_field") { gate = concepts[j]!.id; break; }
        }

        // Destinations first: the source's own requiredness is evidence the projection needs.
        const fields = draftFieldsForConcept(input.draft, input.discovery, concept.id);
        if (!fields.length) return;
        for (const field of fields) claimed.add(field.id);

        const projection = projectParticipantRole({
            concept,
            proposal,
            readerType: (concept as { suggestedDataType?: string }).suggestedDataType ?? null,
            precedingGateConceptId: gate,
            sourceRequiresValue: fields.some((f) => f.required),
            ...(input.selfContained ? { onSelfContainedArtifact: true } : {}),
        });

        // A discovery result covers the whole SOURCE; a draft covers one artifact. A concept with no
        // destination here belongs to another artifact of the same document, and reporting it as
        // this artifact's unresolved hold would be a false alarm — handled above, before projecting.
        // A concept can be mixed. When its own label does not put the destinations in front of a
        // participant, ask the source again, one prompt at a time — a held `guardian.address` that
        // reaches two "Employer Address" boxes is two employer facts and one guardian fact.
        const conceptProposal = proposal;
        const groups = new Map<string, { projection: ParticipantProjection; fields: DraftFormField[] }>();
        if (isParticipantFacing(projection.role)) {
            groups.set("*", { projection, fields });
        } else {
            for (const field of fields) {
                const facet = facetOf(field.label);
                const perFacet = projectParticipantRole({
                    concept,
                    proposal,
                    readerType: (concept as { suggestedDataType?: string }).suggestedDataType ?? null,
                    precedingGateConceptId: gate,
                    sourceRequiresValue: field.required,
                    facetLabel: facet,
                    ...(input.selfContained ? { onSelfContainedArtifact: true } : {}),
                });
                const chosen = isParticipantFacing(perFacet.role) ? perFacet : projection;
                const key = `${chosen.role}|${chosen.basis}|${chosen.sharedValueKey ?? ""}`;
                const g = groups.get(key) ?? { projection: chosen, fields: [] };
                g.fields.push(field);
                groups.set(key, g);
            }
        }

        for (const { projection: p, fields: fs } of groups.values()) applyGroup(p, fs);
        return;

        function applyGroup(projection: ParticipantProjection, fields: DraftFormField[]) {
        report.roles[projection.role] = (report.roles[projection.role] ?? 0) + 1;
        report.destinationsByRole[projection.role] = (report.destinationsByRole[projection.role] ?? 0) + fields.length;
        if (projection.role === "hold_for_review") report.unresolved.push(`${concept.concept_key ?? concept.id}`);

        if (!isParticipantFacing(projection.role)) {
            // Placed, not asked. Geometry and lineage are untouched — only interrogation stops.
            //
            // A destination the SOURCE marked required cannot be both hidden and mandatory: the
            // packet would never submit. The requirement is relinquished with the question, and
            // named in the report, because an obligation that disappears without being recorded is
            // the defect this whole pass exists to stop.
            /*
             * A destination Alloy fills rather than asks — resolved in a SECOND pass.
             *
             * A derivation cites its inputs by canonical identity, and those identities are assigned
             * by this very loop. "Student Age Upon Enrolling" is printed before the box the school
             * calls the child's first day, so at this moment the date it needs has no identity yet.
             * Deferring the declaration is the difference between finding the reference date and
             * quietly falling back to today.
             */
            const derivedKind = (conceptProposal as { derived_kind?: string }).derived_kind;
            if (derivedKind) pendingDerived.push({ kind: derivedKind, fields });
            for (const field of fields) {
                field.read_only = true;
                if (derivedKind) continue; // requiredness decided in the second pass
                if (field.required) {
                    field.required = false;
                    report.relinquishedRequirements.push({
                        field_id: field.id,
                        label: field.label,
                        role: projection.role,
                        basis: projection.basis,
                    });
                }
            }
            return;
        }

        // Asked. Identity is per FACET, because a concept's destinations are not one fact.
        const base = projection.sharedValueKey ?? `concept:${concept.concept_key ?? concept.id}`;
        const facets = fields.map((f) => facetOf(f.label));

        // Which facet family does the concept's canonical binding actually describe? When the
        // concept reaches one family, that one; otherwise only the family that names the field.
        const bases = new Set(facets.map(baseOf));
        const minOrdinal = new Map<string, number>();
        for (const f of facets) {
            const b = baseOf(f);
            const o = ordinalOf(f);
            if (o !== null) minOrdinal.set(b, Math.min(minOrdinal.get(b) ?? o, o));
        }
        const canonicalBase =
            [...bases].find((b) => facetMatchesCanonicalField(b, projection.sharedValueKey)) ??
            (bases.size === 1 ? [...bases][0]! : null);

        if (PARTICIPANT_ACT_ROLES.includes(projection.role)) {
            // Signing, acknowledging, attaching, or ticking the exemption being claimed. The source
            // already worded these and the reader already typed them; nothing here needs renaming,
            // and a shared identity would be meaningless for an act.
            for (const field of fields) {
                field.read_only = false;
                report.destinationsByRole[projection.role] = report.destinationsByRole[projection.role] ?? 0;
            }
            return;
        }

        fields.forEach((field, fi) => {
            const facet = facets[fi]!;
            const factBase = baseOf(facet);
            const ordinal = ordinalOf(facet);

            // The concept's canonical binding belongs to ONE of its facet families, and inside that
            // family to the ordinal the source numbered first. Everything else is a different fact:
            // the second guardian's phone is not the first guardian's phone.
            let canonical =
                factBase === canonicalBase && (ordinal === null || ordinal === (minOrdinal.get(factBase) ?? ordinal));
            if (canonical) {
                const owner = identityOwner.get(base);
                if (owner === undefined) identityOwner.set(base, factBase);
                else if (owner !== factBase) canonical = false;
            }
            const identity = canonical ? base : `${base}#${slug(factBase)}${ordinal !== null ? `_${ordinal}` : ""}`;

            // The source's own English prompt beats a key-derived word: "Birth Date" over "Dob".
            // A trailing colon belongs to a printed form, not to a question asked in an app.
            const raw = facet && facet.length >= 2 && !NOISE.test(facet) ? facet : projection.label ?? field.label;
            const label = raw.replace(/\s*:\s*$/, "").trim() || raw;
            field.label = label;

            // Semantics may follow the FACET where the concept is too coarse to carry them:
            // "Emergency Contact #1 Phone Number" is a phone even though its concept is a person.
            const semantic = semanticTypeFor(slug(facet), null) ?? projection.semanticType;
            const carriesShape = semantic === "phone" || semantic === "email";
            const chosen = carriesShape ? semantic : projection.semanticType;

            // The reader's STRUCTURAL widgets are facts about the page, not guesses: a checkbox, a
            // signature, a file, a declared choice list. Retyping those from a concept key is how a
            // "had chickenpox" checkbox would become a free-text box. Only scalars are re-typed.
            const RETYPEABLE = new Set<DraftFormFieldType>(["text", "number", "date"]);
            if (chosen && RETYPEABLE.has(field.type)) {
                field.type = SEMANTIC_TO_DRAFT_TYPE[chosen];
                // `number` ate the leading digit and the formatting of the live run's phone. Text
                // plus the shape the platform already validates is what a phone actually is.
                if (chosen === "phone") field.validate = { ...(field.validate ?? {}), ...PHONE_VALIDATION };
                if (chosen === "email") field.validate = { ...(field.validate ?? {}), ...EMAIL_VALIDATION };
            }
            field.read_only = false;

            // `shared_value_key` rides on `field_source`, which asserts WHICH canonical field this
            // box is. So ask-once is available exactly where a true binding exists — and a facet the
            // concept's binding does not describe must SHED that binding rather than inherit it.
            const target = (projection.canonicalBinding ?? conceptProposal.target_field_source) as
                { entity_type?: string; field_key?: string; shared_value_key?: string } | null | undefined;
            if (canonical && target?.entity_type && target?.field_key) {
                field.field_source = { entity_type: target.entity_type, field_key: target.field_key, shared_value_key: identity };
            } else if (canonical && field.field_source?.entity_type && field.field_source?.field_key) {
                field.field_source = { ...field.field_source, shared_value_key: identity };
            } else {
                const registered = registryFieldForFacet(facet);
                if (registered) {
                    field.field_source = {
                        entity_type: registered.entity_type,
                        field_key: registered.field_key,
                        ...(registered.shared_value_key ? { shared_value_key: registered.shared_value_key } : {}),
                    };
                } else {
                    // No registered field for this fact. Asked, stored nowhere durable, and never
                    // written into the neighbouring facet's canonical field.
                    delete field.field_source;
                }
            }
            const finalKey = field.field_source?.shared_value_key;
            if (finalKey) destinationsPerIdentity.set(finalKey, (destinationsPerIdentity.get(finalKey) ?? 0) + 1);
            if (NOISE.test(label)) report.noisyAskedLabels.push(label);
        });
        }
    });

    for (const { kind, fields } of pendingDerived) {
        const derived = declareDerived(kind, fields, input.draft.fields);
        for (const field of fields) {
            if (derived) {
                field.derived = derived;
                continue; // stays required: something WILL fill it
            }
            if (field.required) {
                field.required = false;
                report.relinquishedRequirements.push({
                    field_id: field.id,
                    label: field.label,
                    role: "artifact_placement_only",
                    basis: `declared derivable (${kind}) but its inputs are not on this artifact`,
                });
            }
        }
    }

    for (const identity of destinationsPerIdentity.keys()) {
        report.sharedIdentities += 1;
        const n = destinationsPerIdentity.get(identity)!;
        if (n > 1) { report.sharedIdentitiesMultiDestination += 1; report.destinationsUnderSharedIdentity += n; }
    }
    report.unclaimedDestinations = input.draft.fields.filter((f) => !claimed.has(f.id)).length;

    return { draft: input.draft, report };
}
