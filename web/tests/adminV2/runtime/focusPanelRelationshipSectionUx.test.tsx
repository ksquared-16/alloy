// @vitest-environment jsdom
import React, { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HouseholdCard from "@/components/admin/focusPanel/cards/HouseholdCard";
import IdentitySurfaceBuilderInspector from "@/components/adminV2/settings/surfaces/composer/IdentitySurfaceBuilderInspector";
import RelationshipSectionsPanel from "@/components/adminV2/settings/surfaces/composer/RelationshipSectionsPanel";
import { FocusPanelComposerProvider, useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import {
    defaultHouseholdRelationshipSectionConfig,
    listHouseholdRelationshipSectionInstances,
    removeHouseholdRelationshipSectionInstance,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionInstances";
import { buildHouseholdRelationshipAuthoringTabs } from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipAuthoringTabs";
import { canRemoveHouseholdRelationshipInstance } from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionDefinitions";
import {
    addFieldToNestedGroup,
    HOUSEHOLD_SURFACE_ID,
    identityConfigurationFieldKeys,
    reconcileNestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { HOUSEHOLD_ALWAYS_ENABLED_KEYS } from "@/lib/adminV2/settings/surfaces/nestedSurfaceSectionOrder";
import { HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP } from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";

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
    return buildOperationalContext({
        subjectId: String(vm.entity.id),
        title: vm.header.title,
        subjectVm: vm,
        truth: record,
        perspective: null,
        statusLabel: "Tour scheduled",
        canMutate: false,
    });
}

describe("Relationship section deletion semantics", () => {
    it("1. Additional Contacts delete control works", () => {
        let config = defaultHouseholdRelationshipSectionConfig();
        expect(
            listHouseholdRelationshipSectionInstances(config).some((i) => i.definitionKey === "additional_contact"),
        ).toBe(true);
        expect(canRemoveHouseholdRelationshipInstance({ definitionKey: "additional_contact" })).toBe(true);
        config = removeHouseholdRelationshipSectionInstance(config, "household_members");
        expect(
            listHouseholdRelationshipSectionInstances(config).some((i) => i.definitionKey === "additional_contact"),
        ).toBe(false);
    });

    it("2. Removed section stays removed after reconcile/reload", () => {
        let config = removeHouseholdRelationshipSectionInstance(
            defaultHouseholdRelationshipSectionConfig(),
            "household_members",
        );
        config = reconcileNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID, config);
        expect(
            listHouseholdRelationshipSectionInstances(config).some((i) => i.definitionKey === "additional_contact"),
        ).toBe(false);
        const group = config.groups.find((g) => g.key === "household_members");
        expect(group?.enabled).toBe(false);
    });

    it("3. Runtime does not render removed Additional Contacts section", () => {
        const context = demoContext();
        let config = removeHouseholdRelationshipSectionInstance(
            defaultHouseholdRelationshipSectionConfig(),
            "household_members",
        );
        config = reconcileNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID, config);
        const evidence = buildHouseholdCardEvidence(context, { nestedConfig: config });
        expect(evidence.groups.some((g) => g.key === "household_members")).toBe(false);
    });

    it("4. Required Primary Contact cannot be incorrectly deleted", () => {
        expect(canRemoveHouseholdRelationshipInstance({ definitionKey: "parent_primary" })).toBe(false);
        expect(HOUSEHOLD_ALWAYS_ENABLED_KEYS).toContain("primary_contact");
        expect(HOUSEHOLD_ALWAYS_ENABLED_KEYS).not.toContain("household_members");
        const before = defaultHouseholdRelationshipSectionConfig();
        const after = removeHouseholdRelationshipSectionInstance(before, "primary_contact");
        expect(
            listHouseholdRelationshipSectionInstances(after).some((i) => i.definitionKey === "parent_primary"),
        ).toBe(true);
    });
});

describe("Collapsible Relationship Sections management", () => {
    it("5–7. Collapse/expand preserves selection and does not mutate config", () => {
        const onChange = vi.fn();
        const config = defaultHouseholdRelationshipSectionConfig();
        act(() => {
            root.render(
                <RelationshipSectionsPanel
                    config={config}
                    onChange={onChange}
                    selectedInstanceKey="primary_contact"
                    defaultCollapsed
                    fieldAuthoringActive
                />,
            );
        });
        expect(document.querySelector('[data-relationship-sections-collapsed="true"]')).toBeTruthy();
        expect(document.querySelector('[data-relationship-sections-compact="true"]')).toBeTruthy();
        act(() => {
            (document.querySelector('[data-relationship-sections-manage="true"]') as HTMLButtonElement).click();
        });
        expect(document.querySelector('[data-relationship-sections-collapsed="false"]')).toBeTruthy();
        expect(document.querySelector('[data-relationship-section-list="true"]')).toBeTruthy();
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("Section tabs for disclosure authoring", () => {
    it("8–11. Purpose modes render section tabs; Children is handoff", () => {
        const config = defaultHouseholdRelationshipSectionConfig();
        const tabs = buildHouseholdRelationshipAuthoringTabs(config);
        expect(tabs.some((t) => t.kind === "parent_guardian_shared")).toBe(true);
        expect(tabs.some((t) => t.label === "Parent#2" || /^parent#2$/i.test(t.label))).toBe(false);
        expect(tabs.filter((t) => t.kind === "parent_override")).toHaveLength(0);
        expect(tabs.some((t) => t.kind === "children_handoff")).toBe(true);

        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [HOUSEHOLD_SURFACE_ID]: config }}>
                    <ControlledInspectorHarness config={config} />
                </FocusPanelComposerProvider>,
            );
        });
        expect(document.querySelector('[data-identity-relationship-section-tabs="true"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-section-tab-kind="parent_guardian_shared"]')).toBeTruthy();
        clickTab("Children");
        expect(document.querySelector('[data-household-children-handoff="true"]')).toBeTruthy();
        expect(document.body.textContent).toContain("Configure Children surface");
    });
});

describe("Parent / Guardian Add Field", () => {
    it("12–15. Context Facts Add field mutates context tier only", () => {
        let config = defaultHouseholdRelationshipSectionConfig();
        const summaryBefore = identityConfigurationFieldKeys(config, HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP, "summary");
        config = addFieldToNestedGroup(config, HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP, "person.preferred_name", {
            tier: "context_fact",
        });
        expect(
            identityConfigurationFieldKeys(config, HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP, "context_facts"),
        ).toContain("person.preferred_name");
        expect(identityConfigurationFieldKeys(config, HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP, "summary")).toEqual(
            summaryBefore,
        );
    });
});

describe("Opaque elevated Household composer", () => {
    it("16–20. Configure Household shows opaque compose shell and purpose tabs", () => {
        const context = demoContext();
        const model = { key: "household", title: "Household", tier: "context", span: 2, iconName: "users" } as FocusPanelCardModel;
        act(() => {
            root.render(
                <FocusPanelComposerProvider
                    initialNestedConfigs={{ [HOUSEHOLD_SURFACE_ID]: defaultHouseholdRelationshipSectionConfig() }}
                >
                    <ComposerHarness>
                        <HouseholdCard model={model} context={context} />
                    </ComposerHarness>
                </FocusPanelComposerProvider>,
            );
        });
        const canvas = document.querySelector('[data-identity-compose-canvas]') as HTMLElement | null;
        expect(canvas).toBeTruthy();
        expect(canvas?.className).toContain("bg-white");
        expect(document.querySelector('[data-identity-relationship-section-tabs="true"]')).toBeTruthy();
        expect(document.querySelector('[data-relationship-sections-collapsed="true"]')).toBeTruthy();
        expect(document.body.textContent).not.toMatch(/Parent#2/);
        expect(document.querySelector('[data-household-action="expand"]')).toBeFalsy();
    });
});


function ControlledInspectorHarness({ config }: { config: ReturnType<typeof defaultHouseholdRelationshipSectionConfig> }) {
    const composer = useFocusPanelComposer();
    const [selectedGroupKey, setSelectedGroupKey] = React.useState<string | null>("primary_contact");
    useEffect(() => {
        composer?.enterDrillIn("household", HOUSEHOLD_SURFACE_ID);
        composer?.select({ kind: "region", surfaceId: HOUSEHOLD_SURFACE_ID, groupKey: "primary_contact" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
        <IdentitySurfaceBuilderInspector
            surfaceId={HOUSEHOLD_SURFACE_ID}
            config={config}
            onChange={vi.fn()}
            selectedGroupKey={selectedGroupKey}
            onSelectGroup={(groupKey) => {
                setSelectedGroupKey(groupKey);
                if (groupKey) composer?.select({ kind: "region", surfaceId: HOUSEHOLD_SURFACE_ID, groupKey });
            }}
            selectedFieldId={null}
            onSelectField={vi.fn()}
        />
    );
}

function clickTab(label: string) {
    const btn = Array.from(document.querySelectorAll("[data-identity-compose-section], button")).find((b) =>
        b.textContent?.includes(label),
    );
    expect(btn).toBeTruthy();
    act(() => (btn as HTMLButtonElement).click());
}

function InspectorHarness({
    purpose,
    children,
}: {
    purpose?: "summary" | "context_facts" | "details" | "evidence";
    children: ReactNode;
}) {
    const composer = useFocusPanelComposer();
    useEffect(() => {
        composer?.enterDrillIn("household", HOUSEHOLD_SURFACE_ID);
        if (purpose) composer?.setActiveConfigPurpose(purpose);
        composer?.select({
            kind: "region",
            surfaceId: HOUSEHOLD_SURFACE_ID,
            groupKey: HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return children;
}

function ComposerHarness({ children }: { children: ReactNode }) {
    const composer = useFocusPanelComposer();
    useEffect(() => {
        composer?.enterDrillIn("household", HOUSEHOLD_SURFACE_ID);
        composer?.select({
            kind: "region",
            surfaceId: HOUSEHOLD_SURFACE_ID,
            groupKey: HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return children;
}
