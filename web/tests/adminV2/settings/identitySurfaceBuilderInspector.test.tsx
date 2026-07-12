// @vitest-environment jsdom
import { act, useEffect } from "react";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import IdentitySurfaceBuilderInspector from "@/components/adminV2/settings/surfaces/composer/IdentitySurfaceBuilderInspector";
import FocusPanelDrillInInspector from "@/components/admin/focusPanel/drillIn/FocusPanelDrillInInspector";
import { FocusPanelComposerProvider } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import {
    addEvidenceCollectionToGroup,
    addFieldToNestedGroup,
    applyNestedSurfaceFieldDrop,
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
    identityConfigurationFieldKeys,
    reconcileNestedSurfaceConfig,
    selectedFieldKeys,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { SummaryCardOrderEntry } from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";

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

function renderInspector(
    surfaceId: string,
    groupKey: string,
    config = defaultNestedSurfaceConfig(surfaceId),
    onChange = vi.fn(),
) {
    act(() => {
        root.render(
            <IdentitySurfaceBuilderInspector
                surfaceId={surfaceId}
                config={config}
                onChange={onChange}
                selectedGroupKey={groupKey}
                onSelectGroup={vi.fn()}
                selectedFieldId={null}
                onSelectField={vi.fn()}
            />,
        );
    });
}

function clickPurpose(label: string) {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes(label));
    expect(btn).toBeTruthy();
    act(() => btn!.click());
}

describe("IdentitySurfaceBuilderInspector — shared layout composer mounts", () => {
    it("1. Household Summary mounts drag/drop composer with handles and width controls", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.phone", { tier: "summary" });
        config = addFieldToNestedGroup(config, "primary_contact", "person.email", { tier: "summary" });
        renderInspector(HOUSEHOLD_SURFACE_ID, "primary_contact", config);

        expect(document.querySelector('[data-identity-surface-builder-inspector="group"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-nested-field-layout="summary"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-layout-field="person.phone"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-layout-field="person.email"]')).toBeTruthy();
        expect(document.querySelectorAll('[draggable="true"]').length).toBeGreaterThanOrEqual(2);
        expect(document.body.textContent).toContain("Full");
        expect(document.body.textContent).toContain("Half");
        expect(document.querySelector('button[aria-label*="Remove"]')).toBeTruthy();
    });

    it("2. Household Context Facts mounts shared composer", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.phone", { tier: "context_fact" });
        renderInspector(HOUSEHOLD_SURFACE_ID, "primary_contact", config);
        clickPurpose("Context Facts");
        expect(document.querySelector('[data-identity-context-facts-panel="true"]')).toBeTruthy();
    });

    it("3. Household Details mounts shared composer", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.email", { tier: "details" });
        renderInspector(HOUSEHOLD_SURFACE_ID, "primary_contact", config);
        clickPurpose("Detail Fields");
        expect(document.querySelector('[data-identity-nested-field-layout="details"]')).toBeTruthy();
    });

    it("4. Children Summary mounts shared composer", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.name", { tier: "summary" });
        renderInspector(CHILDREN_SURFACE_ID, "roster", config);
        expect(document.querySelector('[data-identity-nested-field-layout="summary"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-layout-field="child.name"]')).toBeTruthy();
    });

    it("5. Children Context Facts mounts shared composer", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.dob_age", { tier: "context_fact" });
        renderInspector(CHILDREN_SURFACE_ID, "roster", config);
        clickPurpose("Context Facts");
        expect(document.querySelector('[data-identity-context-facts-panel="true"]')).toBeTruthy();
    });

    it("6. Children Details mounts shared composer", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.nickname", { tier: "details" });
        renderInspector(CHILDREN_SURFACE_ID, "roster", config);
        clickPurpose("Detail Fields");
        expect(document.querySelector('[data-identity-nested-field-layout="details"]')).toBeTruthy();
    });

    it("7. Children Evidence mounts evidence collection editor", () => {
        renderInspector(CHILDREN_SURFACE_ID, "roster");
        clickPurpose("Evidence Collections");
        expect(document.querySelector('[data-identity-evidence-panel="true"]')).toBeTruthy();
        expect(document.body.textContent).toContain("Add collection");
    });

    it("8–10. drag handles, remove, and half/full width controls render", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.phone", { tier: "summary" });
        renderInspector(HOUSEHOLD_SURFACE_ID, "primary_contact", config);
        expect(document.querySelector('[draggable="true"]')).toBeTruthy();
        expect(document.querySelector('button[aria-label*="Remove"]')).toBeTruthy();
        expect(document.body.textContent).toMatch(/Full/);
        expect(document.body.textContent).toMatch(/Half/);
    });

    it("11. drag/drop model changes active tier only", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.phone", { tier: "summary" });
        config = addFieldToNestedGroup(config, "primary_contact", "person.email", { tier: "summary" });
        const next = applyNestedSurfaceFieldDrop(config, "primary_contact", "person.email", "person.phone", "beside", { tier: "summary" });
        expect(identityConfigurationFieldKeys(next, "primary_contact", "summary")).toContain("person.phone");
        expect(identityConfigurationFieldKeys(next, "primary_contact", "summary")).toContain("person.email");
        expect(identityConfigurationFieldKeys(next, "primary_contact", "context_facts")).toEqual([]);
    });

    it("12. Evidence Add Collection works", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const next = addEvidenceCollectionToGroup(config, "roster", "medical");
        const group = next.groups.find((g) => g.key === "roster");
        expect(group?.evidenceCollections?.some((c) => c.key === "medical")).toBe(true);
        renderInspector(CHILDREN_SURFACE_ID, "roster", next);
        clickPurpose("Evidence Collections");
        expect(document.body.textContent).toContain("Medical");
    });

    it("15. save/reload preserves layout and evidence collections", () => {
        let stored = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        stored = addFieldToNestedGroup(stored, "primary_contact", "person.phone", { tier: "summary" });
        stored = reconcileNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID, stored);
        const reopened = reconcileNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID, stored);
        expect(selectedFieldKeys(reopened, "primary_contact")).toContain("person.phone");

        let childStored = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        childStored = addEvidenceCollectionToGroup(childStored, "roster", "documents");
        childStored = reconcileNestedSurfaceConfig(CHILDREN_SURFACE_ID, childStored);
        const childReopened = reconcileNestedSurfaceConfig(CHILDREN_SURFACE_ID, childStored);
        const roster = childReopened.groups.find((g) => g.key === "roster");
        expect(roster?.evidenceCollections?.some((c) => c.key === "documents")).toBe(true);
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

    it("13. Preview mode does not replace Configure mode — identity builder inspector mounts", () => {
        renderDrillIn(HOUSEHOLD_SURFACE_ID);
        expect(document.querySelector('[data-focus-panel-drill-in-mode="identity-builder"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-surface-builder-inspector="group"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-nested-field-layout="summary"]')).toBeTruthy();
    });

    it("14. Household and Children use the same shared composer component", () => {
        renderDrillIn(HOUSEHOLD_SURFACE_ID, "household");
        expect(document.querySelector('[data-identity-surface-builder-inspector="group"]')).toBeTruthy();
        act(() => root.unmount());
        container.remove();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        renderDrillIn(CHILDREN_SURFACE_ID, "children");
        expect(document.querySelector('[data-identity-surface-builder-inspector="group"]')).toBeTruthy();
        expect(document.querySelector('[data-identity-nested-field-layout="summary"]')).toBeTruthy();
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
