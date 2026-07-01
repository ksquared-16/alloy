import { describe, expect, it } from "vitest";

import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import {
    addFieldToBlock,
    createDefaultEditorConfig,
    editorConfigToRuntimeConfig,
    resolveEditorConfigFromDoc,
} from "@/lib/layout/queueRecordLayoutEditorModel";

describe("queueRecordLayoutEditorModel v3", () => {
    it("creates default lead layout with scoped columns", () => {
        const editor = createDefaultEditorConfig(false);
        expect(editor.version).toBe(3);
        expect(editor.columns.length).toBeGreaterThanOrEqual(4);
        expect(editor.columns[0]?.scope.type).toBe("main_record");
        expect(editor.fixedControls.actionsMenu).toBe(true);
    });

    it("preserves v3 through editorConfigToRuntimeConfig", () => {
        const editor = createDefaultEditorConfig(false);
        const runtime = editorConfigToRuntimeConfig(editor);
        expect(runtime.version).toBe(3);
        expect(runtime.columns[0]?.blocks.length).toBeGreaterThan(0);
    });

    it("resolves v3 saved config from metadata", () => {
        const editor = createDefaultEditorConfig(false);
        const resolved = resolveEditorConfigFromDoc(editor, false);
        expect(resolved.version).toBe(3);
        expect(resolved.columns.length).toBeGreaterThan(0);
    });

    it("adds catalog field to block without duplicate", () => {
        const catalogField: LayoutCatalogField = {
            entityKey: "opportunity",
            entityLabel: "Lead",
            fieldKey: "source",
            fieldLabel: "Source",
            fieldType: "text",
            refKey: "opportunity.source",
        };
        let editor = createDefaultEditorConfig(false);
        const col = editor.columns[0]!;
        const block = col.blocks[0]!;
        expect(block.type).not.toBe("widget");
        const before = block.type === "field_group" || block.type === "repeated_record_block" ? block.fields.length : 0;
        editor = addFieldToBlock(editor, col.id, block.id, catalogField);
        const afterBlock = editor.columns[0]!.blocks[0]!;
        const after = afterBlock.type === "field_group" || afterBlock.type === "repeated_record_block" ? afterBlock.fields.length : 0;
        expect(after).toBe(before + 1);
        editor = addFieldToBlock(editor, col.id, block.id, catalogField);
        const dupBlock = editor.columns[0]!.blocks[0]!;
        const dupLen = dupBlock.type === "field_group" || dupBlock.type === "repeated_record_block" ? dupBlock.fields.length : 0;
        expect(dupLen).toBe(before + 1);
    });
});
