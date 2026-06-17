/**
 * Opportunity drawer visual layout editor — Phase 3 tests.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    fetchEntityLayoutRecord,
    patchEntityLayoutDraft,
    publishEntityLayoutDraft,
} from "@/lib/layout/opportunityDrawerLayoutEditorApi";
import {
    isPlatformShellSlotEditable,
    isSectionEditorHidden,
    listMissingRegisteredSections,
    OPPORTUNITY_DRAWER_LOCKED_SHELL_SLOTS,
    reorderSectionInZone,
    resolveVisualEditorActionState,
    setSectionEditorHidden,
    tryAddFieldRefToSection,
    validateOpportunityDrawerLayoutDoc,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";

const root = resolve(__dirname, "../..");

describe("opportunityDrawerLayoutEditorModel", () => {
    it("loads default opportunity drawer doc as valid draft shape", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = validateOpportunityDrawerLayoutDoc(doc);
        expect(result.ok, result.errors.join("; ")).toBe(true);
        expect(doc.entityType).toBe("opportunities");
        expect(doc.surface).toBe("drawer");
    });

    it("marks platform shell slots as not editable", () => {
        for (const slot of OPPORTUNITY_DRAWER_LOCKED_SHELL_SLOTS) {
            expect(isPlatformShellSlotEditable(slot)).toBe(false);
        }
    });

    it("rejects invalid field ref on add", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = tryAddFieldRefToSection(doc, "household_contact", "not.a.real.field", "Bad");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("not allowed");
    });

    it("adds allowed field ref to section", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = tryAddFieldRefToSection(doc, "lead_source", "opportunity.tour_date", "Tour date");
        expect(result.ok).toBe(true);
        if (result.ok) {
            const items = result.doc.sections.find((s) => s.key === "lead_source")?.rows[0]?.columns[0]?.items ?? [];
            expect(items.some((it) => it.refKey === "opportunity.tour_date")).toBe(true);
        }
    });

    it("reorders sections within the same zone without crossing zones", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const mainBefore = doc.sections
            .filter((s) => ["household_contact", "children_enrollment", "lead_source"].includes(s.key))
            .map((s) => s.key);

        doc = reorderSectionInZone(doc, "lead_source", -1);
        const mainAfter = doc.sections
            .filter((s) => ["household_contact", "children_enrollment", "lead_source"].includes(s.key))
            .map((s) => s.key);

        expect(mainAfter.indexOf("lead_source")).toBeLessThan(mainAfter.indexOf("household_contact"));
        expect(mainAfter.length).toBe(mainBefore.length);
        expect(new Set(mainAfter)).toEqual(new Set(mainBefore));
    });

    it("supports hide/show via layoutEditorHidden metadata", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const hidden = setSectionEditorHidden(doc, "activity", true);
        const section = hidden.sections.find((s) => s.key === "activity");
        expect(section).toBeTruthy();
        expect(isSectionEditorHidden(section!)).toBe(true);
        const shown = setSectionEditorHidden(hidden, "activity", false);
        expect(isSectionEditorHidden(shown.sections.find((s) => s.key === "activity")!)).toBe(false);
    });

    it("lists missing registered sections for partial docs", () => {
        const partial: LayoutDoc = {
            ...buildLeadDrawerDefaultDoc(),
            sections: buildLeadDrawerDefaultDoc().sections.filter((s) => s.key === "lead_summary"),
        };
        const missing = listMissingRegisteredSections(partial);
        expect(missing).toContain("children_enrollment");
        expect(missing).not.toContain("lead_summary");
    });

    it("blocks publish when validation fails or version is clean published", () => {
        expect(
            resolveVisualEditorActionState({
                dirty: true,
                validationOk: false,
                recordStatus: "draft",
                busy: false,
            }).canPublish,
        ).toBe(false);
        expect(
            resolveVisualEditorActionState({
                dirty: false,
                validationOk: true,
                recordStatus: "published",
                busy: false,
            }).canPublish,
        ).toBe(false);
    });

    it("allows save for dirty published layouts", () => {
        const state = resolveVisualEditorActionState({
            dirty: true,
            validationOk: true,
            recordStatus: "published",
            busy: false,
        });
        expect(state.canSave).toBe(true);
    });

    it("allows publish for saved valid drafts", () => {
        const state = resolveVisualEditorActionState({
            dirty: false,
            validationOk: true,
            recordStatus: "draft",
            busy: false,
        });
        expect(state.canPublish).toBe(true);
        expect(state.canSave).toBe(false);
        expect(state.statusLabel).toBe("Draft saved");
    });
});

describe("opportunityDrawerLayoutEditorApi", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("fetchEntityLayoutRecord loads draft by id", async () => {
        const doc = buildLeadDrawerDefaultDoc();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    id: "draft-1",
                    orgId: "org-1",
                    entityType: "opportunities",
                    surface: "drawer",
                    layoutKey: "default",
                    name: "Opportunity drawer",
                    version: 2,
                    status: "draft",
                    doc,
                }),
            }),
        );

        const rec = await fetchEntityLayoutRecord("draft-1");
        expect(rec.id).toBe("draft-1");
        expect(rec.status).toBe("draft");
        expect(rec.doc.sections.length).toBeGreaterThan(0);
    });

    it("patchEntityLayoutDraft calls PATCH with doc payload", async () => {
        const doc = buildLeadDrawerDefaultDoc();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: "draft-1", doc }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await patchEntityLayoutDraft("draft-1", "Updated name", doc);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/entity-layouts/draft-1",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ name: "Updated name", doc }),
            }),
        );
    });

    it("publishEntityLayoutDraft calls publish endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: "draft-1", status: "published" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const rec = await publishEntityLayoutDraft("draft-1");
        expect(rec.status).toBe("published");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/entity-layouts/draft-1/publish",
            expect.objectContaining({ method: "POST" }),
        );
    });
});

describe("layoutEditorHidden runtime adoption", () => {
    it("resolveLayoutRuntimeSectionVisibility honors layoutEditorHidden when adoption ctx is on", () => {
        const src = readFileSync(
            resolve(root, "lib/layout/runtime/resolveLayoutRuntimeSectionVisibility.ts"),
            "utf8",
        );
        expect(src).toContain("layoutEditorHidden");
        expect(src).toContain("shouldSuppressOpportunityDrawerSectionForEditorHidden");
    });
});

describe("layouts settings visual editor wiring", () => {
    it("routes editor mode to visual editor by default with advanced fallback link", () => {
        const pageClient = readFileSync(
            resolve(root, "app/adminV2/settings/layouts/LayoutsSettingsPageClient.tsx"),
            "utf8",
        );
        expect(pageClient).toContain("OpportunityDrawerLayoutVisualEditor");
        expect(pageClient).toContain('searchParams.get("advanced") === "1"');
        expect(pageClient).toContain("LayoutConfigClient");
        expect(pageClient).toContain("visual-editor-return-to-visual");
    });

    it("visual editor component exposes locked shell and editable canvas test ids", () => {
        const editor = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutVisualEditor.tsx"),
            "utf8",
        );
        const canvas = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas.tsx"),
            "utf8",
        );
        const previewFrame = readFileSync(
            resolve(root, "components/adminV2/settings/LayoutBuilderPreviewDrawerFrame.tsx"),
            "utf8",
        );
        expect(editor).toContain('data-testid="opportunity-drawer-visual-editor"');
        expect(previewFrame).toContain('slot="header"');
        expect(previewFrame).toContain("visual-editor-locked-shell-");
        expect(canvas).toContain("visual-editor-zone-summary_strip");
        expect(canvas).toContain("visual-editor-zone-right_rail");
        expect(editor).toContain("visual-editor-advanced-builder-link");
        expect(editor).toContain("visual-editor-save-draft");
        expect(editor).toContain("visual-editor-publish");
        expect(editor).toContain("LayoutBuilderPalettePanel");
        expect(editor).toContain("LayoutBuilderInspectorPanel");
        expect(canvas).toContain("LayoutBuilderCanvasStartGuide");
        expect(canvas).toContain("LayoutBuilderPreviewDrawerFrame");
        expect(canvas).toContain('data-visual-editor-editable="true"');
    });
});
