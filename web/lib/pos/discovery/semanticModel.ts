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
import { relationshipDetectionPattern } from "@/lib/fields/relationship/relationshipDefinitions";
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
    const sections: SemanticSection[] = structure.sections.map((sec) => {
        const disposition: SectionDisposition = sec.disposition ?? "fields";
        const section_key = normalizeKey(sec.title || "section");
        const page = sec.page ?? 1;
        // A repeated person GROUP only when it's a data-collection section — a signature/consent
        // section that merely mentions "guardian" (e.g. "Parent/Guardian Signatures") is NOT a group.
        const repeated_person =
            disposition === "fields" &&
            PERSON_GROUP_RE.test(sec.title || "") &&
            !/^contact\s+information/i.test(sec.title || "");
        const output_copy = sec.duplicate === true;

        const fields: SemanticField[] = sec.fields.map((f) => {
            const role = fieldRole(f.label, f.suggested_type, disposition);
            return {
                id: `${section_key}:${normalizeKey(f.label)}`,
                label: f.label,
                role,
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
        };
    });

    return {
        contract_version: DISCOVERY_CONTRACT_VERSION,
        sections,
        warnings: [...structure.warnings],
    };
}
