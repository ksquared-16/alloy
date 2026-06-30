import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import FocusPanelSummarySurfaceEditor from "@/components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor";
import FocusPanelCardInspector from "@/components/admin/focusPanel/FocusPanelCardInspector";
import SurfacesConfigurationPage from "@/components/adminV2/settings/surfaces/SurfacesConfigurationPage";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { defaultCardFields, conceptOptionsForCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardReference";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
function readSrc(rel: string): string {
    return readFileSync(resolve(repoRoot, rel), "utf8");
}

function demoCards() {
    const { vm, record } = buildDemoFocusPanelSummaryViewModel();
    return deriveOpportunityFocusPanelPresentation({
        mode: "summary",
        displayVm: vm,
        record,
        title: vm.header.title,
        perspective: null,
        statusLabel: "Tour scheduled",
    }).cards;
}

describe("Surfaces page — Configuration Runtime shell + naming", () => {
    const html = renderToStaticMarkup(<SurfacesConfigurationPage />);
    const page = readSrc("components/adminV2/settings/surfaces/SurfacesConfigurationPage.tsx");

    it("preserves the Configuration shell (Context → Section → Workspace)", () => {
        expect(page).toContain("ConfigurationShell");
        expect(html).toContain('data-testid="surfaces-configuration-context"');
        expect(html).toContain('data-testid="surfaces-configuration-shell"');
    });

    it("labels the surface object 'Enrollment Focus Panel' (Summary stays internal)", () => {
        expect(html).toContain('data-testid="surfaces-object-item-enrollment-focus-panel-summary"');
        expect(html).toContain("Enrollment Focus Panel");
        expect(html).not.toContain("Opportunity · Summary");
    });

    it("collapses navigation while editing (breadcrumb + canvas wins)", () => {
        expect(page).toContain('data-testid="surfaces-breadcrumb"');
        expect(page).toContain("FocusPanelSummarySurfaceEditor");
        expect(page).toContain("editing && selectedObject");
    });
});

describe("FocusPanelSummarySurfaceEditor — canvas, structure, insertion", () => {
    const html = renderToStaticMarkup(<FocusPanelSummarySurfaceEditor />);
    const editorSrc = readSrc("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx");

    it("caps the canvas to the real Focus Panel footprint (not a full-page grid)", () => {
        expect(html).toContain('data-surface-editor-canvas="enrollment-focus-panel-summary"');
        expect(html).toContain('data-focus-panel-canvas-footprint="focus-panel"');
        expect(html).toContain("max-w-[720px]");
        expect(html).toContain('data-focus-panel-mode="summary"');
        expect(html).toContain('data-focus-panel-card-grid="true"');
    });

    it("uses the Configuration header look (Enrollment Focus Panel, not legacy gray)", () => {
        expect(html).toContain("Enrollment Focus Panel");
        expect(html).not.toContain("Enrollment Focus Panel Summary");
    });

    it("exposes drag, move, resize, duplicate, and remove controls", () => {
        expect(html).toContain("data-focus-panel-card-drag-handle");
        expect(html).toContain('draggable="true"');
        expect(html).toContain("data-focus-panel-card-move-prev");
        expect(html).toContain("data-focus-panel-card-move-next");
        expect(html).toContain("data-focus-panel-card-span");
        expect(html).toContain("data-focus-panel-card-duplicate");
        expect(html).toContain("data-focus-panel-card-remove");
    });

    it("adds cards via '+ line between cards' (not a standing side panel)", () => {
        expect(html).toContain('data-testid="focus-panel-insert-line"');
        expect(html).toContain("data-focus-panel-insert-trigger");
        // The catalog is an on-demand picker opened from a line (closed by default).
        expect(html).not.toContain('data-testid="focus-panel-add-card-panel"');
        expect(editorSrc).toContain('data-focus-panel-catalog-state={placed ? "placed" : available ? "addable" : "unavailable"}');
        expect(editorSrc).toContain("insertSummaryCard");
    });

    it("keeps Undo + Reset working-copy controls", () => {
        expect(html).toContain('data-testid="focus-panel-edit-undo"');
        expect(html).toContain('data-testid="focus-panel-edit-reset"');
    });
});

describe("Content Mode removed — contextual Inspector instead", () => {
    const editorSrc = readSrc("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx");

    it("the editor has no Content mode / Structure toggle and renders the real model", () => {
        expect(editorSrc).not.toContain("focus-panel-content-inspector");
        expect(editorSrc).not.toContain("contentModeEnabled");
        expect(editorSrc).not.toContain("editSurface");
        expect(editorSrc).toContain("composeEffectiveCardModel");
    });

    it("wires the contextual Inspector to the selected card", () => {
        expect(editorSrc).toContain("FocusPanelCardInspector");
        expect(editorSrc).toContain("selectedInstanceId");
        expect(editorSrc).toContain("updateSummaryCardConfig");
    });
});

describe("Household reference card — product-quality Inspector", () => {
    const cards = demoCards();
    const household = cards.get("household")!;
    const html = renderToStaticMarkup(
        <FocusPanelCardInspector
            baseModel={household}
            instanceId="household"
            config={{}}
            onChange={() => {}}
            onClose={() => {}}
            history={{ publishedVersion: null, hasDraft: false, dirty: false }}
        />,
    );

    it("renders operational sections (Card Definition V2 — no type/archetype/tier jargon)", () => {
        expect(html).toContain('data-focus-panel-inspector-card="household"');
        for (const tab of ["question", "evidence", "presentation", "behavior", "editing", "expansion", "conditions", "actions", "ai"]) {
            expect(html).toContain(`data-focus-panel-inspector-tab="${tab}"`);
        }
        expect(html).not.toContain("Archetype");
        expect(html).not.toContain(">Tier<");
    });

    it("seeds real Household fields bound to business concepts (not columns)", () => {
        const fields = defaultCardFields("household");
        const concepts = fields.map((f) => f.concept);
        expect(concepts).toContain("Enrollment → Primary Contact → Phone");
        expect(concepts).toContain("Enrollment → Primary Contact → Email");
        expect(fields.some((f) => f.id === "primary_phone")).toBe(true);
        // Pickers expose business concepts.
        expect(conceptOptionsForCard("household")).toContain("Enrollment → Primary Contact → Phone");
    });

    it("preserves relationship lists as collection-kind fields (never flattened)", () => {
        const fields = defaultCardFields("household");
        const collections = fields.filter((f) => f.kind === "collection").map((f) => f.id);
        expect(collections).toEqual(
            expect.arrayContaining(["children", "authorized_pickups", "emergency_contacts"]),
        );
        // Primary Contact is a plain field; Children is a related list.
        expect(fields.find((f) => f.id === "primary_contact")?.kind).toBe("field");
        expect(fields.find((f) => f.id === "children")?.kind).toBe("collection");
    });

    it("represents collapsed vs expanded content", () => {
        const fields = defaultCardFields("household");
        expect(fields.some((f) => f.placement === "collapsed")).toBe(true);
        expect(fields.some((f) => f.placement === "expanded")).toBe(true);
    });
});

describe("Publish loop (configure → publish → operate)", () => {
    const html = renderToStaticMarkup(<FocusPanelSummarySurfaceEditor />);
    const grid = readSrc("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");

    it("renders a publish toolbar with status, Save draft, and Publish", () => {
        expect(html).toContain('data-testid="surface-publish-toolbar"');
        expect(html).toContain('data-testid="surface-save-draft"');
        expect(html).toContain('data-testid="surface-publish"');
        expect(html).toContain("Loading…");
    });

    it("operator runtime shares rendering — reads published doc + applies card config", () => {
        expect(grid).toContain("usePublishedFocusPanelSummaryDoc");
        expect(grid).toContain("publishedDoc ?? FOCUS_PANEL_SUMMARY_DEFAULT_DOC");
        expect(grid).toContain("composeEffectiveCardModel");
        expect(grid).toContain("deriveFocusPanelInstanceMap");
    });
});

describe("buildDemoFocusPanelSummaryViewModel — collections are populated", () => {
    it("returns a settled VM with household contacts and a children collection", () => {
        const { vm, record } = buildDemoFocusPanelSummaryViewModel();
        expect(vm.structureSettled).toBe(true);
        expect(record["person.primary_contact_name"]).toBe("Jordan Johnson");
        expect(record["person.secondary_contact_name"]).toBe("Taylor Johnson");
        expect(Array.isArray(record._inquiry_children)).toBe(true);
        expect((record._inquiry_children as unknown[]).length).toBe(2);
    });
});
