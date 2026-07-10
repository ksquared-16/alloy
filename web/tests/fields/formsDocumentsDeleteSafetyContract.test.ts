import { describe, expect, it } from "vitest";

/**
 * Delete-safety contract — Forms / Documents are known reference consumers of field_definitions.
 * Full cross-consumer schema reference indexing is deferred to a later platform pass.
 *
 * @see docs/sprints/08_2026/forms-documents-field-platform-adoption.md
 */
describe("formsDocuments delete-safety contract", () => {
    it("documents that form schemas reference field_definitions bindings without delete-safety scan", () => {
        const knownReferenceConsumers = ["forms_documents", "business_process_lifecycle", "queue_row_layout"];
        expect(knownReferenceConsumers).toContain("forms_documents");
        // TODO(platform): index form_definition_versions.schema_json field_source refs for delete-safety.
    });
});
