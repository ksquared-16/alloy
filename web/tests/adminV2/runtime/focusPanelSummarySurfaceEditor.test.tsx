import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import FocusPanelSummarySurfaceEditor from "@/components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor";
import FocusPanelCardInspector from "@/components/admin/focusPanel/FocusPanelCardInspector";
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
    const page = readSrc("components/adminV2/settings/surfaces/SurfacesConfigurationPage.tsx");
    const nav = readSrc("components/adminV2/settings/surfaces/useSurfacesConfigurationSettings.ts");

    it("preserves the Configuration shell for the Surfaces list (Context → Category → Collection → Workspace)", () => {
        expect(page).toContain("ConfigurationShell");
        expect(page).toContain('testId="surfaces-configuration-context"');
        expect(page).toContain('testId="surfaces-configuration-shell"');
    });

    it("labels the surface object 'Enrollment Focus Panel' (Summary stays internal)", () => {
        expect(page).toContain('surfaces-object-item-${item.id}');
        expect(nav).toContain("enrollment-focus-panel-summary");
        expect(nav).toContain("Enrollment Focus Panel");
        expect(nav).not.toContain("Opportunity · Summary");
    });

    it("embeds Focus Panel inside the Selected Surface Edit tab — never a detached full-bleed studio route", () => {
        expect(page).toContain("FocusPanelSummarySurfaceEditor");
        // The full-bleed studio-navigation path is gone: no router.replace(...) into
        // `?editor=1&layout=` as the normal Edit journey, and no early return that replaces the
        // whole page with only the editor.
        expect(page).not.toContain("enterFocusPanelStudio");
        expect(page).not.toContain("exitStudio");
        expect(page).not.toContain("isFullBleedWorkspaceEditor");
        expect(page).not.toContain("data-focus-panel-builder-wide");
        expect(page).not.toContain('router.replace(`/settings/surfaces?${params.toString()}`)');
        // Edit renders inline in the main workspace pane, `onBack` returns to Overview (same shell).
        expect(page).toContain('selectedObject.editor === "focus-panel-summary"');
        expect(page).toContain('<FocusPanelSummarySurfaceEditor onBack={() => setTab("overview")} />');
    });
});

describe("FocusPanelSummarySurfaceEditor — canvas, structure, insertion", () => {
    const html = renderToStaticMarkup(<FocusPanelSummarySurfaceEditor />);
    const editorSrc = readSrc("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx");

    // The canvas + inspector are gated on the async layout load (`loaded`), so the static
    // SSR render shows "Loading…"; structure is asserted from source (canvas-first reality).
    // Runtime-first composer canvas replaces the legacy grid builder chrome.
    const canvasSrc = readSrc("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");

    it("is canvas-first: the Focus Panel canvas IS the editor (no separate lower preview)", () => {
        expect(canvasSrc).toContain('data-surface-canvas-builder="true"');
        expect(canvasSrc).toContain('data-focus-panel-runtime-composer="true"');
        expect(editorSrc).toContain("FocusPanelRuntimeComposerCanvas");
        // The legacy lower "Focus Panel / Preview" structure editor is removed.
        expect(editorSrc).not.toContain('data-surface-editor-canvas="enrollment-focus-panel-summary"');
        expect(editorSrc).not.toContain("data-focus-panel-canvas-footprint");
        expect(editorSrc).not.toContain("FocusPanelEditableCardFrame");
        // No builder-grid framing ("Arrange the Focus Panel").
        expect(editorSrc).not.toContain("FocusPanelGridCanvasBuilder");
        expect(canvasSrc).not.toContain("Arrange the Focus Panel");
    });

    it("uses the Configuration header look (Enrollment Focus Panel, not legacy gray)", () => {
        expect(html).toContain("Enrollment Focus Panel");
        expect(html).not.toContain("Enrollment Focus Panel Summary");
    });

    it("composition lives on the canvas (subtle hover handles); behavior in the adjacent inspector", () => {
        // Layout handles appear on composer cells (hover/selection only).
        expect(canvasSrc).toContain("alloy-os-fp-composer-cell__handle--w");
        expect(canvasSrc).toContain("alloy-os-fp-composer-cell__handle--h");
        // Runtime-shaped grid + header (same components as /work-unit).
        expect(canvasSrc).toContain("FocusPanelCardGrid");
        expect(canvasSrc).toContain("OpportunityFocusPanelHeader");
        // The inspector sits adjacent to the canvas (behavior).
        expect(editorSrc).toContain('data-surface-inspector="true"');
        expect(editorSrc).toContain("FocusPanelCardInspector");
        // No legacy per-card structure frame / span controls in the editor.
        expect(editorSrc).not.toContain("data-focus-panel-card-drag-handle");
        expect(editorSrc).not.toContain("data-focus-panel-card-span");
    });

    it("adds cards from the composer tray (not '+ line' insertion)", () => {
        // Unplaced cards live in the composer tray; the legacy insert line is gone.
        expect(canvasSrc).toContain("data-fp-composer-tray");
        expect(editorSrc).not.toContain('data-testid="focus-panel-insert-line"');
        expect(editorSrc).not.toContain('data-testid="focus-panel-add-card-panel"');
        // Selecting a card on the canvas opens the inspector; sections track the canvas.
        expect(editorSrc).toContain("onSelectCard");
        expect(editorSrc).toContain("reconcileOrderToLayout");
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
        // Canvas-first: composition is authored on the runtime-shaped canvas; the inspector owns behavior.
        expect(editorSrc).toContain("FocusPanelRuntimeComposerCanvas");
        expect(editorSrc).toContain("FocusPanelCardInspector");
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
        for (const tab of ["question", "evidence", "presentation", "editing", "expanded", "related", "actions", "conditions", "ai", "behavior"]) {
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

    it("seeds Current Work preview through the production pipeline (not empty placeholder)", () => {
        const { vm } = buildDemoFocusPanelSummaryViewModel();
        expect(vm.workspace.stage_work_runtime).not.toBeNull();
        expect(vm.workspace.published_stage_inputs).toBeTruthy();
        expect(vm.actions.record_header?.secondary?.length).toBeGreaterThan(0);

        const cards = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: vm,
            record: vm.above_fold.record as Record<string, unknown>,
            title: vm.header.title,
            perspective: null,
            statusLabel: "Tour scheduled",
        }).cards;

        const currentWork = cards.get("current_work");
        expect(currentWork?.insight).toBe("Contact Family");
        expect(currentWork?.insight).not.toBe("No current work configured");
    });
});
