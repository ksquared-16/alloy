/**
 * POS-FP12 — Document → Form Template (Workflow A) draft types.
 *
 * This recreates a document's STRUCTURE as a draft Alloy form (title, sections,
 * fields, types, required, basic layout) for the operator to review and then edit in
 * the existing Forms builder. It is NOT data extraction (Workflow B) and creates NO
 * form, publishes nothing, writes no records.
 *
 * The draft is shaped to mirror `FormSchemaV1` (flat `fields[]` + `sections` that
 * reference field ids) so it converts cleanly into the real schema — see
 * `draftFormToFormSchemaV1.ts`. Only field types that are valid WITHOUT extra config
 * are used (no `select`/`multiselect`, which need options) so the converted schema
 * always validates.
 */

/** Field types we draft. A subset of FormFieldType that needs no extra config to be valid. */
/**
 * Field types we draft.
 *
 * `select` / `multiselect` are here because a source can DECLARE its choices — a hosted form states
 * them outright, and an AcroForm dropdown carries them in the widget. Drafting those as text was the
 * one place a web source's best evidence was thrown away: a closed choice became free text, and the
 * requiredness and options the author wrote were lost between extraction and publish. A choice is
 * only drafted as a choice when the source actually supplied options — options are never invented.
 */
export type DraftFormFieldType = "text" | "number" | "date" | "boolean" | "select" | "multiselect" | "file_ref" | "signature";

export type DraftFieldConfidence = "high" | "medium" | "low";

export interface DraftFormField {
    id: string;
    label: string;
    type: DraftFormFieldType;
    required: boolean;
    /** Basic layout hint: "half" pairs with the next half into a 2-up row (FormSchemaV1 layout_width). */
    layout_width?: "full" | "half" | "third" | "quarter";
    description?: string;
    confidence: DraftFieldConfidence;
    /** Where this field came from in the source document (provenance, not promoted). */
    evidence?: string;
    /** PDF AcroForm provenance (when the field came from a real widget): page + bbox. */
    pdf_field_name?: string;
    page?: number;
    bbox?: [number, number, number, number];
    /**
     * Allowed choices the SOURCE declared. A hosted form states its options outright, unlike a PDF
     * where they must be guessed, and losing them at the draft would throw away the best evidence a
     * web source gives. `DraftFormFieldType` has no `select` yet, so a choice still drafts as text
     * and the options ride alongside until the builder can publish them.
     */
    options?: string[];
    /** Validation the SOURCE declared. Carried so a published form cannot claim fidelity it lost. */
    validate?: { pattern?: string; min?: number; max?: number; min_length?: number; max_length?: number };
    /** Canonical binding (operator-reviewed or auto-suggested) — persisted to the form. */
    field_source?: import("@/lib/forms/schema").FormFieldSource;
    /**
     * Set when this flat question was REPLACED by a collection group (POS-FP17 projection): the id of
     * the `DraftCollectionGroup` that now collects it. Suppressed questions are excluded from
     * participant execution (they never reach the generated form) but are RETAINED on the draft as
     * source evidence for review and audit history.
     */
    suppressed_by_collection?: string;
}

/** One nested question inside a projected collection group. */
export interface DraftCollectionNestedField {
    id: string;
    label: string;
    type: DraftFormFieldType;
    required: boolean;
    /**
     * Canonical binding for the collected item (a Person field). Absent means a form-only nested
     * response — collected per instance but not written to a canonical field.
     */
    field_source?: import("@/lib/forms/schema").FormFieldSource;
    /** Source lineage: the flat draft question ids this nested field replaces. */
    source_field_ids: string[];
}

/**
 * A relationship concept projected into ONE canonical collection-bound group (POS-FP17).
 *
 * Every binding value is DERIVED from the canonical Relationship Definition — never hand-authored
 * per role. The repeated #1/#2 occurrences in the source document are evidence of CARDINALITY and
 * initial instances, not separate field bundles, so they collapse into a single repeatable group.
 *
 * Note the split of authority: only `collection_provider_ref` travels onto the published form
 * (`FormGroupCollectionBinding` is strict and carries provider/entity/alias only). Role, command and
 * scope are re-derived SERVER-SIDE from the provider ref at submission and execution time, so a
 * client can never assert them. The copies held here are lineage for review/audit, not authority.
 *
 * @see docs/platform/core/data/relationship-model.md
 */
export interface DraftCollectionGroup {
    id: string;
    label: string;
    /** Draft section this collection anchors to (the section its source questions came from). */
    section_id: string;

    // ── definition-derived binding ──
    /** Stable definition key — the row that produced this group. */
    relationship_definition_key: string;
    collection_provider_ref: string;
    item_entity_type: string;
    iteration_alias?: string;
    operational_role_key: string;
    relationship_scope: "child" | "household";
    cardinality: "one" | "many";
    /** Scopes the definition permits at apply time. */
    supported_scopes: readonly string[];
    default_scope: string;
    create_link_policy: string;
    apply_command_key: string;
    responsibility_default?: string;

