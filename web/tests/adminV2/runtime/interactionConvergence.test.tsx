// @vitest-environment jsdom
/**
 * Slice 7 Phase B — interaction convergence at shared owners.
 * E2E-11 focus return · E2E-13 legacy Escape · E2E-14 modal geometry · E2E-15 Household refresh.
 * Baselines measured on deployed 83fa1605: focus fell to <body> on all 8 close paths tried; Escape
 * left the Add Person modal open; its Close sat under the app bar; Household did not refresh.
 */
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionModalOverlayShell } from "@/components/admin/opportunity/actions/ActionModalOverlayShell";
import { hasInnerDismissibleLayer } from "@/lib/adminV2/runtime/focusPanel/escapeLayerOwnership";
import {
    captureWorkspaceLauncher,
    restoreWorkspaceLauncher,
    workspaceLauncherSelector,
} from "@/lib/adminV2/runtime/focusPanel/workspaceLauncherFocus";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = "";
});
const esc = () => act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });

describe("E2E-13 — the shared legacy modal shell closes on Escape", () => {
    it("closes when open and idle", () => {
        const onClose = vi.fn();
        act(() => root!.render(<ActionModalOverlayShell open onClose={onClose}><button>x</button></ActionModalOverlayShell>));
        esc();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
    it("does not close while busy (the rule the backdrop already follows)", () => {
        const onClose = vi.fn();
        act(() => root!.render(<ActionModalOverlayShell open busy onClose={onClose}><button>x</button></ActionModalOverlayShell>));
        esc();
        expect(onClose).not.toHaveBeenCalled();
    });
    it("registers as an inner Escape layer so the Focus Panel grid yields to the modal", () => {
        const onClose = vi.fn();
        act(() => root!.render(<ActionModalOverlayShell open onClose={onClose}><div role="listbox" data-alloy-select-menu="true" /></ActionModalOverlayShell>));
        // Whatever the transient-popup selector is, a registered popup must win; assert via the owner.
        const popupOpen = document.querySelector('[data-opportunity-drawer-action-overlay="true"]');
        expect(popupOpen).not.toBeNull();
        expect(hasInnerDismissibleLayer(document)).toBe(true); // the Focus Panel grid yields to the modal
    });
    it("is inert when closed", () => {
        const onClose = vi.fn();
        act(() => root!.render(<ActionModalOverlayShell open={false} onClose={onClose}><button>x</button></ActionModalOverlayShell>));
        esc();
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe("E2E-14 — the shell starts below the app chrome and publishes the usable height", () => {
    it("insets the overlay by the shell header band and exposes --alloy-action-modal-max-h", () => {
        act(() => root!.render(<ActionModalOverlayShell open onClose={() => {}}><button>x</button></ActionModalOverlayShell>));
        const overlay = document.querySelector<HTMLElement>('[data-opportunity-drawer-action-overlay="true"]')!;
        expect(overlay.style.top).toContain("--adminv2-drawer-inset-top");
        expect(overlay.style.getPropertyValue("--alloy-action-modal-max-h")).toContain("--adminv2-drawer-inset-top");
        const addPerson = readFileSync(resolve(process.cwd(), "components/admin/opportunity/actions/AddPersonModal.tsx"), "utf8");
        expect(addPerson).toContain("max-h-[var(--alloy-action-modal-max-h)]");
    });
});

describe("E2E-11 — focus returns to the launcher", () => {
    function mountButtons(html: string) {
        host!.innerHTML = html;
    }
    it("returns to the same launcher when it survived", () => {
        mountButtons('<div data-focus-panel-cell-key="business_process"><button data-process-action="waitlist_child">Move</button></div>');
        const btn = host!.querySelector<HTMLButtonElement>("button")!;
        btn.focus();
        const launcher = captureWorkspaceLauncher(document, false);
        (document.activeElement as HTMLElement).blur();
        expect(restoreWorkspaceLauncher(document, launcher)).toBe(btn);
        expect(document.activeElement).toBe(btn);
    });
    it("re-resolves a launcher the summary re-rendered (the old node is gone)", () => {
        mountButtons('<button data-process-action="add_child">Add Child</button>');
        host!.querySelector<HTMLButtonElement>("button")!.focus();
        const launcher = captureWorkspaceLauncher(document, false);
        mountButtons('<button data-process-action="add_child">Add Child</button>'); // remount
        const fresh = host!.querySelector<HTMLButtonElement>("button")!;
        expect(restoreWorkspaceLauncher(document, launcher)).toBe(fresh);
        expect(document.activeElement).toBe(fresh);
    });
    it("a Manage item returns to the Manage trigger; a carried-in Manage intent with focus lost does too", () => {
        mountButtons('<button data-focus-panel-manage-trigger="true">Manage</button><div data-record-drawer-manage-menu-portal="true"><button data-registry-action-key="add_child">Add Child</button></div>');
        const item = host!.querySelector<HTMLButtonElement>('[data-registry-action-key]')!;
        expect(workspaceLauncherSelector(item)).toBe('[data-focus-panel-manage-trigger="true"]');
        (document.activeElement as HTMLElement | null)?.blur();
        const launcher = captureWorkspaceLauncher(document, true);
        expect(restoreWorkspaceLauncher(document, launcher)?.textContent).toBe("Manage");
    });
    it("Children / Household '+' launchers have stable addresses", () => {
        mountButtons('<button data-children-action="add-child">+</button><button data-household-action="add-contact">+</button>');
        const [a, b] = Array.from(host!.querySelectorAll("button"));
        expect(workspaceLauncherSelector(a as HTMLElement)).toBe('[data-children-action="add-child"]');
        expect(workspaceLauncherSelector(b as HTMLElement)).toBe('[data-household-action="add-contact"]');
    });
    it("the host owns it: the grid captures on open and restores on close; the card's dead focus is gone", () => {
        const grid = readFileSync(resolve(process.cwd(), "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"), "utf8");
        expect(grid).toContain("captureWorkspaceLauncher(");
        expect(grid).toContain("restoreWorkspaceLauncher(document, launcher)");
        const card = readFileSync(resolve(process.cwd(), "components/admin/focusPanel/cards/CurrentWorkCard.tsx"), "utf8");
        expect(card).not.toContain("queueMicrotask(() => openWorkspaceTriggerRef.current?.focus())");
    });
});

describe("E2E-15 — Add Person reloads the record the Household card projects", () => {
    it("the Add Person success path reloads the drawer view model like every sibling relationship mutation", () => {
        const src = readFileSync(resolve(process.cwd(), "lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals.tsx"), "utf8");
        const block = src.slice(src.indexOf("<AddPersonModal"), src.indexOf("<AddInquiryChildModal"));
        expect(block).toContain("submitAddPersonFromDrawer(");
        expect(block).toContain("void reloadOpportunityDisplayVm?.();");
        expect(block.indexOf("submitAddPersonFromDrawer(")).toBeLessThan(block.indexOf("void reloadOpportunityDisplayVm?.();"));
    });
});
