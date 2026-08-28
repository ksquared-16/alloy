/**
 * THE AUTHORING PREVIEW IS BUILDER-ONLY.
 *
 * Representative evidence is exactly what an authoring canvas needs and exactly
 * what a real Focus Panel must never show: a fabricated household, a fabricated
 * balance, a fabricated health record, rendered as if they were a family's. The
 * boundary is therefore a test rather than a convention — the failure mode is
 * silent and the blast radius is an operator acting on invented truth.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    AUTHORING_PREVIEW_CARDS,
    hasAuthoringPreview,
} from "@/lib/adminV2/runtime/focusPanel/authoring/focusPanelAuthoringPreview";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const PREVIEW_MODULE = "lib/adminV2/runtime/focusPanel/authoring/focusPanelAuthoringPreview";
const FIXTURES_MODULE = "lib/cardLab/cardLabFixtures";

/** Every file that composes or provides a RUNTIME Focus Panel. */
const RUNTIME_OWNERS = [
    "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx",
    "components/admin/focusPanel/OpportunityFocusPanelBody.tsx",
    "components/presentation/workUnit/InlineOpportunityFocusPanel.tsx",
    "lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards.ts",
    "lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs.ts",
    "lib/adminV2/runtime/operationalContext/buildOperationalContext.ts",
];

describe("authoring preview boundary", () => {
    it("no runtime provider or composition owner imports the preview or its fixtures", () => {
        for (const rel of RUNTIME_OWNERS) {
            const src = read(rel);
            expect(src, `${rel} imports the authoring preview`).not.toContain(PREVIEW_MODULE);
            expect(src, `${rel} imports lab fixtures`).not.toContain(FIXTURES_MODULE);
        }
    });

    it("only the Surface Builder canvas passes authoringPreview", () => {
        // The renderer's authoring branch is unreachable without this prop, so the
        // set of files that pass it IS the set of surfaces that can show fixtures.
        const renderer = read("components/admin/focusPanel/FocusPanelCardRenderer.tsx");
        expect(renderer).toContain("authoringPreview");

        const runtimeHosts = [
            "components/admin/focusPanel/FocusPanelCardGrid.tsx",
            "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx",
        ];
        for (const rel of runtimeHosts) {
            expect(read(rel), `${rel} passes authoringPreview`).not.toContain("authoringPreview={");
        }

        const composer = read("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");
        expect(composer).toContain("authoringPreview={");
    });

    it("the renderer's authoring branch is gated on the prop, not on the card key", () => {
        const renderer = read("components/admin/focusPanel/FocusPanelCardRenderer.tsx");
        // A key-only gate would fire in runtime too. The prop must be part of the test.
        expect(renderer).toMatch(/if\s*\(authoringPreview\s*&&\s*hasAuthoringPreview\(model\.key\)\)/);
    });

    it("the preview allowlist is short, explicit, and excludes retired predecessors", () => {
        expect([...AUTHORING_PREVIEW_CARDS].sort()).toEqual(
            ["attendance", "business_process", "financials", "health_safety", "staff"],
        );
        for (const retired of ["current_work", "billing_preview", "child_identity", "health"]) {
            expect(hasAuthoringPreview(retired)).toBe(false);
        }
    });

    it("a card with no preview falls through to its real render", () => {
        for (const key of ["household", "children", "scheduling", "tour_summary", "communications"]) {
            expect(hasAuthoringPreview(key)).toBe(false);
        }
    });
});
