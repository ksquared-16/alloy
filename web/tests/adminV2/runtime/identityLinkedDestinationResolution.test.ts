/**
 * Linked Card Link destination / subject / detail resolution.
 */

import { describe, expect, it, vi } from "vitest";
import {
    navigateIdentityFieldLink,
    resolveIdentityLinkDestinationFocus,
    defaultIdentityFieldLinkTarget,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract";
import { createEmptyFocusPanelCardLinkNavState } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinkNavigation";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";

describe("identity Linked destination / subject resolution", () => {
    it("defaults Schedule to Scheduling · Detail · current_schedule", () => {
        expect(defaultIdentityFieldLinkTarget("inquiry_child.schedule_type")).toEqual({
            toCard: "scheduling",
            open: "detail",
            subject: "current_schedule",
        });
    });

    it("resolves this_child / current_schedule focus from source item id", () => {
        expect(
            resolveIdentityLinkDestinationFocus({
                subject: "current_schedule",
                open: "detail",
                sourceItemId: "cm-lennon",
                personId: "p-lennon",
            }),
        ).toBe("cm-lennon");
        expect(
            resolveIdentityLinkDestinationFocus({
                subject: "current_schedule",
                open: "base",
                sourceItemId: "cm-lennon",
            }),
        ).toBeNull();
    });

    it("navigates Lennon Schedule to Scheduling detail with history", () => {
        const requestFocus = vi.fn();
        const coordination = {
            focusTargets: new Set(["children", "scheduling"]),
            requestFocus,
            request: null,
        } as unknown as FocusPanelCoordination;

        const result = navigateIdentityFieldLink({
            coordination,
            fromCard: "children",
            fieldRef: "child.schedule",
            sourceItemId: "cm-lennon",
            sourceFocus: "child-lennon",
            authoredTarget: {
                toCard: "scheduling",
                open: "detail",
                subject: "current_schedule",
            },
            nav: createEmptyFocusPanelCardLinkNavState(),
        });

        expect(result.ok).toBe(true);
        expect(result.nav.activeCard).toBe("scheduling");
        expect(requestFocus).toHaveBeenCalledWith("scheduling", "cm-lennon", {
            card: "children",
            focus: "child-lennon",
        });
    });

    it("navigates Wrigley with a distinct subject id (no stale Lennon focus)", () => {
        const requestFocus = vi.fn();
        const coordination = {
            focusTargets: new Set(["children", "scheduling"]),
            requestFocus,
            request: null,
        } as unknown as FocusPanelCoordination;

        navigateIdentityFieldLink({
            coordination,
            fromCard: "children",
            fieldRef: "inquiry_child.schedule_type",
            sourceItemId: "cm-wrigley",
            sourceFocus: "child-wrigley",
            nav: createEmptyFocusPanelCardLinkNavState(),
        });

        expect(requestFocus).toHaveBeenCalledWith("scheduling", "cm-wrigley", {
            card: "children",
            focus: "child-wrigley",
        });
    });

    it("fails gracefully when destination card is unavailable", () => {
        const result = navigateIdentityFieldLink({
            coordination: {
                focusTargets: new Set(["children"]),
                requestFocus: vi.fn(),
                request: null,
            } as unknown as FocusPanelCoordination,
            fromCard: "children",
            fieldRef: "child.schedule",
            sourceItemId: "cm-1",
            nav: createEmptyFocusPanelCardLinkNavState(),
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("destination_unavailable");
    });
});
