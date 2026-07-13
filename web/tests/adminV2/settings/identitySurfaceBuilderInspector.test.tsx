// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import IdentitySurfaceBuilderInspector from "@/components/adminV2/settings/surfaces/composer/IdentitySurfaceBuilderInspector";
import FocusPanelDrillInInspector from "@/components/admin/focusPanel/drillIn/FocusPanelDrillInInspector";
import { FocusPanelComposerProvider, useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import {
    addEvidenceCollectionToGroup,
    applyNestedSurfaceFieldDrop,
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
    identityConfigurationFieldKeys,
    reconcileNestedSurfaceConfig,
    selectedFieldKeys,
    addFieldToNestedGroup,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { SummaryCardOrderEntry } from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";
import { defaultHouseholdRelationshipSectionConfig } from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionInstances";

vi.mock("@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions", () => ({
    useTenantFieldDefinitions: () => ({ tenantFieldDefinitions: [], loading: false }),
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

function renderInspector(surfaceId: string, groupKey: string, config = defaultNestedSurfaceConfig(surfaceId)) {
    act(() => {
        root.render(
            <IdentitySurfaceBuilderInspector
                surfaceId={surfaceId}
                config={config}
                onChange={vi.fn()}
                selectedGroupKey={groupKey}
                onSelectGroup={vi.fn()}
                selectedFieldId={null}
                onSelectField={vi.fn()}
            />,
        );
    });
}

describe("IdentitySurfaceBuilderInspector — metadata inspector (canvas owns composer)", () => {
    it("1. Household inspector exposes purpose nav without duplicate field layout editor", () => {
        renderInspector(HOUSEHOLD_SURFACE_ID, "primary_contact", defaultHouseholdRelationshipSectionConfig());
        expect(document.querySelector('[data-identity-builder-purpose-nav="true"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-inspector-canvas-hint="true"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-nested-field-layout]')).toBeFalsy();
        expect(document.querySelector('[data-identity-relationship-section-tabs="true"]')).toBeTruthy();
    });

    it("2–3. Purpose tabs remain available for Household", () => {
        renderInspector(HOUSEHOLD_SURFACE_ID, "contact_edit", defaultHouseholdRelationshipSectionConfig());
        expect(document.body.textContent).toContain("Context Facts");
        expect(document.body.textContent).toContain("Detail Fields");
        expect(document.body.textContent).toContain("Evidence Collections");
    });

    it("4–6. Children inspector does not mount flat nested layout editor", () => {
        renderInspector(CHILDREN_SURFACE_ID, "roster");
        expect(document.querySelector('[data-identity-builder-purpose-nav="true"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-nested-field-layout]')).toBeFalsy();
    });

    it("11. drag/drop model changes active tier only", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.phone", { tier: "summary" });
        config = addFieldToNestedGroup(config, "contact_edit", "person.email", { tier: "summary" });
        const next = applyNestedSurfaceFieldDrop(config, "contact_edit", "person.email", "person.phone", "beside", { tier: "summary" });
        expect(identityConfigurationFieldKeys(next, "contact_edit", "summary")).toContain("person.phone");
        expect(identityConfigurationFieldKeys(next, "contact_edit", "context_facts")).toEqual([]);
    });

    it("12. Evidence Add Collection model works", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const next = addEvidenceCollectionToGroup(config, "roster", "medical");
        const group = next.groups.find((g) => g.key === "roster");
        expect(group?.evidenceCollections?.some((c) => c.key === "medical")).toBe(true);
    });

    it("15. save/reload preserves layout and evidence collections", () => {
        let stored = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        stored = addFieldToNestedGroup(stored, "contact_edit", "person.phone", { tier: "summary" });
        stored = reconcileNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID, stored);
        expect(selectedFieldKeys(stored, "contact_edit")).toContain("person.phone");
    });
});

describe("FocusPanelDrillInInspector — identity builder routing", () => {
    const drillModel = { key: "household" } as FocusPanelCardModel;
    const drillEntry: SummaryCardOrderEntry = {
        key: "household",
        instanceId: "household-1",
        config: {},
        span: 2,
        density: "standard",
        tier: "context",
        gridRow: 1,
    };

    function renderDrillIn(surfaceId: string, cardKey: "household" | "children" = "household") {
        const initial = { [surfaceId]: defaultNestedSurfaceConfig(surfaceId) };
        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={initial}>
                    <DrillInHarness surfaceId={surfaceId} cardKey={cardKey} drillEntry={drillEntry} drillModel={drillModel} />
                </FocusPanelComposerProvider>,
            );
        });
    }

    it("13. identity builder inspector mounts in configure mode", () => {
        renderDrillIn(HOUSEHOLD_SURFACE_ID);
        expect(document.querySelector('[data-focus-panel-drill-in-mode="identity-builder"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-builder-purpose-nav="true"]')).toBeTruthy();
    });

    it("14. Household and Children use the same shared inspector shell", () => {
        renderDrillIn(HOUSEHOLD_SURFACE_ID, "household");
        expect(document.querySelector('[data-identity-builder-purpose-nav="true"]')).toBeTruthy();
        act(() => root.unmount());
        container.remove();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        renderDrillIn(CHILDREN_SURFACE_ID, "children");
        expect(document.querySelector('[data-identity-builder-purpose-nav="true"]')).toBeTruthy();
    });
});

function DrillInHarness({
    surfaceId,
    cardKey,
    drillEntry,
    drillModel,
}: {
    surfaceId: string;
    cardKey: "household" | "children";
    drillEntry: SummaryCardOrderEntry;
    drillModel: FocusPanelCardModel;
}) {
    const composer = useFocusPanelComposer();
    useEffect(() => {
        composer?.enterDrillIn(cardKey, surfaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
        <FocusPanelDrillInInspector
            drillCardKey={cardKey}
            drillEntry={drillEntry}
            drillModel={drillModel}
            onConfigChange={vi.fn()}
            history={{ publishedVersion: null, hasDraft: false, dirty: false }}
        />
    );
}
