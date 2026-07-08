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

    it("distinguishes draft vs published", () => {
        expect(formPublishStatus({ has_published_version: true })).toBe("published");
        expect(formPublishStatus({ has_published_version: false })).toBe("draft");
    });
});
