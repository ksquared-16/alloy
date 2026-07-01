// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import OperationalQueueRecordRow from "@/components/layout/OperationalQueueRecordRow";
import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildOperationalQueueRecordViewModelFromLayout } from "@/lib/layout/runtime/buildOperationalQueueRecordViewModel";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

function mount(htmlContainer: HTMLElement, ui: ReturnType<typeof createElement>) {
    const root = createRoot(htmlContainer);
    act(() => {
        root.render(ui);
    });
    return () => {
        act(() => root.unmount());
    };
}

function baseItem(): QueuePreviewItemVm {
    return {
        id: "opp-click",
        title: "Mitchell household",
        quickActions: [
            { id: "open", label: "Open" },
            { id: "registry-create_lead", label: "Create Lead", actionId: "create_lead" },
            { id: "registry-ask_bos", label: "Ask BOS", actionId: "ask_bos" },
        ],
        semanticCrmCompact: {
            primaryIdentity: "Mitchell household",
            childName: null,
            contactDisplayName: "Kev Mitchell",
            contactPersonId: "person-mitchell",
            contactPhoneDisplay: "(503) 555-4729",
            contactEmail: "kevin@example.com",
            programContext: null,
            statusLabel: "Contact Attempted",
            stageLabel: null,
            nextStep: "Call family",
            lastActivity: null,
            commercialValue: null,
            contactSnippet: null,
            roomContext: null,
            ageContext: null,
            attentionReason: "Follow up",
            familyNote: null,
            tourContext: null,
            locationContext: "South Campus",
            childrenLines: [{ primary: "Alex Kelly", personId: "child-alex", secondary: "(6m)" }],
        },
    };
}

function renderRow(overrides: Partial<Parameters<typeof OperationalQueueRecordRow>[0]> = {}) {
    const doc = buildLeadQueueDefaultDoc();
    const item = baseItem();
    const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
    const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onOpen = overrides.onOpen ?? vi.fn();
    const unmount = mount(
        host,
        createElement(OperationalQueueRecordRow, {
            vm,
            record,
            onOpen,
            drawerHandlers: { onOpenPerson: vi.fn(), onOpenChild: vi.fn() },
            rowActions: item.quickActions,
            onRowAction: vi.fn(),
            ...overrides,
        }),
    );
    return { host, unmount, onOpen, item, record };
}

