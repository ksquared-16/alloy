import { describe, expect, it } from "vitest";

import {
    effectiveChildrenNestedConfig,
    readChildrenNestedConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { CHILDREN_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

/**
 * WHO OWNS THE CHILD DETAIL SURFACE — the platform, or the tenant?
 *
 * The platform owns a usable default; the tenant owns overrides. These tests pin that, because the
 * absence of the rule cost a full certification cycle.
 *
 * The Children card is VISIBLE in the code-owned default composition, so every org gets it. But the
 * default summary doc carries no `metadata.nestedSurfaces`, nothing in the seed or any migration
 * authors one, and the published-config resolver returns null when nothing is authored. The card
 * gated its focused-child body on that config, so on every tenant that had never opened the Surface
 * Builder — which is every newly seeded org — clicking a child selected it and then re-rendered the
 * roster. The interaction was impossible, silently.
 *
 * Default composition without default drill-in is not a coherent baseline.
 */

const docWithChildrenSurface = (): LayoutDoc =>
    ({
        ...FOCUS_PANEL_SUMMARY_DEFAULT_DOC,
        metadata: {
            ...(FOCUS_PANEL_SUMMARY_DEFAULT_DOC.metadata as Record<string, unknown>),
            nestedSurfaces: {
                [CHILDREN_SURFACE_ID]: {
                    surfaceId: CHILDREN_SURFACE_ID,
                    groups: [{ key: "identity", selectedFieldKeys: ["first_name"] }],
                },
            },
        },
    }) as LayoutDoc;

describe("the Children card is operable on a tenant that has authored nothing", () => {
    it("the default composition SHOWS the Children card", () => {
        // This is what makes the rest load-bearing: the platform ships this card to everyone.
        const children = FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.find((c) => c.key === "children");
        expect(children, "the Children card is not in the default composition").toBeTruthy();
        expect(children!.visibility).toBe("visible");
    });

    it("the default summary doc publishes NO children surface — the gap this closes", () => {
        expect(readChildrenNestedConfigFromDoc(FOCUS_PANEL_SUMMARY_DEFAULT_DOC)).toBeNull();
    });

    it("the EFFECTIVE config is the platform default when nothing is published", () => {
        const effective = effectiveChildrenNestedConfig(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        expect(effective).toBeTruthy();
        expect(effective.groups.length, "the default children surface has no groups").toBeGreaterThan(0);
    });

    it("the EFFECTIVE config is the platform default when there is no doc at all", () => {
        const effective = effectiveChildrenNestedConfig(null);
        expect(effective).toBeTruthy();
        expect(effective.groups.length).toBeGreaterThan(0);
    });

    it("TENANT CONFIGURATION WINS over the default", () => {
        const doc = docWithChildrenSurface();
        const effective = effectiveChildrenNestedConfig(doc);
        const identity = effective.groups.find((g) => g.key === "identity");

        expect(identity, "the published identity group did not survive").toBeTruthy();
        expect(identity!.selectedFieldKeys).toEqual(["first_name"]);
    });

    it("the published/absent distinction is PRESERVED for authoring surfaces", () => {
        // The Surface Builder must still be able to tell "nothing published" from "defaults applied",
        // or it would show an operator a configuration they never made as if they had.
        expect(readChildrenNestedConfigFromDoc(null)).toBeNull();
        expect(readChildrenNestedConfigFromDoc(FOCUS_PANEL_SUMMARY_DEFAULT_DOC)).toBeNull();
        expect(readChildrenNestedConfigFromDoc(docWithChildrenSurface())).toBeTruthy();
    });

    it("the card runtime reads the EFFECTIVE config, not the published one", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const src = readFileSync(join(process.cwd(), "components/admin/focusPanel/cards/ChildrenCard.tsx"), "utf8");
        const memo = src.slice(src.indexOf("const childrenSurfaceConfig"), src.indexOf("const childFocusView"));
        expect(memo).toContain("effectiveChildrenNestedConfig");
        // …but the composer's own config, including its null, stays authoritative while composing.
        expect(memo).toContain("composingChildrenSurface");
    });
});
