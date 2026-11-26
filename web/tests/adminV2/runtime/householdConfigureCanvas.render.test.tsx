/** @vitest-environment jsdom */

import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import HouseholdCard from "@/components/admin/focusPanel/cards/HouseholdCard";
import {
    FocusPanelComposerProvider,
    useFocusPanelComposer,
} from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import {
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

function ConfigureOnce() {
    const composer = useFocusPanelComposer();
    useLayoutEffect(() => {
        composer?.enterDrillIn("household", HOUSEHOLD_SURFACE_ID);
    }, []);
    return null;
}

function DrillInHouseholdPreview() {
    const { vm, record } = buildDemoFocusPanelSummaryViewModel();
    const cards = deriveOpportunityFocusPanelPresentation({
        mode: "summary",
        displayVm: vm,
        record,
        title: vm.header.title,
        perspective: null,
        statusLabel: "Tour scheduled",
    }).cards;
    const household = cards.get("household")!;
    const context = buildOperationalContext({
        subjectId: String(vm.entity.id),
        title: vm.header.title,
        subjectVm: vm,
        truth: record,
        perspective: null,
        statusLabel: "Tour scheduled",
        canMutate: false,
    });
    const nested = { [HOUSEHOLD_SURFACE_ID]: defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID) };

    return (
        <FocusPanelComposerProvider initialNestedConfigs={nested}>
            <ConfigureOnce />
            <HouseholdCard model={household} context={context} />
        </FocusPanelComposerProvider>
    );
}

const ROOT = join(process.cwd());

describe("Household Configure canvas", () => {
    it("does not elevate the grid while the in-canvas compose shell is active", () => {
        const household = readFileSync(join(ROOT, "components/admin/focusPanel/cards/HouseholdCard.tsx"), "utf8");
        const children = readFileSync(join(ROOT, "components/admin/focusPanel/cards/ChildrenCard.tsx"), "utf8");
        expect(household).toMatch(/showComposeCanvas\s*\?\s*"base"/);
        expect(household).toContain("if (showComposeCanvas) return;");
        expect(children).toMatch(/showComposeCanvas\s*\?\s*"base"/);
    });

    let container: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;

    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("renders compose canvas without crashing for default household config", async () => {
        await act(async () => {
            root.render(<DrillInHouseholdPreview />);
        });
        expect(container.querySelector('[data-identity-compose-canvas]')).toBeTruthy();
        expect(container.textContent).toMatch(/Configure layout|Parent/);
    });
});
