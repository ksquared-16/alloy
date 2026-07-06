/** @vitest-environment jsdom */
/**
 * Experience Builder Add card dialog — Person/Child drawer regression (P0).
 */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import LayoutBuilderAddCardDialog from "@/components/adminV2/settings/LayoutBuilderAddCardDialog";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import {
    firstEnabledLayoutBuilderAddCardType,
    layoutBuilderAddCardTypeOptionsForSurface,
} from "@/lib/layout/layoutBuilderAddCardDialogModel";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { readSectionType } from "@/lib/layout/layoutEditorSectionLayout";
import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";

function renderDialog(
    root: Root,
    container: HTMLElement,
    props: Partial<ComponentProps<typeof LayoutBuilderAddCardDialog>> = {},
) {
    act(() => {
        root.render(
            <LayoutBuilderAddCardDialog
                open
                onClose={() => {}}
                onSubmit={() => {}}
                {...props}
            />,
        );
    });
}

function clickType(container: HTMLElement, type: string) {
    act(() => {
        container
            .querySelector(`[data-testid="layout-builder-add-type-${type}"]`)
            ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

function selectedTypeClass(container: HTMLElement, type: string): string {
    return container.querySelector(`[data-testid="layout-builder-add-type-${type}"]`)?.className ?? "";
}

describe("layoutBuilderAddCardDialogModel", () => {
    it("enables all card types on opportunity, person, and child drawer surfaces", () => {
        for (const surfaceKey of ["opportunity_drawer", "person_drawer", "child_drawer"] as const) {
            const options = layoutBuilderAddCardTypeOptionsForSurface(surfaceKey);
            expect(options.every((option) => option.enabled)).toBe(true);
            expect(firstEnabledLayoutBuilderAddCardType(surfaceKey)).toBe("fields");
        }
    });
});

describe("LayoutBuilderAddCardDialog card type selection", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    for (const surfaceKey of ["opportunity_drawer", "person_drawer", "child_drawer"] as DrawerLayoutEditorSurfaceKey[]) {
        it(`${surfaceKey}: selecting Related list keeps selection after click`, () => {
            renderDialog(root, container, { surfaceKey });
            clickType(container, "related_list");
            expect(selectedTypeClass(container, "related_list")).toContain("border-alloy-pine/40");
            expect(selectedTypeClass(container, "fields")).not.toContain("border-alloy-pine/40");
        });

        it(`${surfaceKey}: selecting Text block keeps selection after click`, () => {
            renderDialog(root, container, { surfaceKey });
            clickType(container, "text");
            expect(selectedTypeClass(container, "text")).toContain("border-alloy-pine/40");
        });
    }

    it("person drawer submit uses selected card type", () => {
        let submitted: import("@/components/adminV2/settings/LayoutBuilderAddCardDialog").LayoutBuilderAddCardDialogSubmit | null =
            null;
        renderDialog(root, container, {
            surfaceKey: "person_drawer",
            onSubmit: (input) => {
                submitted = input;
            },
        });
        clickType(container, "related_list");
        act(() => {
            container
                .querySelector('[data-testid="layout-builder-add-card-submit"]')
                ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(submitted).toMatchObject({ cardType: "related_list" });
    });
});

describe("createExperienceBuilderCard on person and child drawers", () => {
    it("person drawer adds related list section", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const before = doc.sections.length;
        const result = createExperienceBuilderCard(doc, {
            title: "Linked children",
            widthKey: "full",
            cardType: "related_list",
            surfaceKey: "person_drawer",
        });
        expect(result.doc.sections.length).toBe(before + 1);
        const section = result.doc.sections.find((s) => s.key === result.sectionKey);
        expect(readSectionType(section!)).toBe("related_list");
    });

    it("person drawer adds text block", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const result = createExperienceBuilderCard(doc, {
            title: "Notes",
            widthKey: "full",
            cardType: "text",
            surfaceKey: "person_drawer",
        });
        expect(result.itemId).toBeTruthy();
    });

    it("child drawer adds related list and text blocks", () => {
        const doc = buildChildDrawerDefaultDoc();
        const related = createExperienceBuilderCard(doc, {
            title: "Guardians",
            widthKey: "full",
            cardType: "related_list",
            surfaceKey: "child_drawer",
        });
        expect(readSectionType(related.doc.sections.find((s) => s.key === related.sectionKey)!)).toBe("related_list");

        const text = createExperienceBuilderCard(related.doc, {
            title: "Helper copy",
            widthKey: "full",
            cardType: "text",
            surfaceKey: "child_drawer",
        });
        expect(text.itemId).toBeTruthy();
    });

    it("opportunity drawer still creates fields card", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = createExperienceBuilderCard(doc, {
            title: "Enrollment Details",
            widthKey: "half",
            cardType: "fields",
            surfaceKey: "opportunity_drawer",
        });
        expect(readSectionType(result.doc.sections.find((s) => s.key === result.sectionKey)!)).toBe("content");
    });
});
