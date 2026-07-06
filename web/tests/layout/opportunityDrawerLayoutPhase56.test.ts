/**
 * Visual Layout Configuration Builder — Phase 5.6 tests.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    listSectionLayoutBlocks,
    patchLayoutEditorFieldDisplay,
    serializeLayoutEditorNodePath,
} from "@/lib/layout/layoutEditorCompositionModel";
import {
    readLayoutEditorDisplayConfig,
    validateLayoutEditorDisplayConfig,
    writeLayoutEditorDisplayConfig,
} from "@/lib/layout/layoutEditorDisplayConfig";
import {
    resolveVisibilityRuleKey,
    validateVisibilityRule,
    visibilityConditionForRule,
} from "@/lib/layout/layoutEditorVisibilityRules";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";

const root = resolve(__dirname, "../..");

describe("layout blocks", () => {
    it("lists household and primary contact blocks with nested fields", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const blocks = listSectionLayoutBlocks(doc, "household_contact");
        expect(blocks.some((b) => b.title === "Household Card")).toBe(true);
        expect(blocks.some((b) => b.title === "Primary Contact Card")).toBe(true);
        const contact = blocks.find((b) => b.kind === "field_group");
        expect(contact?.children.some((c) => c.refKey === "person.primary_email")).toBe(true);
        expect(contact?.children.some((c) => c.refKey === "person.primary_phone")).toBe(true);
    });

    it("lists child row template columns for enrollment", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const blocks = listSectionLayoutBlocks(doc, "children_enrollment");
        const rowTemplate = blocks.find((b) => b.kind === "related_list");
        expect(rowTemplate?.title).toBe("Child Row Template");
        expect(rowTemplate?.children.some((c) => c.refKey === "child.name")).toBe(true);
        expect(rowTemplate?.children.some((c) => c.refKey === "child.status")).toBe(true);
    });
});

describe("field display settings", () => {
    it("persists label override and display metadata on nested contact email", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const blocks = listSectionLayoutBlocks(doc, "household_contact");
        const email = blocks.flatMap((b) => b.children).find((c) => c.refKey === "person.primary_email");
        expect(email).toBeTruthy();
        const next = patchLayoutEditorFieldDisplay(doc, email!.path, {
            showLabel: true,
            typographyIntent: "emphasis",
            emptyState: "No email on file",
            icon: "mail",
            displayType: "email",
        }, "Primary Email");
        const updated = listSectionLayoutBlocks(next, "household_contact")
            .flatMap((b) => b.children)
            .find((c) => serializeLayoutEditorNodePath(c.path) === serializeLayoutEditorNodePath(email!.path));
        expect(updated?.title).toBe("Primary Email");
        expect(updated?.displayConfig.icon).toBe("mail");
    });

    it("rejects invalid icon in display config validation", () => {
        const errors = validateLayoutEditorDisplayConfig({ icon: "not_an_icon" as never }, "test");
        expect(errors.length).toBeGreaterThan(0);
    });

    it("accepts valid display config in surface validation", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const section = doc.sections.find((s) => s.key === "household_contact");
        const group = section?.rows[0]?.columns[1]?.items.find((i) => i.kind === "field_group");
        const field = group?.rows?.[0]?.columns[0]?.items[0];
        if (field) {
            field.metadata = writeLayoutEditorDisplayConfig(field.metadata, {
                typographyIntent: "secondary",
                emptyState: "No phone number",
            });
        }
        const result = validateLayoutDocForSurface(doc);
        expect(result.ok, result.errors.join("; ")).toBe(true);
    });
});

describe("conditional visibility", () => {
    it("maps hide when empty to exists condition on bound path", () => {
        const cond = visibilityConditionForRule("hide_when_empty", "person.primary_phone");
        expect(cond).toEqual({ type: "exists", path: "person.primary_phone" });
    });

    it("evaluates count_gt for collection visibility", () => {
        const cond = visibilityConditionForRule("show_when_count_gt_1", "children", "children");
        expect(cond?.type).toBe("count_gt");
        expect(evaluateLayoutCondition(LAYOUT_DRAWER_PREVIEW_RECORD, cond)).toBe(true);
    });

    it("rejects invalid visibility rule keys", () => {
        expect(validateVisibilityRule("always")).toBe(true);
        expect(validateVisibilityRule("bogus")).toBe(false);
    });

    it("resolves secondary contact style exists rule", () => {
        const rule = resolveVisibilityRuleKey({ type: "exists", path: "person.secondary_contact_name" }, "person.primary_email");
        expect(rule).toBe("show_when_related_exists");
    });
});

describe("sample preview data", () => {
    it("does not use raw Inquiry status label in preview children", () => {
        const statuses = ((LAYOUT_DRAWER_PREVIEW_RECORD.children ?? []) as Record<string, unknown>[]).map((c) =>
            String(c["child.status"] ?? ""),
        );
        expect(statuses).not.toContain("Inquiry");
        expect(statuses.some((s) => s.length > 0)).toBe(true);
    });
});

describe("editor wiring", () => {
    it("uses inspector panel for section configuration instead of inline canvas panel", () => {
        const canvas = readFileSync(resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas.tsx"), "utf8");
        expect(canvas).not.toContain("OpportunityDrawerLayoutCompositionPanel");
        expect(canvas).not.toContain("visual-editor-inline-section-editor");
        const inspector = readFileSync(resolve(root, "components/adminV2/settings/LayoutBuilderInspectorPanel.tsx"), "utf8");
        expect(inspector).toContain("visual-editor-composition-panel");
        expect(inspector).toContain('label="Row layout"');
        expect(inspector).toContain("BUILDER_SECTION_ROW_LAYOUT_PRESET_KEYS");
        expect(inspector).toContain("visual-editor-section-row-group-layout");
    });

    it("exposes field settings component with registry-constrained controls", () => {
        const settings = readFileSync(resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutFieldSettings.tsx"), "utf8");
        expect(settings).toContain("visual-editor-field-display-type");
        expect(settings).toContain("visual-editor-field-visibility");
        expect(settings).toContain("visual-editor-field-icon");
    });
});

describe("runtime visibility metadata read", () => {
    it("reads layoutEditorDisplay from item metadata", () => {
        const config = readLayoutEditorDisplayConfig({
            metadata: { layoutEditorDisplay: { showLabel: false, emptyState: "No phone number" } },
        });
        expect(config.showLabel).toBe(false);
        expect(config.emptyState).toBe("No phone number");
    });
});
