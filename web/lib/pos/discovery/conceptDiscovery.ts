/**
 * POS-FP16 — Layer 3 → Layer 4: semantic document model → business concept candidates.
 *
 * This is the aggregation that turns "112 physical questions" into the OPERATIONAL CONCEPTS the
 * document expresses, so the operator reviews meaning — not rows. The key moves:
 *
 *   • repeated person sections (Guardian #1/#2, Emergency Contact #1/#2, Pickup #1/#2) collapse by
 *     operational ROLE into ONE relationship_group concept each — never flat person fields
 *   • child / household / health scalar fields become individual scalar/choice/boolean concepts,
 *     deduped across pages, with subject/grain inferred from section context + field label
 *   • static instructions naming a document that "must be provided" become upload_requirement concepts
 *   • acknowledgement / signature sections become acknowledgement / signature concepts (director → internal)
 *   • output-copy pages become a single output_copy concept referencing earlier concepts
 *
 * Pure + deterministic. Assigns a NORMALIZED semantic concept_key (stable identity + dedup) and a
 * confidence with explicit deterministic signals; the actual canonical-field/relationship/requirement
 * resolution is Layer 5 (configurationMatching), which reuses the platform matchers.
 */

import type { OperationalRoleKey } from "@/lib/fields/personChildRelationship/personChildRelationshipEntity";
import {
    detectRelationshipDefinitionForTitle,
    relationshipDefinitionForRole,
} from "@/lib/fields/relationship/relationshipDefinitions";
import { acknowledgementClauses, documentRequestClauses } from "./proseClauses";
import { normalizeKey } from "./semanticModel";
import {
    DISCOVERY_CONTRACT_VERSION,
    type BusinessConceptCandidate,
    type ConceptKind,
    type ConceptSubject,
    type Confidence,
    type SemanticDocumentModel,
    type SemanticField,
    type SemanticSection,
    type SourceRef,
} from "./contracts";

// ── section-context classification ───────────────────────────────────────────

interface SectionContext {
    subject: ConceptSubject;
    role?: OperationalRoleKey;
    role_scope?: "child" | "household";
    internal?: boolean;
}

function classifySection(section: SemanticSection): SectionContext {
    const t = section.title.toLowerCase();
    // Definition-derived: the relationship model owns which titles denote which role, and in what
    // precedence (detection_priority). A newly configured role classifies with no edit here.
    const def = detectRelationshipDefinitionForTitle(t);
    if (def) return { subject: "person", role: def.operational_role_key, role_scope: def.relationship_scope };
    if (/\bdirector\b/.test(t)) return { subject: "internal", internal: true };
    if (/signature/.test(t)) return { subject: "person" };
    if (/authoriz|permission|consent/.test(t)) return { subject: "household" };
    if (/medical|health|immuniz|chronic|allerg/.test(t)) return { subject: "child" };
    return { subject: "child" };
}

// ── scalar concept key inference (semantic identity, registry-independent) ─────

interface ScalarSemantics {
    subject: ConceptSubject;
    concept_key: string;
    band: Confidence["band"];
    signals: string[];
}

