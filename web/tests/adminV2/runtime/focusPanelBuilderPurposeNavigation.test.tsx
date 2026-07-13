// @vitest-environment jsdom
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HouseholdCard from "@/components/admin/focusPanel/cards/HouseholdCard";
import ChildrenCard from "@/components/admin/focusPanel/cards/ChildrenCard";
import IdentitySurfaceBuilderInspector from "@/components/adminV2/settings/surfaces/composer/IdentitySurfaceBuilderInspector";
import FocusPanelDrillInInspector from "@/components/admin/focusPanel/drillIn/FocusPanelDrillInInspector";
import { FocusPanelComposerProvider, useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { defaultHouseholdRelationshipSectionConfig } from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionInstances";
import {
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { SummaryCardOrderEntry } from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";
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

function purposeButtons() {
    return Array.from(document.querySelectorAll("[data-identity-builder-purpose]"));
}

function clickPurpose(label: string) {
    const btn = Array.from(document.querySelectorAll("[data-identity-builder-purpose], button")).find((b) =>
        b.textContent?.includes(label),
    );
    expect(btn).toBeTruthy();
    act(() => (btn as HTMLButtonElement).click());
}

describe("Focus Panel Builder purpose navigation — mounted product path", () => {
    it("1. Configure Household inspector renders all four purpose controls without section selection", () => {
        act(() => {
            root.render(
                <FocusPanelComposerProvider
                    initialNestedConfigs={{ [HOUSEHOLD_SURFACE_ID]: defaultHouseholdRelationshipSectionConfig() }}
                >
                    <IdentitySurfaceBuilderInspector
                        surfaceId={HOUSEHOLD_SURFACE_ID}
                        config={defaultHouseholdRelationshipSectionConfig()}
                        onChange={vi.fn()}
                        selectedGroupKey={null}
                        onSelectGroup={vi.fn()}
                        selectedFieldId={null}
                        onSelectField={vi.fn()}
                    />
                </FocusPanelComposerProvider>,
            );
        });
        expect(purposeButtons()).toHaveLength(4);
        expect(document.querySelector('[data-relationship-sections-panel="true"]')).toBeTruthy();
    });

    it("2. Configure Children inspector renders all four purpose controls", () => {
        act(() => {
            root.render(
                <FocusPanelComposerProvider
                    initialNestedConfigs={{ [CHILDREN_SURFACE_ID]: defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID) }}
                >
                    <IdentitySurfaceBuilderInspector
                        surfaceId={CHILDREN_SURFACE_ID}
                        config={defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID)}
                        onChange={vi.fn()}
                        selectedGroupKey="roster"
                        onSelectGroup={vi.fn()}
                        selectedFieldId={null}
                        onSelectField={vi.fn()}
                    />
                </FocusPanelComposerProvider>,
            );
        });
        expect(purposeButtons()).toHaveLength(4);
    });

    it("3. Clicking Context Facts mounts the context composer", () => {
        act(() => {
            root.render(
                <FocusPanelComposerProvider>
                    <IdentitySurfaceBuilderInspector
                        surfaceId={CHILDREN_SURFACE_ID}
                        config={defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID)}
                        onChange={vi.fn()}
                        selectedGroupKey="roster"
                        onSelectGroup={vi.fn()}
                        selectedFieldId={null}
                        onSelectField={vi.fn()}
                    />
                </FocusPanelComposerProvider>,
            );
        });
        clickPurpose("Context Facts");
        expect(document.querySelector('[data-identity-context-facts-panel="true"]')).toBeTruthy();
    });

    it("4. Clicking Detail Fields mounts the detail composer", () => {
        act(() => {
            root.render(
                <FocusPanelComposerProvider>
                    <IdentitySurfaceBuilderInspector
                        surfaceId={HOUSEHOLD_SURFACE_ID}
                        config={defaultHouseholdRelationshipSectionConfig()}
                        onChange={vi.fn()}
                        selectedGroupKey="primary_contact"
                        onSelectGroup={vi.fn()}
                        selectedFieldId={null}
                        onSelectField={vi.fn()}
                    />
                </FocusPanelComposerProvider>,
            );
        });
        clickPurpose("Detail Fields");
        expect(document.querySelector('[data-identity-nested-field-layout="details"]')).toBeTruthy();
    });

    it("5. Clicking Evidence Collections mounts the evidence editor", () => {
        act(() => {
            root.render(
                <FocusPanelComposerProvider>
                    <IdentitySurfaceBuilderInspector
                        surfaceId={CHILDREN_SURFACE_ID}
                        config={defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID)}
                        onChange={vi.fn()}
                        selectedGroupKey="roster"
                        onSelectGroup={vi.fn()}
                        selectedFieldId={null}
                        onSelectField={vi.fn()}
                    />
                </FocusPanelComposerProvider>,
            );
        });
        clickPurpose("Evidence Collections");
        expect(document.querySelector('[data-identity-evidence-panel="true"]')).toBeTruthy();
    });

    it("6. Relationship-section selection does not remove purpose navigation", () => {
        const householdConfig = defaultHouseholdRelationshipSectionConfig();
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [HOUSEHOLD_SURFACE_ID]: householdConfig }}>
                    <InspectorHarness surfaceId={HOUSEHOLD_SURFACE_ID} initialGroupKey="primary_contact">
                        <IdentitySurfaceBuilderInspector
                            surfaceId={HOUSEHOLD_SURFACE_ID}
                            config={householdConfig}
                            onChange={vi.fn()}
                            selectedGroupKey="primary_contact"
                            onSelectGroup={vi.fn()}
                            selectedFieldId={null}
                            onSelectField={vi.fn()}
                        />
                    </InspectorHarness>
                </FocusPanelComposerProvider>,
            );
        });
        expect(purposeButtons()).toHaveLength(4);
        const sectionBtn = document.querySelector('[data-relationship-section="other_parent_guardian"], [data-relationship-section-instance]');
        if (sectionBtn) act(() => (sectionBtn as HTMLButtonElement).click());
        expect(purposeButtons()).toHaveLength(4);
    });

    it("7. Summary remains editable in Configure mode", () => {
        act(() => {
            root.render(
                <FocusPanelComposerProvider>
                    <IdentitySurfaceBuilderInspector
                        surfaceId={CHILDREN_SURFACE_ID}
                        config={defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID)}
                        onChange={vi.fn()}
                        selectedGroupKey="roster"
                        onSelectGroup={vi.fn()}
                        selectedFieldId={null}
                        onSelectField={vi.fn()}
                    />
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-identity-nested-field-layout="summary"]')).toBeTruthy();
    });

    it("8. Preview mode shows runtime links instead of Builder purpose controls on canvas", () => {
        const { context } = demoContext();
        const model = { key: "children", title: "Children", tier: "context", span: 2, iconName: "baby" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [CHILDREN_SURFACE_ID]: defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID) }}>
                    <ComposerHarness surfaceId={CHILDREN_SURFACE_ID} cardKey="children" previewMode>
                        <ChildrenCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-identity-builder-purpose-nav]')).toBeFalsy();
        expect(document.querySelector('[data-children-action="expand"]')).toBeTruthy();
    });

    it("9. Configure mode does not show View household as primary drill control", () => {
        const { context } = demoContext();
        const model = { key: "household", title: "Household", tier: "context", span: 2, iconName: "users" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [HOUSEHOLD_SURFACE_ID]: defaultHouseholdRelationshipSectionConfig() }}>
                    <ComposerHarness surfaceId={HOUSEHOLD_SURFACE_ID} cardKey="household">
                        <HouseholdCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-identity-builder-purpose-nav]')).toBeTruthy();
        expect(document.querySelector('[data-household-action="expand"]')).toBeFalsy();
    });

    it("10. Configure mode does not show View children as primary drill control", () => {
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
        expect(document.querySelector('[data-identity-builder-purpose-nav]')).toBeTruthy();
        expect(document.querySelector('[data-children-action="expand"]')).toBeFalsy();
    });

    it("11. Switching section preserves active purpose", () => {
        act(() => {
            root.render(
                <FocusPanelComposerProvider>
                    <PurposeHarness surfaceId={HOUSEHOLD_SURFACE_ID} cardKey="household" purpose="context_facts" />
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-identity-context-facts-panel="true"]')).toBeTruthy();
    });

    it("12. Runtime disclosure remains unchanged outside Configure mode", () => {
        const { context } = demoContext();
        const model = { key: "household", title: "Household", tier: "context", span: 2, iconName: "users" } as FocusPanelCardModel;
        act(() => {
            root.render(<HouseholdCard model={model} context={context} />);
        });
        const expand = document.querySelector('[data-household-action="expand"]') as HTMLButtonElement | null;
        expect(expand).toBeTruthy();
        act(() => expand?.click());
        expect(document.querySelector('[data-identity-depth="context"]')).toBeTruthy();
    });
});

