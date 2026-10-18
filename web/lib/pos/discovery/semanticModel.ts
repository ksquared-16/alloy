/**
 * POS-FP16 — Layer 2 → Layer 3: physical document structure → semantic document model.
 *
 * The native-layout detector (Layer 2) already produces sections with a geometric disposition
 * (fields / static / acknowledgement / signature / upload / output-copy) and per-field types. This
 * adapter types that as the explicit SemanticDocumentModel contract with stable ids + source
 * lineage, and assigns each field a semantic ROLE — decoupling the semantic view from the physical
 * detector object so downstream layers never reach back into detector internals.
 *
 * Pure + deterministic. Adds no new inference beyond role labelling; the heavy semantic decisions
 * (disposition, static, duplicate) were already made geometrically in Layer 2.
 */

import type { DocumentStructureCandidate } from "@/lib/pos/processingCase/structure/types";
import type { SectionDisposition } from "@/lib/pos/processingCase/formDraft/sectionDisposition";
import {
    detectRelationshipDefinitionForTitle,
    relationshipDetectionPattern,
    type RelationshipDefinition,
} from "@/lib/fields/relationship/relationshipDefinitions";
import {
    DISCOVERY_CONTRACT_VERSION,
    type SemanticBlockRole,
    type SemanticDocumentModel,
    type SemanticField,
    type SemanticSection,
} from "./contracts";