function scalarSemantics(label: string, ctx: SectionContext): ScalarSemantics {
    const l = label.toLowerCase();
    const sig = (s: string) => [s, `section: ${ctx.subject}`];
    if (/\b(date of birth|birth\s*date|birthdate|d\.?o\.?b)\b/.test(l)) return { subject: "child", concept_key: "child.date_of_birth", band: "high", signals: sig("label matches date-of-birth") };
    if (/\bemail\b/.test(l)) return { subject: "person", concept_key: "person.email", band: "high", signals: sig("label matches email") };
    if (/\b(phone|telephone|mobile|cell|contact number)\b/.test(l)) return { subject: "person", concept_key: "person.phone", band: "high", signals: sig("label matches phone") };
    if (/\b(address|street|city|state|zip|postal)\b/.test(l)) return { subject: "household", concept_key: "household.address", band: "review", signals: sig("label matches address component") };
    if (/\ballerg/.test(l)) return { subject: "child", concept_key: "child.allergies", band: "high", signals: sig("label matches allergies") };
    if (/\brelationship to child\b/.test(l)) return { subject: "person", concept_key: "relationship.relationship_type", band: "high", signals: sig("label matches relationship-to-child") };
    if (/\b(child'?s?\s*name|name of child)\b/.test(l) || (ctx.subject === "child" && /\bname\b/.test(l) && !/employment|practice|doctor|dentist/.test(l))) {
        return { subject: "child", concept_key: "child.name", band: "high", signals: sig("child name in a child-subject section") };
    }
    if (/\bnickname\b/.test(l)) return { subject: "child", concept_key: "child.nickname", band: "review", signals: sig("label matches nickname") };
    if (ctx.subject === "person" && /\bname\b/.test(l)) return { subject: "person", concept_key: "person.name", band: "high", signals: sig("person name in a relationship section") };
    // default: keep the concept scoped to the section subject with a normalized label key
    const core = l.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    return { subject: ctx.subject === "internal" ? "internal" : ctx.subject, concept_key: `${ctx.subject}.${core}`, band: "review", signals: sig("no canonical alias — scoped by section subject") };
}

function conf(band: Confidence["band"], signals: string[]): Confidence {
    const percent = band === "high" ? 90 : band === "review" ? 65 : band === "attention" ? 40 : 20;
    return { band, percent, signals };
}

function sourceRef(section: SemanticSection, labels: string[]): SourceRef {
    return { page: section.page, section_title: section.title, section_key: section.section_key, labels };
}

function conceptId(page: number, sectionKey: string, slug: string): string {
    return `${page}:${sectionKey}:${slug}`;
}

// ── main ─────────────────────────────────────────────────────────────────────

const UPLOAD_DOC_RE = /\b(records?|plan|documentation|proof|copy|certificate)\b[^.]*\b(provided|provide|bring|attach|submit|on or before)\b|\b(must be provided|please bring)\b/i;

export function discoverConcepts(model: SemanticDocumentModel): BusinessConceptCandidate[] {
    const concepts: BusinessConceptCandidate[] = [];
    const seen = new Set<string>(); // concept_key dedup for active (non-output) scalars

    // group repeated-person sections by role so #1/#2 collapse into one relationship concept
    const relBuckets = new Map<OperationalRoleKey, SemanticSection[]>();

    for (const section of model.sections) {
        const ctx = classifySection(section);

        // ── output/duplicate copy → one concept per page, references earlier concepts ──
        if (section.output_copy) {
            const id = conceptId(section.page, section.section_key, "output_copy");
            if (!concepts.some((c) => c.kind === "output_copy" && c.source.page === section.page)) {
                concepts.push({
                    contract_version: DISCOVERY_CONTRACT_VERSION,
                    id,
                    kind: "output_copy",
                    label: section.title.replace(/\s*\(.*?\)\s*/g, " ").trim() || "Classroom copy",
                    concept_key: "output.classroom_copy",
                    subject: "internal",
                    cardinality: "single",
                    output_of: [...seen],
                    source: sourceRef(section, section.fields.map((f) => f.label)),
                    confidence: conf("high", ["page marked as an output/classroom copy of earlier information"]),
                    explanation: "Recognized as an output/classroom copy that reproduces information collected earlier — not a new set of participant questions.",
                });
            }
            continue;
        }

        // ── repeated person section → bucket by role (collapse later) ──
        if (section.repeated_person && ctx.role) {
            const arr = relBuckets.get(ctx.role) ?? [];
            arr.push(section);
            relBuckets.set(ctx.role, arr);
            continue;
        }

        // ── acknowledgement section (legal/consent) ──
        // The clause reader below produces one concept per commitment. It supersedes the whole-
        // section concept whenever it finds anything: seven authorizations under one heading are
        // seven decisions, and a single "Parent Authorizations" checkbox is not one of them.
        if (section.disposition === "acknowledgement" && acknowledgementClauses(section.static_text).length === 0) {
            concepts.push({
                contract_version: DISCOVERY_CONTRACT_VERSION,
                id: conceptId(section.page, section.section_key, "acknowledgement"),
                kind: "acknowledgement",
                label: section.title,
                concept_key: "requirement.acknowledgement",
                subject: "household",
                cardinality: "single",
                requirement_type: "acknowledgement",
                source: sourceRef(section, section.static_text ? [section.static_text.slice(0, 120)] : []),
                confidence: conf("high", ["section classified as consent/legal prose requiring acknowledgement"]),
                explanation: "Consent / legal language the participant must affirmatively acknowledge; the paragraph is preserved as static content.",
            });
            // continue: still scan for any real scalar in the section (e.g. an embedded field) below
        }

        // ── signature section ──
        if (section.disposition === "signature") {
            const internal = ctx.internal === true;
            concepts.push({
                contract_version: DISCOVERY_CONTRACT_VERSION,
                id: conceptId(section.page, section.section_key, "signature"),
                kind: "signature",
                label: section.title.replace(/:$/, ""),
                concept_key: internal ? "signature.internal" : "signature.participant",
                subject: internal ? "internal" : "person",
                cardinality: section.fields.filter((f) => f.role === "signature").length > 1 ? "multiple" : "single",
                requirement_type: "signature",
                source: sourceRef(section, section.fields.map((f) => f.label)),
                confidence: conf("high", internal ? ["director/internal signature block"] : ["participant signature block"]),
                explanation: internal
                    ? "A director/internal signature — an operator responsibility, not participant work."
                    : "A participant (guardian) signature responsibility.",
            });
            continue;
        }

        // ── repeating structures: ONE decision each, not one per occurrence ──
        // The page's geometry already told us these destinations repeat one value. Emitting a
        // concept per occurrence is what turned 37 dose columns into 37 questions.
        for (const g of section.repeating_groups ?? []) {
            const c = repetitionConcept(section, ctx, g, seen);
            if (c) concepts.push(c);
        }

        // ── ordinary section: scalar / choice / boolean / conditional + upload(s) from static text ──
        // A section's prose is read CLAUSE by clause. A consent page carries one commitment per
        // sentence, and a parent cannot meaningfully accept seven of them as a single checkbox.
        for (const clause of documentRequestClauses(section.static_text)) {
            const ckey = `requirement.upload.${normalizeKey(clause.key).slice(0, 48)}`;
            if (seen.has(ckey)) continue;
            seen.add(ckey);
            concepts.push({
                contract_version: DISCOVERY_CONTRACT_VERSION,
                id: conceptId(section.page, section.section_key, `upload_${normalizeKey(clause.key).slice(0, 32)}`),
                kind: "upload_requirement",
                label: clause.text,
                concept_key: ckey,
                subject: ctx.subject === "internal" ? "internal" : "child",
                cardinality: "single",
                requirement_type: "upload",
                source: sourceRef(section, [clause.text]),
                confidence: conf("review", ["a sentence in this section asks for a document to be supplied"]),
                explanation: "A document-upload requirement, named from the sentence that asks for it — confirm the document type and responsibility in Packet Composition.",
            });
        }

        for (const clause of acknowledgementClauses(section.static_text)) {
            const ckey = `requirement.acknowledgement.${normalizeKey(clause.key).slice(0, 48)}`;
            if (seen.has(ckey)) continue;
            seen.add(ckey);
            concepts.push({
                contract_version: DISCOVERY_CONTRACT_VERSION,
                id: conceptId(section.page, section.section_key, `ack_${normalizeKey(clause.key).slice(0, 32)}`),
                kind: "acknowledgement",
                label: clause.text,
                concept_key: ckey,
                subject: ctx.subject === "internal" ? "internal" : "household",
                cardinality: "single",
                requirement_type: "acknowledgement",
                source: sourceRef(section, [clause.text]),
                confidence: conf("high", ["first-person consent language in this section's prose"]),
                explanation: "One commitment the participant makes, kept separate from the others on the page so it can be given or withheld on its own.",
            });
        }

        for (const f of section.fields) {
            // An occurrence inside a repeating structure is not its own fact.
            if (f.repeat_group_id) continue;
            const c = scalarConcept(section, ctx, f, seen);
            if (c) concepts.push(c);
        }
    }

    // ── collapse relationship buckets into one concept per role ──
    for (const [role, sects] of relBuckets) {
        const first = sects[0];
        const gathered = sects.flatMap((s) => s.fields.map((f) => f.label));
        // Label comes from the definition; a configured role is never rendered as a raw key.
        const def = relationshipDefinitionForRole(role);
        const label = def?.discovery_group_label ?? def?.label ?? role;
        concepts.push({
            contract_version: DISCOVERY_CONTRACT_VERSION,
            id: conceptId(first.page, `role_${role}`, "relationship"),
            kind: "relationship_group",
            label,
            concept_key: `relationship.${role}`,
            subject: "person",
            cardinality: "multiple",
            relationship_role: role,
            relationship_scope: "child",
            source: sourceRef(first, [...new Set(gathered)]),
            confidence: conf("high", [
                `${sects.length} repeated person block(s) with identity + relationship-to-child`,
                `operational role: ${role}`,
            ]),
            explanation: `Classified as a child-scoped ${label.toLowerCase()} relationship because the section repeats person identity, relationship-to-child, and contact fields — modeled as a relationship, not flat text fields.`,
        });
    }

    return concepts;
}

/**
 * One repeating structure → one concept.
 *
 * A grouped set of checkboxes is a CHOICE, expressed in the vocabulary that already exists — the
 * options are the member labels. A repeated value or a repeated record needs its own kind, because
 * neither is a scalar and neither is a person relationship; what the operator decides is how the
 * collection is stored, once, rather than how each occurrence is stored.
 */
function repetitionConcept(
    section: SemanticSection,
    ctx: SectionContext,
    group: NonNullable<SemanticSection["repeating_groups"]>[number],
    seen: Set<string>
): BusinessConceptCandidate | null {
    const subject: ConceptSubject = ctx.subject === "internal" ? "internal" : ctx.subject;
    const slug = normalizeKey(group.label).slice(0, 40) || group.id.replace(/[^a-z0-9]+/gi, "_");
    const concept_key = `${subject}.${slug}`;
    if (seen.has(concept_key)) return null;
    seen.add(concept_key);

    const repetition = {
        instances: group.instances,
        member_labels: group.member_labels,
        member_names: group.member_names,
        item_types: group.item_types,
        group_id: group.id,
    };
    const base = {
        contract_version: DISCOVERY_CONTRACT_VERSION,
        label: group.label,
        concept_key,
        subject,
        repetition,
        source: sourceRef(section, group.member_labels),
    };

    if (group.kind === "choice_group") {
        return {
            ...base,
            id: conceptId(section.page, section.section_key, `choice_group_${slug}`),
            kind: "choice_field",
            cardinality: "single",
            suggested_data_type: "multiselect",
            options: group.member_labels,
            confidence: conf(group.instances >= 3 ? "review" : "attention", group.signals),
            explanation: `${group.instances} aligned checkboxes read as the options of ONE question — confirm the wording and whether more than one may be chosen.`,
        };
    }

    if (group.kind === "value_series") {
        return {
            ...base,
            id: conceptId(section.page, section.section_key, `series_${slug}`),
            kind: "value_series",
            cardinality: "multiple",
            suggested_data_type: group.item_types[0] ?? "text",
            confidence: conf("review", group.signals),
            explanation: `The document writes this ${group.item_types[0] ?? "value"} ${group.instances} times across one row. That is ONE fact with ${group.instances} occurrences — a schedule — not ${group.instances} separate questions.`,
        };
    }

    return {
        ...base,
        id: conceptId(section.page, section.section_key, `records_${slug}`),
        kind: "repeating_record",
        cardinality: "multiple",
        suggested_data_type: "text",
        confidence: conf("review", group.signals),
        explanation: `A table of ${group.instances} blank rows, each collecting ${group.item_types.join(" + ")}. One repeatable collection, not ${group.member_names.length} questions.`,
    };
}

function scalarConcept(
    section: SemanticSection,
    ctx: SectionContext,
    f: SemanticField,
    seen: Set<string>
): BusinessConceptCandidate | null {
    // choice
    if (f.role === "choice_field") {
        return {
            contract_version: DISCOVERY_CONTRACT_VERSION,
            id: conceptId(section.page, section.section_key, `choice_${f.id.split(":").pop()}`),
            kind: "choice_field",
            label: f.label,
            concept_key: `${ctx.subject}.${f.id.split(":").pop()}`,
            subject: ctx.subject === "internal" ? "internal" : ctx.subject,
            cardinality: "single",
            suggested_data_type: "select",
            ...(f.options && f.options.length ? { options: f.options } : {}),
            source: sourceRef(section, [f.label]),
            confidence: conf(f.options && f.options.length ? "high" : "review", [`single-choice field with ${f.options?.length ?? 0} option(s)`]),
            explanation: `A single-choice field${f.options?.length ? ` with ${f.options.length} options` : ""} — proposed as a select field (add/confirm options in the builder).`,
        };
    }
    // yes/no
    if (f.role === "yes_no_question") {
        return {
            contract_version: DISCOVERY_CONTRACT_VERSION,
            id: conceptId(section.page, section.section_key, `bool_${f.id.split(":").pop()}`),
            kind: "boolean_status",
            label: f.label,
            concept_key: `${ctx.subject}.${f.id.split(":").pop()}`,
            subject: ctx.subject === "internal" ? "internal" : ctx.subject,
            cardinality: "single",
            suggested_data_type: "boolean",
            source: sourceRef(section, [f.label]),
            confidence: conf("high", ["Yes / No question"]),
            explanation: "A Yes / No status question.",
        };
    }
    // conditional explanation
    if (f.role === "conditional_explanation") {
        return {
            contract_version: DISCOVERY_CONTRACT_VERSION,
            id: conceptId(section.page, section.section_key, `cond_${f.id.split(":").pop()}`),
            kind: "conditional_explanation",
            label: f.label,
            concept_key: `${ctx.subject}.${f.id.split(":").pop()}`,
            subject: ctx.subject === "internal" ? "internal" : ctx.subject,
            cardinality: "single",
            suggested_data_type: "text",
            source: sourceRef(section, [f.label]),
            confidence: conf("review", ["free-text explanation conditional on a Yes/No question"]),
            explanation: `A conditional explanation${f.depends_on ? ` for "${f.depends_on}"` : ""} — collected only when the related answer is yes.`,
        };
    }
    // a signature destination inside a data section — a signature responsibility all the same.
    // Before this, a signature only became a concept when the whole SECTION was a signature block,
    // so a form that puts its attestation line at the foot of a page of fields lost it entirely.
    if (f.role === "signature") {
        const internal = ctx.internal === true;
        const isUpdate = f.signature_variant === "update";
        return {
            contract_version: DISCOVERY_CONTRACT_VERSION,
            id: conceptId(section.page, section.section_key, `signature_${f.id.split(":").pop()}`),
            kind: "signature",
            label: f.label,
            concept_key: internal ? "signature.internal" : "signature.participant",
            subject: internal ? "internal" : "person",
            cardinality: "single",
            requirement_type: "signature",
            source: sourceRef(section, [f.label]),
            confidence: conf("high", [isUpdate ? "a re-sign / update signature destination on this page" : "a signature destination on this page"]),
            explanation: internal
                ? "A director/internal signature — an operator responsibility, not participant work."
                : isUpdate
                  ? "A re-sign line: signed again whenever the information above it changes, not part of the initial submission."
                  : "A participant signature responsibility.",
        };
    }

    // an upload destination — the document asks for a file here.
    if (f.role === "upload_instruction") {
        return {
            contract_version: DISCOVERY_CONTRACT_VERSION,
            id: conceptId(section.page, section.section_key, `upload_${f.id.split(":").pop()}`),
            kind: "upload_requirement",
            label: f.label,
            concept_key: `requirement.upload.${normalizeKey(f.label).slice(0, 48)}`,
            subject: ctx.subject === "internal" ? "internal" : "child",
            cardinality: "single",
            requirement_type: "upload",
            source: sourceRef(section, [f.label]),
            confidence: conf("high", ["a file destination on this page"]),
            explanation: "A document-upload requirement declared by the form itself.",
        };
    }

    // scalar informational field
    if (f.role === "informational_field") {
        const s = scalarSemantics(f.label, ctx);
        // dedup active scalars by concept_key (Child's Name appears once even if repeated)
        if (seen.has(s.concept_key)) return null;
        seen.add(s.concept_key);
        return {
            contract_version: DISCOVERY_CONTRACT_VERSION,
            id: conceptId(section.page, section.section_key, `field_${f.id.split(":").pop()}`),
            kind: "scalar_field",
            label: f.label,
            concept_key: s.concept_key,
            subject: s.subject,
            cardinality: "single",
            suggested_data_type: f.data_type,
            source: sourceRef(section, [f.label]),
            confidence: conf(s.band, s.signals),
            explanation: `Represents ${labelForKey(s.concept_key)} — proposed for matching against Alloy's ${s.subject} model.`,
        };
    }
    return null;
}

function labelForKey(key: string): string {
    const map: Record<string, string> = {
        "child.date_of_birth": "the child's date of birth",
        "child.name": "the child's name",
        "child.nickname": "the child's nickname",
        "child.allergies": "the child's allergies",
        "person.email": "a contact email",
        "person.phone": "a contact phone number",
        "person.name": "a person's name",
        "household.address": "a household address",
        "relationship.relationship_type": "a relationship to the child",
    };
    return map[key] ?? "collected information";
}
