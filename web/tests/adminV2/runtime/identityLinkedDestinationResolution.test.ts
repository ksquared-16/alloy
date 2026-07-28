/**
 * Linked Card Link destination / subject / detail resolution.
 */

import { describe, expect, it, vi } from "vitest";
import {
    navigateIdentityFieldLink,
    resolveIdentityLinkDestinationFocus,
    defaultIdentityFieldLinkTarget,
    isIdentityFieldLinkTargetComplete,
    summarizeIdentityFieldLinkTarget,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract";
import {
    createEmptyFocusPanelCardLinkNavState,
    goBackCardLink,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinkNavigation";
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

    it("summarizes a complete Linked target for collapsed config chrome", () => {
        const target = {
            toCard: "scheduling" as const,
            open: "detail" as const,
            subject: "current_schedule" as const,
        };
        expect(isIdentityFieldLinkTargetComplete(target)).toBe(true);
        expect(summarizeIdentityFieldLinkTarget(target)).toBe(
            "Displays the child’s Primary Assignment summary",
        );
    });

    it("Back restores Children focus recorded for Lennon Schedule link-out", () => {
        const requestFocus = vi.fn();
        const coordination = {
            focusTargets: new Set(["children", "scheduling"]),
            requestFocus,
            request: null,
        } as unknown as FocusPanelCoordination;

        const outbound = navigateIdentityFieldLink({
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
        expect(outbound.ok).toBe(true);

        requestFocus.mockClear();
        const back = goBackCardLink({ coordination, nav: outbound.nav });
        expect(back.ok).toBe(true);
        expect(requestFocus).toHaveBeenCalledWith(
            "children",
            "child-lennon",
            expect.objectContaining({ card: "scheduling" }),
        );
        expect(back.nav.activeCard).toBe("children");
    });
});
