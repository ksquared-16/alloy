/**
 * Visual Layout Configuration Builder — Phase 5.13 freeform section/block validation.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { addSectionBlockItem, addSectionFieldItem } from "@/lib/layout/layoutEditorSectionComposition";
import {
    addCustomOpportunityDrawerSection,
    isLegacyInvalidBlockRefKey,
    isLegacyInvalidSectionKey,
    isValidCustomSectionKeyPattern,
    layoutDocHasRepairableGeneratedKeys,
    makeCustomBlockRefKey,
    makeCustomSectionKey,
    repairOpportunityDrawerLayoutGeneratedKeys,
    writeCustomSectionMetadata,
} from "@/lib/layout/layoutEditorGeneratedKeys";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { formatLayoutValidationErrors, prepareOpportunityDrawerLayoutDocForEditor, validateOpportunityDrawerLayoutDoc } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";

const EMAIL_FIELD: LayoutCatalogField = {
    entityKey: "person",
    entityLabel: "Person",
    fieldKey: "primary_email",
    refKey: "person.primary_email",
    fieldLabel: "Email",
    fieldType: "text",
};

function legacySectionDoc(sectionKey: string, blockRefKey = "block"): LayoutDoc {
    const doc = buildLeadDrawerDefaultDoc();
    const section: LayoutSection = {
        id: "sec-bad",
        key: sectionKey,
        title: "Bad section",
        collapsible: true,
        defaultExpanded: true,
        rows: [
            {
                id: "row-bad",
                columns: [
                    {
                        id: "col-bad",
                        width: 12,
                        items: [
                            {
                                id: "grp-bad",
                                kind: "field_group",
                                refKey: blockRefKey,
                                label: "Block",
                                rows: [{ id: "row-inner", columns: [{ id: "col-inner", width: 12, items: [] }] }],
                            },
                        ],
                    },
                ],
            },
        ],
    };
    return { ...doc, sections: [...doc.sections, section] };
}

function validCustomSectionWithBlockDoc(): LayoutDoc {
    let doc = addCustomOpportunityDrawerSection(buildLeadDrawerDefaultDoc(), { title: "My custom", zone: "main" });
    const sectionKey = doc.sections[doc.sections.length - 1]!.key;
    const block = addSectionBlockItem(doc, sectionKey, 0, 0, {
        title: "Notes block",
        blockType: "custom_layout_block",
        dataContext: "lead",
    });
    if (!block.ok) throw new Error(block.error);
    return block.doc;
}

describe("custom section keys", () => {
    it("accepts custom section with valid key and metadata", () => {
        let doc = addCustomOpportunityDrawerSection(buildLeadDrawerDefaultDoc());
        const key = doc.sections[doc.sections.length - 1]!.key;
        expect(isValidCustomSectionKeyPattern(key)).toBe(true);
        const parsed = parseLayoutDoc(doc, { inferSurfaceKey: true });
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
    });

    it("rejects legacy section_3 key", () => {
        const doc = legacySectionDoc("section_3");
        const result = validateLayoutDocForSurface(doc, "opportunity_drawer");
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes("legacy_invalid_section_key"))).toBe(true);
        expect(isLegacyInvalidSectionKey("section_3")).toBe(true);
    });

    it("editor creates valid custom section keys", () => {
        const key = makeCustomSectionKey();
        expect(key.startsWith("custom_section_")).toBe(true);
        expect(isLegacyInvalidSectionKey(key)).toBe(false);
    });
});

describe("custom block keys", () => {
    it("accepts custom block with valid ref key and metadata", () => {
        const doc = validCustomSectionWithBlockDoc();
        const parsed = parseLayoutDoc(doc, { inferSurfaceKey: true });
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
        const block = doc.sections
            .flatMap((s) => s.rows)
            .flatMap((r) => r.columns)
            .flatMap((c) => c.items)
            .find((it) => it.kind === "field_group" && it.refKey?.startsWith("custom_block_"));
        expect(block?.refKey).toBeTruthy();
    });

    it("rejects legacy block refKey", () => {
        const doc = legacySectionDoc("custom_section_abc123", "block");
        const section = doc.sections.find((s) => s.key === "custom_section_abc123");
        if (section) {
            section.metadata = writeCustomSectionMetadata("main");
        }
        const result = validateLayoutDocForSurface(doc, "opportunity_drawer");
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes("legacy_invalid_block_refKey"))).toBe(true);
        expect(isLegacyInvalidBlockRefKey("block")).toBe(true);
    });

    it("editor creates valid custom block keys via addSectionBlockItem", () => {
        let doc = addCustomOpportunityDrawerSection(buildLeadDrawerDefaultDoc());
        const sectionKey = doc.sections[doc.sections.length - 1]!.key;
        const result = addSectionBlockItem(doc, sectionKey, 0, 0);
        expect(result.ok, result.ok ? "" : result.error).toBe(true);
        if (!result.ok) return;
        const block = result.doc.sections
            .find((s) => s.key === sectionKey)!
            .rows[0]!.columns[0]!.items[0]!;
        expect(block.refKey?.startsWith("custom_block_")).toBe(true);
    });
});

describe("repair generated layout keys", () => {
    it("converts bad section and block keys and preserves nested fields after re-add", () => {
        let doc = legacySectionDoc("section_3", "block");
        expect(layoutDocHasRepairableGeneratedKeys(doc)).toBe(true);

        const repaired = repairOpportunityDrawerLayoutGeneratedKeys(doc);
        expect(repaired.changed).toBe(true);
        expect(repaired.repairs.length).toBeGreaterThan(0);

        const customSection = repaired.doc.sections.find((s) => s.key.startsWith("custom_section_"));
        expect(customSection?.metadata?.layoutEditorCustom).toBe(true);

        const block = customSection?.rows[0]?.columns[0]?.items[0];
        expect(block?.refKey?.startsWith("custom_block_")).toBe(true);

        const sectionKey = customSection!.key;
        const withField = addSectionFieldItem(repaired.doc, sectionKey, 0, 0, EMAIL_FIELD);
        expect(withField.ok, withField.ok ? "" : withField.error).toBe(true);

        const parsed = parseLayoutDoc(withField.ok ? withField.doc : repaired.doc, { inferSurfaceKey: true });
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
    });
});

describe("prepareOpportunityDrawerLayoutDocForEditor", () => {
    it("auto-repairs legacy keys on load so surface validation passes", () => {
        const raw = legacySectionDoc("section_3", "block");
        const structuralOnly = parseLayoutDoc(raw, { inferSurfaceKey: true });
        expect(structuralOnly.ok).toBe(false);

        const prepared = prepareOpportunityDrawerLayoutDocForEditor(raw);
        expect(prepared.ok, prepared.ok ? "" : (prepared as { errors: string[] }).errors.join("; ")).toBe(true);
        if (!prepared.ok) return;
        expect(prepared.autoRepaired).toBe(true);
        expect(prepared.repairs.length).toBeGreaterThan(0);
        expect(validateOpportunityDrawerLayoutDoc(prepared.doc).ok).toBe(true);
    });
});

describe("validation messaging", () => {
    it("maps legacy section errors to operator-friendly copy", () => {
        const doc = legacySectionDoc("section_3");
        const errors = validateLayoutDocForSurface(doc, "opportunity_drawer").errors;
        const friendly = formatLayoutValidationErrors(errors);
        expect(friendly.some((m) => m.includes("invalid key"))).toBe(true);
        expect(friendly.some((m) => m.includes("Repair generated layout keys"))).toBe(true);
    });

    it("still rejects platform-owned section keys", () => {
        const doc = buildLeadDrawerDefaultDoc();
        doc.sections.push({
            id: "shell-sec",
            key: "header",
            title: "Header",
            collapsible: false,
            defaultExpanded: true,
            rows: [],
            metadata: writeCustomSectionMetadata("main"),
        });
        const result = validateLayoutDocForSurface(doc, "opportunity_drawer");
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes("platform shell-owned"))).toBe(true);
    });

    it("still rejects unknown field ref keys inside custom blocks", () => {
        let doc = addCustomOpportunityDrawerSection(buildLeadDrawerDefaultDoc());
        const sectionKey = doc.sections[doc.sections.length - 1]!.key;
        const blockResult = addSectionBlockItem(doc, sectionKey, 0, 0);
        if (!blockResult.ok) throw new Error(blockResult.error);
        doc = blockResult.doc;
        const badField: LayoutItem = {
            id: "bad",
            kind: "field",
            refKey: "opportunity.totally_made_up_field",
            label: "Bad",
            renderHint: "text",
        };
        const block = doc.sections.find((s) => s.key === sectionKey)!.rows[0]!.columns[0]!.items[0]!;
        block.rows![0]!.columns[0]!.items.push(badField);
        const parsed = parseLayoutDoc(doc, { inferSurfaceKey: true });
        expect(parsed.ok).toBe(false);
        expect(parsed.errors.some((e) => e.includes("unknown field refKey"))).toBe(true);
    });
});

describe("makeCustomBlockRefKey", () => {
    it("generates stable-prefix ids", () => {
        const a = makeCustomBlockRefKey();
        const b = makeCustomBlockRefKey();
        expect(a).not.toBe(b);
        expect(a.startsWith("custom_block_")).toBe(true);
    });
});
