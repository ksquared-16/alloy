import { describe, expect, it } from "vitest";
import {
    DEFAULT_PROCESSING_FOLDERS,
    mergeFolderDefaults,
    slugifyFolderId,
    sortFolders,
    visibleFoldersForScope,
    type ProcessingFolderDefinition,
} from "@/lib/pos/processingFolderModel";
import { formOrigin, formPublishStatus, formMatchesStudioFolder, readAdminCategory } from "@/lib/pos/processingFolderConfig";

describe("processingFolderModel", () => {
    it("sorts folders by order then label", () => {
        const sorted = sortFolders([
            { id: "b", label: "B", scopes: ["form"], order: 20, isSystem: false },
            { id: "a", label: "A", scopes: ["form"], order: 10, isSystem: false },
        ]);
        expect(sorted.map((f) => f.id)).toEqual(["a", "b"]);
    });

    it("filters visible folders by scope and hidden flag", () => {
        const folders: ProcessingFolderDefinition[] = [
            ...DEFAULT_PROCESSING_FOLDERS,
            { id: "hidden", label: "Hidden", scopes: ["form"], order: 999, isSystem: false, hidden: true },
        ];
        const visible = visibleFoldersForScope(folders, "form");
        expect(visible.some((f) => f.id === "hidden")).toBe(false);
        expect(visible.some((f) => f.id === "generated")).toBe(true);
    });

    it("mergeFolderDefaults preserves system folder invariants", () => {
        const merged = mergeFolderDefaults([
            { id: "generated", label: "Custom generated label", scopes: ["form"], order: 10, isSystem: true },
        ]);
        const generated = merged.find((f) => f.id === "generated");
        expect(generated?.label).toBe("Custom generated label");
        expect(generated?.isSystem).toBe(true);
    });

    it("slugifyFolderId produces stable ids", () => {
        expect(slugifyFolderId("Medical Records")).toBe("medical_records");
    });
});

describe("processingFolderConfig helpers", () => {
    it("reads admin_category from metadata", () => {
        expect(readAdminCategory({ admin_category: "Medical" })).toBe("medical");
    });

    it("matches generated forms to generated folder", () => {
        const form = { name: "Test", key: "test", metadata: { origin: "document" }, has_published_version: false };
        expect(formOrigin(form)).toBe("generated");
        expect(formMatchesStudioFolder(form, "generated")).toBe(true);
        expect(formMatchesStudioFolder(form, "manual")).toBe(false);
    });

    it("files a form generated from an imported document as generated", () => {
        /*
         * THE METADATA A REAL GENERATED FORM CARRIES — copied from the row `form-draft/create`
         * wrote for the imported "Northwind Enrollment Application v2" packet. The test above
         * passed against `origin: "document"`, a shape no writer in the product ever produced,
         * so the folder read 0 while a real generated form sat in "Manual forms".
         */
        const form = {
            name: "Enrollment Packet",
            key: "enrollment_packet",
            metadata: {
                source: "document_form_draft",
                field_count: 23,
                source_case_id: "d10c8c42-28de-43bc-ab51-80333f23011b",
                source_document_id: "1839abfb-9c36-4e1b-a76d-23dadddb46b9",
                source_document_title: "Enrollment Packet",
            },
            has_published_version: false,
        };
        expect(formOrigin(form)).toBe("generated");
        expect(formMatchesStudioFolder(form, "generated")).toBe(true);
        expect(formMatchesStudioFolder(form, "manual")).toBe(false);
        // It is still an unpublished draft, and still reads as Enrollment by keyword.
        expect(formMatchesStudioFolder(form, "draft")).toBe(true);
        expect(formMatchesStudioFolder(form, "published")).toBe(false);
        expect(formMatchesStudioFolder(form, "enrollment")).toBe(true);
    });

    it("still files a hand-built Studio form as manual", () => {
        // The fix must widen "generated", not swallow everything.
        const form = { name: "Consent", key: "consent", metadata: { source: "slice2-cert" }, has_published_version: true };
        expect(formOrigin(form)).toBe("manual");
        expect(formMatchesStudioFolder(form, "generated")).toBe(false);
        expect(formMatchesStudioFolder(form, "manual")).toBe(true);
    });

    it("distinguishes draft vs published", () => {
        expect(formPublishStatus({ has_published_version: true })).toBe("published");
        expect(formPublishStatus({ has_published_version: false })).toBe("draft");
    });
});
