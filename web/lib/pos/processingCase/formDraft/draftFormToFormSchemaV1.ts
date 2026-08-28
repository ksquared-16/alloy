/**
 * POS-FP12 — convert a draft form preview into a real `FormSchemaV1`.
 *
 * Pure. Proves Workflow A is "real": the draft maps cleanly onto the existing form
 * schema (flat fields + sections referencing field ids), with NO new form system. The
 * draft only uses config-free field types, so the result validates against the live
 * zod schema (`validateFormSchema`) — see the tests. This does NOT create or publish a
 * form; it just produces the schema the Forms builder would load.
 */

import type { FormField, FormSchemaV1, FormSection } from "@/lib/forms/schema";
import { suggestFieldBinding } from "@/lib/forms/canonicalBindingSuggestions";
import type { DraftCollectionGroup, DraftFormField, StoredFormDraftPreview } from "./types";
import {
    PROCESSING_NEEDS_DESTINATION_DESCRIPTION,
    UNRESOLVED_AT_GENERATE_EVIDENCE,
} from "./questionResolutionModel";
import type { SectionDisposition } from "./sectionDisposition";

/** Map one detected draft field to a valid FormSchemaV1 field, preserving canonical binding. */
function mapDraftField(f: DraftFormField): FormField {
    const unresolvedAtGenerate = f.evidence === UNRESOLVED_AT_GENERATE_EVIDENCE;
    // Persist canonical binding: operator-reviewed binding wins; otherwise auto-suggest
    // from the label/type so generated forms prefill + drive guided intake by default.
    const field_source = unresolvedAtGenerate
        ? undefined
        : f.field_source ?? suggestFieldBinding(f.label, f.type)?.field_source;
    const description = f.description ?? (unresolvedAtGenerate ? PROCESSING_NEEDS_DESTINATION_DESCRIPTION : undefined);
    const base = {
        id: f.id,
        label: f.label,
        required: f.required,
        ...(description ? { description } : {}),
        ...(f.layout_width ? { layout_width: f.layout_width } : {}),
        ...(field_source ? { field_source } : {}),
        // Placement without interrogation: the destination renders, the participant is not asked.
        ...(f.read_only ? { read_only: true } : {}),
        // …and, when Alloy fills it, the declaration of what fills it.
        ...(f.derived ? { derived: f.derived } : {}),
        // Source-declared validation travels onto the published field. `formValidateRulesSchema` is
        // the existing owner; nothing new is invented here.
        ...(f.validate && Object.keys(f.validate).length ? { validate: f.validate } : {}),
    };
    switch (f.type) {
        case "number":
            return { ...base, type: "number" };
        case "date":
            return { ...base, type: "date" };
        case "boolean":
            return { ...base, type: "boolean" };
        case "file_ref":
            return { ...base, type: "file_ref" };
        case "signature":
            return { ...base, type: "signature" };
        case "select":
        case "multiselect": {
            // The source DECLARED these choices. Publishing them as free text would lose the one
            // thing the author was explicit about. `static_options` is the schema's own inline-choice
            // construct — no `option_sets` row is required, and the values are the labels verbatim so
            // a submitted answer reads the way the source wrote it.
            const options = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
            if (options.length === 0) return { ...base, type: "text" };
            const seen = new Set<string>();
            const static_options = options
                .filter((o) => (seen.has(o) ? false : (seen.add(o), true)))
                .map((o) => ({ value: o, label: o }));
            return { ...base, type: f.type, static_options };
        }
        case "text":
        default:
            return { ...base, type: "text" };
    }
}

/**
 * Convert a projected relationship collection into a real repeatable, collection-bound group.
 *
 * Only `collection_provider_ref` / `iteration_entity_type` / `iteration_alias` travel onto the form —
 * `FormGroupCollectionBinding` is strict by design. Role, apply command and scope are deliberately
 * NOT carried: they are re-derived server-side from the provider ref at submission and execution
 * time, so a client can never assert them. @see docs/platform/core/data/relationship-model.md
 */
function collectionGroupToFormField(c: DraftCollectionGroup): FormField {
    return {
        id: c.id,
        type: "group",
        label: c.label,
        required: false,
        // Cardinality comes from the definition; the document's repeated occurrences are evidence of
        // how many instances to seed, not a cap.
        repeat: c.cardinality === "many" ? { min: 0 } : { min: 0, max: 1 },
        collection_binding: {
            collection_provider_ref: c.collection_provider_ref,
            iteration_entity_type: c.item_entity_type,
            ...(c.iteration_alias ? { iteration_alias: c.iteration_alias } : {}),
        },
        fields: c.nested_fields.map((n) => ({
            id: n.id,
            type: n.type === "boolean" ? "boolean" : n.type === "date" ? "date" : n.type === "number" ? "number" : "text",
            label: n.label,
            required: n.required,
            ...(n.field_source ? { field_source: n.field_source } : {}),
        })) as FormField[],
    };
}

function sectionHasType(fields: FormField[], type: FormField["type"]): boolean {
    return fields.some((f) => f.type === type);
}

/**
 * Convert a draft form preview into a real `FormSchemaV1`, honouring each section's operator-classified
 * disposition. Preserved static/consent text becomes a `text_block`; acknowledgement/upload/signature/
 * initials dispositions emit the appropriate control when the section doesn't already contain one. NO new
 * form system — every construct is an existing FormSchemaV1 field type, so the result validates.
 */