    /** Nested questions collected per instance, derived from the definition's nested_field_keys. */
    nested_fields: DraftCollectionNestedField[];

    // ── lineage (preserved through apply → publish → reopen) ──
    /** Discovery concept this group came from. */
    source_concept_id: string;
    /** Stable proposal identity — used to keep projection idempotent across retries. */
    source_proposal_identity: string;
    /** Source section/block titles the concept spanned. */
    source_section_titles: string[];
    /** Original question labels this group replaced (audit evidence). */
    source_labels: string[];
    /** Repeated occurrences observed in the document — evidence of cardinality. */
    observed_instance_count: number;
    confidence?: { band: string; percent: number };
    decision_state?: string;
}

/**
 * A document a CLAUSE asked for, approved by the operator.
 *
 * A section's `disposition` says what the whole section is. It cannot say "this is a consent page
 * that also, in its fourth sentence, asks you to bring an immunization record" — and that sentence is
 * exactly what the real packet is made of. Typing the whole section `upload` to carry one clause
 * would turn a consent page into an upload page and lose every other thing it does.
 *
 * So the clause rides beside the section instead of redefining it. It survives regardless of the
 * section's disposition, because a static/acknowledgement section drops field prompts and this is
 * not a prompt the source drew — it is an obligation the source stated.
 */
export interface DraftClauseUpload {
    /** Stable field id in the published form — the participant-facing control. */
    id: string;
    /** The approved obligation this came from (proposal identity), for lineage. */
    obligation_id: string;
    /** The discovery concept id — the clause's own identity in the source. */
    concept_id: string;
    /** Short participant-facing label. */
    label: string;
    /** The clause's own wording, kept verbatim so the document's meaning is never paraphrased away. */
    description: string;
    required: boolean;
    /** The canonical document classification, when discovery recognised one. Never invented. */
    document_type?: string;
}

export interface DraftFormSection {
    id: string;
    title: string;
    description?: string;
    /** Ordered ids into the flat `fields[]` (mirrors FormSchemaV1 section.field_ids). */
    field_ids: string[];
    /**
     * Operator-classified intent of this section (Phase 7 §3). Defaults to a recommendation from
     * `recommendSectionDisposition`; the operator confirms/overrides before publish. Omitted === "fields".
     */
    disposition?: import("./sectionDisposition").SectionDisposition;
    /**
     * Approved clause-level document obligations anchored to this section. Populated by
     * `applyDiscovery` from APPROVED upload proposals; never inferred from prose here.
     */
    clause_uploads?: DraftClauseUpload[];
    /**
     * Preserved instructional / consent / signature prose that field-extraction alone would discard.
     * Carried into the published form as a `text_block` so the document's meaning is never lost.
     */
    static_text?: string | null;
}

/** Debug visibility into what Alloy saw — so operators can understand zero-field results. */
export interface FormDraftDiagnostics {
    extracted_text_length: number;
    extracted_text_preview: string;
    section_count: number;
    field_count: number;
}

/** What lands in `processing_cases.metadata.form_draft_preview`. Preview only — no form created. */
export interface StoredFormDraftPreview {
    /** Operator-confirmed native form name — separate from source document display title. */
    generated_form_name?: string | null;
    source_document_id: string | null;
    title: string;
    /** True when the title was derived from real document text (vs filename/classification fallback). */
    title_from_text: boolean;
    extracted_text_available: boolean;
    sections: DraftFormSection[];
    fields: DraftFormField[];
    warnings: string[];
    diagnostics: FormDraftDiagnostics;
    /** PDF page dimensions + text context for the review schematic (AcroForm drafts only). */
    pdf_pages?: import("../structure/pdfAcroForm").PdfPageContext[];
    /**
     * OCR provenance when the draft was built from OCR text (scanned / image source). Preserved into the
     * published form for source→OCR→correction→published lineage, and drives the OCR-derived review state.
     */
    ocr?: {
        derived: true;
        method: string;
        /** Overall confidence 0–100. */
        confidence: number;
        low_confidence: boolean;
        /** Whether OCR read a directly-uploaded image or a rasterized scanned PDF. */
        source_kind?: "image" | "scanned_pdf";
    } | null;
    /**
     * Configuration Discovery (POS-FP16): the concept-level operating-model proposal derived from the
     * native-layout structure — business concepts + governed configuration proposals + summary. The
     * concept-first review renders this; Forms is one consumer of the approved concepts. Present only
     * for native-layout drafts. Operator decisions are layered on separately (never overwrite reruns).
     */
    configuration_discovery?: import("@/lib/pos/discovery/contracts").ConfigurationDiscoveryResult;
    /**
     * Relationship concepts projected into canonical collection-bound groups (POS-FP17). Produced by
     * apply from accepted `relationship_binding` proposals; consumed by `draftFormToFormSchemaV1` to
     * emit real repeatable groups. Must be preserved by any save path (like `configuration_discovery`).
     */
    collections?: DraftCollectionGroup[];
    generated_at: string;
    generator_version: string;
}
