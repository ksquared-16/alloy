import { describe, expect, it } from "vitest";

import {
    drawerTabToFocusPanelMode,
    focusPanelModeToDrawerTab,
    isFocusPanelMode,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";

describe("focusPanelMode", () => {
    it("maps legacy drawer tabs to canonical modes", () => {
        expect(drawerTabToFocusPanelMode("overview")).toBe("summary");
        expect(drawerTabToFocusPanelMode("communications")).toBe("activity");
        expect(drawerTabToFocusPanelMode("documents")).toBe("activity");
        expect(drawerTabToFocusPanelMode("notes")).toBe("activity");
    });

    it("maps modes back to drawer tabs for prefetch compatibility", () => {
        expect(focusPanelModeToDrawerTab("summary")).toBe("overview");
        expect(focusPanelModeToDrawerTab("activity")).toBe("activity");
    });

    it("validates mode literals", () => {
        expect(isFocusPanelMode("summary")).toBe(true);
        expect(isFocusPanelMode("overview")).toBe(false);
    });
});