export function draftFormToFormSchemaV1(draft: StoredFormDraftPreview): FormSchemaV1 {
    const detectedById = new Map<string, FormField>();
    // Questions replaced by a projected collection group never reach participant execution. They are
    // retained on the DRAFT as source evidence, but must not ship as flat questions alongside the
    // group that now collects them (POS-FP17).
    for (const f of draft.fields) {
        if (f.suppressed_by_collection) continue;
        detectedById.set(f.id, mapDraftField(f));
    }

    // Collection groups, keyed by the draft section they anchor to, so each is emitted in place.
    const collections = draft.collections ?? [];
    const groupsBySection = new Map<string, FormField[]>();
    for (const c of collections) {
        const group = collectionGroupToFormField(c);
        const list = groupsBySection.get(c.section_id) ?? [];
        list.push(group);
        groupsBySection.set(c.section_id, list);
    }
    const emittedGroupIds = new Set<string>();

    const outFields: FormField[] = [];
    const outSections: FormSection[] = [];
    const usedIds = new Set<string>();
    let synth = 0;
    const synthId = (kind: string) => `disp_${kind}_${(synth += 1)}`;

    for (const s of draft.sections) {
        const disposition: SectionDisposition = s.disposition ?? "fields";
        const ids: string[] = [];

        // 1. Preserve instructional / consent prose as a static text_block (never dropped).
        const carriesStatic =
            disposition === "static_reference" ||
            disposition === "acknowledgement" ||
            disposition === "generated" ||
            disposition === "signature" ||
            disposition === "initials" ||
            disposition === "upload";
        if (carriesStatic && s.static_text && s.static_text.trim()) {
            const id = synthId("text");
            outFields.push({ id, type: "text_block", label: s.title || "Information", required: false, content: s.static_text.trim() });
            ids.push(id);
        }

        // 2. Keep detected fields for dispositions that still collect them.
        const keepsDetectedFields =
            disposition === "fields" || disposition === "signature" || disposition === "upload" || disposition === "generated";
        const detectedInSection: FormField[] = [];
        if (keepsDetectedFields) {
            for (const fid of s.field_ids) {
                const mapped = detectedById.get(fid);
                if (mapped) {
                    outFields.push(mapped);
                    ids.push(mapped.id);
                    usedIds.add(fid);
                    detectedInSection.push(mapped);
                }
            }
        } else {
            // Static/acknowledgement sections drop field prompts (they were prose, not inputs).
            for (const fid of s.field_ids) usedIds.add(fid);
        }

        // 2b. Approved CLAUSE-LEVEL document obligations.
        //
        // Emitted for every disposition, deliberately. A static or acknowledgement section drops the
        // field prompts the source drew — but this is not a prompt the source drew, it is an
        // obligation the source stated in a sentence, and dropping it published four discovered
        // document requirements as zero participant asks.
        //
        // Placed after the section's own content so the family reads the clause before the control
        // that satisfies it.
        for (const upload of s.clause_uploads ?? []) {
            outFields.push({
                id: upload.id,
                type: "file_ref",
                label: upload.label,
                required: upload.required,
                description: upload.description,
                ...(upload.document_type ? { document_type: upload.document_type } : {}),
            });
            ids.push(upload.id);
        }

        // 3. Emit the disposition's required control when the section doesn't already contain one.
        if (disposition === "acknowledgement") {
            const id = synthId("ack");
            outFields.push({ id, type: "boolean", label: "I acknowledge the above", required: true });
            ids.push(id);
        } else if (disposition === "upload" && !sectionHasType(detectedInSection, "file_ref") && !(s.clause_uploads ?? []).length) {
            const id = synthId("upload");
            outFields.push({ id, type: "file_ref", label: s.title || "Upload document", required: true });
            ids.push(id);
        } else if ((disposition === "signature" || disposition === "initials") && !sectionHasType(detectedInSection, "signature")) {
            const id = synthId("sig");
            outFields.push({
                id,
                type: "signature",
                label: disposition === "initials" ? s.title || "Initials" : s.title || "Signature",
                required: true,
                signature: { require_acknowledgment: disposition === "signature" },
            });
            ids.push(id);
        }

        // 4. Emit any collection group anchored to this section (POS-FP17 relationship projection).
        for (const group of groupsBySection.get(s.id) ?? []) {
            outFields.push(group);
            ids.push(group.id);
            emittedGroupIds.add(group.id);
        }

        outSections.push({ id: s.id, title: s.title, field_ids: ids });
    }

    // Safety: a group whose anchor section no longer exists still ships (never silently dropped).
    const orphanGroups: FormField[] = [];
    for (const [, groups] of groupsBySection) {
        for (const g of groups) if (!emittedGroupIds.has(g.id)) orphanGroups.push(g);
    }

    // Safety: any detected field not referenced by a section still ships (appended to the last section).
    const orphans = [
        ...draft.fields
            .filter((f) => !f.suppressed_by_collection && !usedIds.has(f.id))
            .map((f) => detectedById.get(f.id)!)
            .filter(Boolean),
        ...orphanGroups,
    ];
    if (orphans.length > 0) {
        for (const o of orphans) outFields.push(o);
        if (outSections.length > 0) {
            outSections[outSections.length - 1]!.field_ids.push(...orphans.map((o) => o.id));
        } else {
            outSections.push({ id: "section_1", title: draft.title || "Section", field_ids: orphans.map((o) => o.id) });
        }
    }

    return {
        schema_version: 1,
        title: draft.generated_form_name?.trim() || draft.title || "Untitled form",
        sections: outSections,
        fields: outFields,
    };
}
