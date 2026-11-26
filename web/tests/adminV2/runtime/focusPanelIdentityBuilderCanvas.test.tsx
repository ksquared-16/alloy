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
import {
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

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
    it("Children Summary mounts canvas composer before runtime disclosure", () => {
        const { context } = demoContext();
        const model = { key: "children", title: "Children", tier: "context", span: 2, iconName: "baby" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [CHILDREN_SURFACE_ID]: defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={CHILDREN_SURFACE_ID} cardKey="children" purpose="summary">
                        <ChildrenCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-identity-compose-canvas="summary"]')).toBeTruthy();
        expect(document.querySelector('[data-nested-layout-surface="roster"]')).toBeTruthy();
        expect(document.querySelector(".fp-layout-surface--composing")).toBeTruthy();
        expect(document.querySelector('[data-identity-disclosure-surface="true"]')).toBeFalsy();
    });

    it("Children Context Facts mounts canvas composer", () => {
        const { context } = demoContext();
        const model = { key: "children", title: "Children", tier: "context", span: 2, iconName: "baby" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [CHILDREN_SURFACE_ID]: defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={CHILDREN_SURFACE_ID} cardKey="children" purpose="context_facts">
                        <ChildrenCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-identity-compose-canvas="context_facts"]')).toBeTruthy();
        expect(document.querySelector('[data-nested-layout-surface="roster"]')).toBeTruthy();
    });

    it("Children Details mounts FocusedChild composition after child pick", () => {
        const { context } = demoContext();
        const model = { key: "children", title: "Children", tier: "context", span: 2, iconName: "baby" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [CHILDREN_SURFACE_ID]: defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={CHILDREN_SURFACE_ID} cardKey="children" purpose="details" childId="demo-c-1">
                        <ChildrenCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-identity-compose-canvas="details"]')).toBeTruthy();
        expect(document.querySelector('[data-children-focused-child]')).toBeTruthy();
        expect(document.querySelector('[data-nested-layout-surface="identity"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-disclosure-surface="true"]')).toBeFalsy();
    });

    it("Children Evidence mounts collection editor", () => {
        const { context } = demoContext();
        const model = { key: "children", title: "Children", tier: "context", span: 2, iconName: "baby" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [CHILDREN_SURFACE_ID]: defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={CHILDREN_SURFACE_ID} cardKey="children" purpose="evidence">
                        <ChildrenCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-identity-evidence-panel="true"]')).toBeTruthy();
    });

    it("Household Primary Contact Summary mounts canvas composer", () => {
        const { context } = demoContext();
        const model = { key: "household", title: "Household", tier: "context", span: 2, iconName: "users" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [HOUSEHOLD_SURFACE_ID]: defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={HOUSEHOLD_SURFACE_ID} cardKey="household" purpose="summary">
                        <HouseholdCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-identity-compose-canvas="summary"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-canonical-composer="true"]')).toBeTruthy();
        expect(document.querySelector('[data-nested-layout-surface="contact_edit"], [data-nested-layout-surface="primary_contact"]')).toBeTruthy();
    });

    it("Household Context Facts mounts canvas composer", () => {
        const { context } = demoContext();
        const model = { key: "household", title: "Household", tier: "context", span: 2, iconName: "users" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [HOUSEHOLD_SURFACE_ID]: defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={HOUSEHOLD_SURFACE_ID} cardKey="household" purpose="context_facts">
                        <HouseholdCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-identity-compose-canvas="context_facts"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-canonical-composer="true"]')).toBeTruthy();
        expect(document.querySelector('[data-nested-layout-surface]')).toBeTruthy();
    });

    it("Preview mode bypasses compose canvas", () => {
        const { context } = demoContext();
        const model = { key: "children", title: "Children", tier: "context", span: 2, iconName: "baby" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [CHILDREN_SURFACE_ID]: defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={CHILDREN_SURFACE_ID} cardKey="children" purpose="summary" previewMode>
                        <ChildrenCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        act(() => {});
        expect(document.querySelector('[data-identity-compose-canvas]')).toBeFalsy();
        expect(document.querySelector('[data-children-roster]')).toBeTruthy();
    });
});

