// @vitest-environment jsdom
import { act, useEffect, type ReactNode } from "react";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HouseholdCard from "@/components/admin/focusPanel/cards/HouseholdCard";
import ChildrenCard from "@/components/admin/focusPanel/cards/ChildrenCard";
import { FocusPanelComposerProvider } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { defaultNestedSurfaceConfig, HOUSEHOLD_SURFACE_ID, CHILDREN_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

vi.mock("@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions", () => ({
    useTenantFieldDefinitions: () => ({ tenantFieldDefinitions: [], loading: false }),
}));

vi.mock("@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc", () => ({
    usePublishedFocusPanelSummaryDoc: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

function demoContext() {
    const { vm, record } = buildDemoFocusPanelSummaryViewModel();
    return {
        vm,
        context: buildOperationalContext({
            subjectId: String(vm.entity.id),
            title: vm.header.title,
            subjectVm: vm,
            truth: record,
            perspective: null,
            statusLabel: "Tour scheduled",
            canMutate: false,
        }),
    };
}

describe("Focus Panel identity builder canvas composer", () => {
    it("Household Summary Primary Contact mounts canvas drag layout surface", () => {
        const { context } = demoContext();
        const model = { key: "household", title: "Household", tier: "context", span: 2, iconName: "users" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [HOUSEHOLD_SURFACE_ID]: defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={HOUSEHOLD_SURFACE_ID} cardKey="household">
                        <HouseholdCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-nested-layout-surface="primary_contact"]')).toBeTruthy();
        expect(document.querySelector(".fp-layout-surface--composing")).toBeTruthy();
        expect(document.querySelector(".fp-field-instance__toolbar")).toBeTruthy();
    });

    it("Children Summary roster mounts canvas drag layout surface", () => {
        const { context } = demoContext();
        const model = { key: "children", title: "Children", tier: "context", span: 2, iconName: "baby" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [CHILDREN_SURFACE_ID]: defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={CHILDREN_SURFACE_ID} cardKey="children">
                        <ChildrenCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-nested-layout-surface="roster"]')).toBeTruthy();
        expect(document.querySelector(".fp-layout-surface--composing")).toBeTruthy();
    });
});

function ComposerHarness({
    surfaceId,
    cardKey,
    children,
}: {
    surfaceId: string;
    cardKey: "household" | "children";
    children: ReactNode;
}) {
    const composer = useFocusPanelComposer();
    useEffect(() => {
        composer?.enterDrillIn(cardKey, surfaceId);
        composer?.setActiveConfigPurpose("summary");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return children;
}
