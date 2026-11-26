/** @vitest-environment jsdom */
/**
 * The child photo lightbox dims everything but the photo, and one Escape closes only it.
 */
import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import IdentityAvatar from "@/components/admin/focusPanel/identity/IdentityAvatar";
import { hasInnerDismissibleLayer } from "@/lib/adminV2/runtime/focusPanel/escapeLayerOwnership";
import { ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS } from "@/lib/adminV2/drawerOutsideClick";
import { ADMINV2_PHOTO_LIGHTBOX_Z, ADMINV2_SHELL_CHROME_Z } from "@/components/admin/Drawer";

let host: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
});

function mountInsideACard() {
    // A card with its own stacking context, the way `.alloy-os-ucard` is.
    host = document.createElement("div");
    host.className = "alloy-os-ucard";
    host.setAttribute("data-card", "children");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<IdentityAvatar name="Lennon Kurzman" imageUrl="https://example.test/p.jpg" role="child" />));
    return host;
}

describe("identity avatar lightbox", () => {
    it("opens at body level — outside the card — above shell chrome", () => {
        const card = mountInsideACard();
        act(() => {
            (card.querySelector("[data-identity-avatar-zoom-trigger]") as HTMLButtonElement).click();
        });
        const zoom = document.querySelector('[data-identity-avatar-zoom="true"]') as HTMLElement;
        expect(zoom).not.toBeNull();
        expect(card.contains(zoom)).toBe(false);
        expect(zoom.parentElement).toBe(document.body);
        expect(Number(zoom.style.zIndex)).toBe(ADMINV2_PHOTO_LIGHTBOX_Z);
        expect(ADMINV2_PHOTO_LIGHTBOX_Z).toBeGreaterThan(ADMINV2_SHELL_CHROME_Z);
    });

    it("one Escape closes the photo only — the depth grid yields and nothing behind it hears the key", () => {
        const card = mountInsideACard();
        act(() => {
            (card.querySelector("[data-identity-avatar-zoom-trigger]") as HTMLButtonElement).click();
        });
        expect(hasInnerDismissibleLayer(document)).toBe(true);
        const behind = vi.fn();
        window.addEventListener("keydown", behind);
        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        });
        window.removeEventListener("keydown", behind);
        expect(behind).not.toHaveBeenCalled();
        expect(document.querySelector('[data-identity-avatar-zoom="true"]')).toBeNull();
        expect(hasInnerDismissibleLayer(document)).toBe(false);
    });

    it("clicking the lightbox never counts as a click outside the record drawer", () => {
        expect(ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS).toContain('[data-identity-avatar-zoom="true"]');
    });

    it("the photo can be zoomed beside Change / Remove, and a single child's card drops the household roll-up", () => {
        const editable = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/identity/IdentityAvatarEditable.tsx"),
            "utf8",
        );
        expect(editable).not.toContain("allowZoom={!showUploadControls}");
        const card = readFileSync(path.join(process.cwd(), "components/admin/focusPanel/cards/ChildrenCard.tsx"), "utf8");
        expect(card).toContain('insight={singleChildView ? "" : evidence.answerLine}');
    });
});