function ComposerHarness({
    surfaceId,
    cardKey,
    purpose = "summary",
    childId,
    householdPerson,
    previewMode = false,
    children,
}: {
    surfaceId: string;
    cardKey: "household" | "children";
    purpose?: IdentityConfigurationPurpose;
    childId?: string;
    householdPerson?: { personId: string; sectionKey: string };
    previewMode?: boolean;
    children: ReactNode;
}) {
    const composer = useFocusPanelComposer();
    useEffect(() => {
        composer?.enterDrillIn(cardKey, surfaceId);
        composer?.setActiveConfigPurpose(purpose);
        if (childId) {
            composer?.setSelectedIdentityId(childId);
            if (cardKey === "children") {
                composer?.setDrillDepth({ kind: "child-focus", childId });
            }
        }
        if (householdPerson) {
            composer?.setSelectedIdentityId(householdPerson.personId);
            composer?.select({ kind: "region", surfaceId, groupKey: householdPerson.sectionKey });
        }
        if (previewMode) composer?.setComposeCanvasMode("preview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return children;
}

describe("Household composer parity with Children", () => {
    it("Household Summary Primary Contact renders layout field instances with controls", () => {
        const { context } = demoContext();
        const model = { key: "household", title: "Household", tier: "context", span: 2, iconName: "users" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [HOUSEHOLD_SURFACE_ID]: defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={HOUSEHOLD_SURFACE_ID} cardKey="household" purpose="summary">
                        <HouseholdCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        act(() => {});
        expect(document.querySelector('[data-nested-layout-surface] .fp-layout-field__grip, [data-nested-layout-surface] .fp-field-instance__toolbar, [data-canvas-add-field]')).toBeTruthy();
        expect(document.querySelector('[data-identity-disclosure-surface="true"]')).toBeFalsy();
        expect(document.querySelector('[data-builder-field-row="true"]')).toBeTruthy();
        expect(document.querySelector(".fp-layout-surface--composing .alloy-os-child-truth__value")).toBeFalsy();
        const layoutSurface = document.querySelector('[data-identity-canonical-composer="true"] [data-nested-layout-surface]');
        expect(layoutSurface?.querySelectorAll("[data-canvas-add-field]").length).toBe(1);
    });

    it("Household Details mounts focused person composer after selection", () => {
        const { context } = demoContext();
        const model = { key: "household", title: "Household", tier: "context", span: 2, iconName: "users" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [HOUSEHOLD_SURFACE_ID]: defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID) }}>
                    <ComposerHarness
                        surfaceId={HOUSEHOLD_SURFACE_ID}
                        cardKey="household"
                        purpose="details"
                        householdPerson={{ personId: "demo-p-1", sectionKey: "primary_contact" }}
                    >
                        <HouseholdCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        act(() => {});
        expect(document.querySelector('[data-household-compose-fields="details"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-canonical-composer="true"]')).toBeTruthy();
        expect(document.querySelector('[data-nested-layout-surface]')).toBeTruthy();
    });

    it("Household Evidence mounts collection editor with section picker", () => {
        const { context } = demoContext();
        const model = { key: "household", title: "Household", tier: "context", span: 2, iconName: "users" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [HOUSEHOLD_SURFACE_ID]: defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={HOUSEHOLD_SURFACE_ID} cardKey="household" purpose="evidence">
                        <HouseholdCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        act(() => {});
        expect(document.querySelector('[data-identity-evidence-panel="true"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-relationship-section-tabs="true"]')).toBeTruthy();
    });

    it("Runtime View household opens context and person click reaches details", () => {
        const { context } = demoContext();
        const model = { key: "household", title: "Household", tier: "context", span: 2, iconName: "users" } as FocusPanelCardModel;
        act(() => {
            root.render(<HouseholdCard model={model} context={context} />);
        });
        const expand = document.querySelector('[data-household-action="expand"]') as HTMLButtonElement | null;
        expect(expand).toBeTruthy();
        act(() => expand?.click());
        expect(document.querySelector('[data-identity-depth="context"]')).toBeTruthy();
        const activate = document.querySelector(".identity-record-summary__activate") as HTMLButtonElement | null;
        expect(activate).toBeTruthy();
        act(() => activate?.click());
        expect(document.querySelector('[data-identity-disclosure-surface="details"]')).toBeTruthy();
    });
});