/** Normalize a title/label into a stable key (lineage identity — never a raw label). */
export function normalizeKey(s: string): string {
    return s
        .toLowerCase()
        .replace(/\(.*?\)/g, " ") // drop parentheticals like "(Classroom Copy)"
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

// DERIVED from the canonical relationship definitions — a configured role becomes detectable the
// moment its definition row exists. Detection used to be a hardcoded regex here, which made a new
// role undetectable and its (already generic) apply path unreachable.
// No trailing \b so plurals ("Emergency Contacts", "Guardians") still match.
// @see docs/platform/core/data/relationship-model.md
const PERSON_GROUP_RE = relationshipDetectionPattern();

function fieldRole(label: string, dataType: string, disposition: SectionDisposition): SemanticBlockRole {
    if (dataType === "signature") return "signature";
    if (dataType === "file_ref" || dataType === "file") return "upload_instruction";
    if (/if\s+(?:yes|no)\b.*\bexplain\b/i.test(label)) return "conditional_explanation";
    if (dataType === "boolean" || dataType === "checkbox") return "yes_no_question";
    if (dataType === "select" || dataType === "multiselect") return "choice_field";
    if (disposition === "acknowledgement") return "acknowledgement";
    if (disposition === "static_reference" || disposition === "generated") return "static_content";
    return "informational_field";
}

export function buildSemanticModel(structure: DocumentStructureCandidate): SemanticDocumentModel {
    // Repeating structures are detected per page; attach each to the section that owns that page.
    const groupsByPage = new Map<number, NonNullable<DocumentStructureCandidate["repeating_groups"]>>();
    for (const g of structure.repeating_groups ?? []) {
        const arr = groupsByPage.get(g.page) ?? [];
        arr.push(g);
        groupsByPage.set(g.page, arr);
    }

    const sections: SemanticSection[] = structure.sections.map((sec) => {
        const disposition: SectionDisposition = sec.disposition ?? "fields";
        const section_key = normalizeKey(sec.title || "section");
        const page = sec.page ?? 1;
        // A repeated person GROUP only when it's a data-collection section — a signature/consent
        // section that merely mentions "guardian" (e.g. "Parent/Guardian Signatures") is NOT a group.
        //
        // Nor is an EXECUTION BLOCK. "Parent Handbook Acknowledgement" contains the word parent and
        // three fields — parent name, student name, date — but they exist to execute an agreement,
        // not to describe a person. Treating them as a guardian roster made those three destinations
        // claimed twice: once as the facts they are, once as members of a relationship that isn't
        // there. A section holding a signature is an execution, whatever its heading says.
        const holdsSignature = sec.fields.some((f) => f.suggested_type === "signature");
        const repeated_person =
            disposition === "fields" &&
            !holdsSignature &&
            PERSON_GROUP_RE.test(sec.title || "") &&
            !/^contact\s+information/i.test(sec.title || "");
        const output_copy = sec.duplicate === true;

        const fields: SemanticField[] = sec.fields.map((f) => {
            const role = fieldRole(f.label, f.suggested_type, disposition);
            return {
                id: `${section_key}:${normalizeKey(f.label)}`,
                label: f.label,
                role,
                ...(f.repeat_group_id ? { repeat_group_id: f.repeat_group_id } : {}),
                ...(f.evidence ? { evidence: f.evidence } : {}),
                ...(typeof f.page === "number" ? { page: f.page } : {}),
                ...(f.signature_variant ? { signature_variant: f.signature_variant } : {}),
                data_type: f.suggested_type,
                ...(f.options && f.options.length ? { options: f.options } : {}),
                ...(role === "conditional_explanation" ? { depends_on: f.label.replace(/\s*—\s*if\s+yes.*$/i, "").trim() } : {}),
            };
        });

        return {
            section_key,
            title: sec.title,
            page,
            disposition,
            repeated_person,
            output_copy,
            static_text: sec.static_text ?? null,
            fields,
            ...(groupsByPage.get(page)?.length ? { repeating_groups: groupsByPage.get(page) } : {}),
        };
    });

    const warnings = [...structure.warnings];
    return {
        contract_version: DISCOVERY_CONTRACT_VERSION,
        sections: separateLabelNamedRelationships(sections, warnings),
        warnings,
    };
}

/** A label that asks for something ABOUT a person, so a relationship word in it names whose. */
const PERSON_ATTRIBUTE_RE = /\b(names?|phones?|telephones?|mobile|cell|e-?mails?|address(es)?|relationship)\b/i;
/** A contact line that names no one ("Phone", "Email", "Name"). */
const PARTYLESS_LINE_RE = /^\s*(full\s+|first\s+|last\s+)?(name|phone|telephone|mobile|cell|e-?mail|address)( number)?\s*:?\s*$/i;

/**
 * RELATIONSHIPS ON A DOCUMENT READ AS ONE SECTION.
 *
 * Relationship discovery groups people by the SECTION heading ("Emergency Contacts"). A PDF whose
 * extraction yields a single generic section ("Form fields", "Detected fields") has no such heading,
 * so every emergency contact, pick-up and physician line was read as a loose scalar and no
 * relationship was proposed — with no warning.
 *
 * A line can still name its own relationship ("Emergency Contact Phone", "Physician Name"). Such
 * lines are moved into a derived section titled by the CANONICAL definition, so the definition-
 * driven discovery downstream proposes the relationship exactly as it would for a real heading.
 * Guardian lines stay where they are (they bind to the guardian's own facts). A line that names no
 * one ("Phone") is never assigned to anyone here: it stays put, and the document carries a warning
 * that it needs a person to decide.
 */
export function separateLabelNamedRelationships(sections: SemanticSection[], warnings: string[]): SemanticSection[] {
    const out: SemanticSection[] = [];
    for (const section of sections) {
        if (section.disposition !== "fields" || section.output_copy || detectRelationshipDefinitionForTitle(section.title)) {
            out.push(section);
            continue;
        }
        const byDefinition = new Map<string, { def: RelationshipDefinition; fields: SemanticField[] }>();
        const kept: SemanticField[] = [];
        for (const f of section.fields) {
            const def = !f.repeat_group_id && PERSON_ATTRIBUTE_RE.test(f.label) ? detectRelationshipDefinitionForTitle(f.label) : undefined;
            if (def && def.operational_role_key !== "guardian") {
                const entry = byDefinition.get(def.definition_key) ?? { def, fields: [] };
                entry.fields.push(f);
                byDefinition.set(def.definition_key, entry);
            } else {
                kept.push(f);
            }
        }
        if (byDefinition.size === 0) {
            out.push(section);
        } else {
            out.push({ ...section, fields: kept });
            for (const { def, fields } of byDefinition.values()) {
                // The derived heading must be one the definition itself recognises, or downstream
                // classification would not see the relationship it names ("Physicians" is not matched by
                // the word-bounded "physician" pattern; the line that named it always is).
                const title = detectRelationshipDefinitionForTitle(def.label)?.definition_key === def.definition_key ? def.label : fields[0]!.label;
                out.push({
                    section_key: `${section.section_key}__${def.definition_key}`,
                    title,
                    page: section.page,
                    disposition: "fields",
                    repeated_person: true,
                    output_copy: false,
                    static_text: null,
                    fields,
                });
            }
            warnings.push(
                `"${section.title || "Untitled section"}" was read without separate headings for other people; ` +
                    `${[...byDefinition.values()].map((v) => v.def.label).join(", ")} were identified from their own labels.`,
            );
        }
        const partyless = kept.filter((f) => PARTYLESS_LINE_RE.test(f.label));
        if (partyless.length > 0 && !detectRelationshipDefinitionForTitle(section.title)) {
            warnings.push(
                `"${section.title || "Untitled section"}" has lines that name no person (${[...new Set(partyless.map((f) => f.label.trim()))].join(", ")}); ` +
                    "Alloy could not tell whose they are, so they are left for review rather than assigned to a parent.",
            );
        }
    }
    return out;
}