describe("OperationalQueueRecordRow explicit click zones", () => {
    it("outer card wrapper click does not open opportunity", async () => {
        const doc = buildLeadQueueDefaultDoc();
        const item = baseItem();
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
        const onOpen = vi.fn();
        const onCardOpen = vi.fn();

        const host = document.createElement("div");
        document.body.appendChild(host);
        const unmount = mount(
            host,
            createElement(
                "div",
                {
                    "data-queue-row-operational-card": "true",
                    onClick: onCardOpen,
                },
                createElement(OperationalQueueRecordRow, {
                    vm,
                    record,
                    onOpen,
                    drawerHandlers: { onOpenPerson: vi.fn(), onOpenChild: vi.fn() },
                    rowActions: item.quickActions,
                    onRowAction: vi.fn(),
                }),
            ),
        );

        const card = host.querySelector("[data-queue-row-operational-card]") as HTMLElement;
        act(() => {
            card.click();
        });
        expect(onCardOpen).toHaveBeenCalledTimes(1);
        expect(onOpen).not.toHaveBeenCalled();
        unmount();
        host.remove();
    });

    it("row content click opens opportunity drawer", async () => {
        const { host, unmount, onOpen } = renderRow();
        const content = host.querySelector('[data-queue-row-content-open="true"]') as HTMLElement;
        expect(content).toBeTruthy();
        act(() => {
            content.click();
        });
        expect(onOpen).toHaveBeenCalledTimes(1);
        unmount();
        host.remove();
    });

    it("open zone content click opens opportunity drawer", async () => {
        const { host, unmount, onOpen } = renderRow();
        const zone = host.querySelector(".queue-row-open-zone") as HTMLElement;
        expect(zone).toBeTruthy();
        act(() => {
            zone.click();
        });
        expect(onOpen).toHaveBeenCalledTimes(1);
        unmount();
        host.remove();
    });

    it("person linked field button opens person drawer", async () => {
        const onOpenPerson = vi.fn();
        const { host, unmount, onOpen } = renderRow({
            drawerHandlers: { onOpenPerson, onOpenChild: vi.fn() },
        });
        const personLink = host.querySelector('[data-layout-runtime-adornment-entity="person"]') as HTMLButtonElement;
        expect(personLink).toBeTruthy();
        act(() => {
            personLink.click();
        });
        expect(onOpenPerson).toHaveBeenCalledWith("person-mitchell");
        expect(onOpen).not.toHaveBeenCalled();
        unmount();
        host.remove();
    });

    it("person linked field label click opens person drawer", async () => {
        const onOpenPerson = vi.fn();
        const { host, unmount, onOpen } = renderRow({
            drawerHandlers: { onOpenPerson, onOpenChild: vi.fn() },
        });
        const personLink = host.querySelector('[data-layout-runtime-adornment-entity="person"]') as HTMLButtonElement;
        const label = personLink?.querySelector(".queue-record-field__text") as HTMLElement;
        expect(label).toBeTruthy();
        act(() => {
            label.click();
        });
        expect(onOpenPerson).toHaveBeenCalledWith("person-mitchell");
        expect(onOpen).not.toHaveBeenCalled();
        unmount();
        host.remove();
    });

    it("household linked field opens opportunity drawer once", async () => {
        const { host, unmount, onOpen } = renderRow();
        const householdLink = host.querySelector('[data-layout-runtime-adornment-entity="opportunity"]') as HTMLButtonElement;
        expect(householdLink).toBeTruthy();
        act(() => {
            householdLink.click();
        });
        expect(onOpen).toHaveBeenCalledTimes(1);
        unmount();
        host.remove();
    });

    it("child linked field button opens child drawer", async () => {
        const onOpenChild = vi.fn();
        const { host, unmount, onOpen } = renderRow({
            drawerHandlers: { onOpenPerson: vi.fn(), onOpenChild },
        });
        const childLink = host.querySelector('[data-layout-runtime-adornment-entity="child"]') as HTMLButtonElement;
        expect(childLink).toBeTruthy();
        act(() => {
            childLink.click();
        });
        expect(onOpenChild).toHaveBeenCalledWith("child-alex");
        expect(onOpen).not.toHaveBeenCalled();
        unmount();
        host.remove();
    });

    it("child linked field label click opens child drawer", async () => {
        const onOpenChild = vi.fn();
        const { host, unmount, onOpen } = renderRow({
            drawerHandlers: { onOpenPerson: vi.fn(), onOpenChild },
        });
        const childButton = host.querySelector('[data-layout-runtime-adornment-entity="child"]') as HTMLElement;
        const label = childButton?.querySelector(".queue-record-field__text") as HTMLElement;
        expect(label).toBeTruthy();
        act(() => {
            label.click();
        });
        expect(onOpenChild).toHaveBeenCalledWith("child-alex");
        expect(onOpen).not.toHaveBeenCalled();
        unmount();
        host.remove();
    });

    it("actions button does not open opportunity", async () => {
        const { host, unmount, onOpen } = renderRow();
        const actionsTrigger = host.querySelector(".operational-queue-row__actions-trigger") as HTMLButtonElement;
        act(() => {
            actionsTrigger.click();
        });
        expect(onOpen).not.toHaveBeenCalled();
        unmount();
        host.remove();
    });

    it("BOS button does not open opportunity", async () => {
        const onRowAction = vi.fn();
        const { host, unmount, onOpen } = renderRow({ onRowAction });
        const bosBtn = host.querySelector("[data-queue-row-bos-button]") as HTMLButtonElement;
        act(() => {
            bosBtn.click();
        });
        expect(onRowAction).toHaveBeenCalled();
        expect(onOpen).not.toHaveBeenCalled();
        unmount();
        host.remove();
    });

    it("collapse click does not open opportunity", async () => {
        const onToggleCollapsed = vi.fn();
        const { host, unmount, onOpen } = renderRow({ onToggleCollapsed });
        const toggle = host.querySelector(".operational-queue-row__collapse-toggle") as HTMLButtonElement;
        act(() => {
            toggle.click();
        });
        expect(onToggleCollapsed).toHaveBeenCalled();
        expect(onOpen).not.toHaveBeenCalled();
        unmount();
        host.remove();
    });

    it("missing child id no-ops and does not open opportunity", async () => {
        const onOpenChild = vi.fn();
        const doc = buildLeadQueueDefaultDoc();
        const item = baseItem();
        delete item.layoutRuntimeEnrichment;
        item.semanticCrmCompact!.childrenLines = [{ primary: "Jim Pat" }, { primary: "Sam Lee" }];
        const record = buildOpportunityQueueRowRecordFromPreview(item, doc);
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record);
        const onOpen = vi.fn();

        const host = document.createElement("div");
        document.body.appendChild(host);
        const unmount = mount(
            host,
            createElement(OperationalQueueRecordRow, {
                vm,
                record,
                onOpen,
                drawerHandlers: { onOpenPerson: vi.fn(), onOpenChild },
                rowActions: item.quickActions,
                onRowAction: vi.fn(),
            }),
        );

        const childLink = host.querySelector(
            '[data-queue-row-linked-field="true"][data-layout-runtime-adornment-entity="child"]',
        ) as HTMLButtonElement | null;
        expect(childLink).toBeNull();
        const unresolved = host.querySelector('[data-queue-row-link-unresolved="true"]');
        expect(unresolved).not.toBeNull();
        if (childLink) {
            act(() => {
                childLink.click();
            });
        }
        expect(onOpenChild).not.toHaveBeenCalled();
        const content = host.querySelector('[data-queue-row-content-open="true"]') as HTMLElement;
        act(() => {
            content.click();
        });
        expect(onOpen).toHaveBeenCalledTimes(1);
        unmount();
        host.remove();
    });
});