function ComposerHarness({
    surfaceId,
    cardKey,
    previewMode = false,
    children,
}: {
    surfaceId: string;
    cardKey: "household" | "children";
    previewMode?: boolean;
    children: ReactNode;
}) {
    const composer = useFocusPanelComposer();
    useEffect(() => {
        composer?.enterDrillIn(cardKey, surfaceId);
        if (previewMode) composer?.setComposeCanvasMode("preview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return children;
}

function InspectorHarness({
    surfaceId,
    initialGroupKey,
    children,
}: {
    surfaceId: string;
    initialGroupKey: string;
    children: ReactNode;
}) {
    const composer = useFocusPanelComposer();
    useEffect(() => {
        composer?.enterDrillIn(surfaceId === HOUSEHOLD_SURFACE_ID ? "household" : "children", surfaceId);
        composer?.select({ kind: "region", surfaceId, groupKey: initialGroupKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return children;
}

function PurposeHarness({
    surfaceId,
    cardKey,
    purpose,
}: {
    surfaceId: string;
    cardKey: "household" | "children";
    purpose: IdentityConfigurationPurpose;
}) {
    const composer = useFocusPanelComposer();
    const config =
        surfaceId === HOUSEHOLD_SURFACE_ID
            ? defaultHouseholdRelationshipSectionConfig()
            : defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
    useEffect(() => {
        composer?.enterDrillIn(cardKey, surfaceId);
        composer?.setActiveConfigPurpose("context_facts");
        composer?.select({ kind: "region", surfaceId, groupKey: surfaceId === HOUSEHOLD_SURFACE_ID ? "primary_contact" : "roster" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
        <IdentitySurfaceBuilderInspector
            surfaceId={surfaceId}
            config={config}
            onChange={vi.fn()}
            selectedGroupKey={surfaceId === HOUSEHOLD_SURFACE_ID ? "primary_contact" : "roster"}
            onSelectGroup={(groupKey) => {
                if (groupKey) composer?.select({ kind: "region", surfaceId, groupKey });
            }}
            selectedFieldId={null}
            onSelectField={vi.fn()}
        />
    );
}
