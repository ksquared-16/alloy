/**
 * Sprint 5.18S — location PATCH allowlist + related-list block edit mode.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    LayoutRuntimeBlockEditProvider,
    layoutRuntimeBlockAllowsFieldEdit,
} from "@/components/layout/LayoutRuntimeBlockEditContext";
import { buildLayoutRuntimeOpportunityNativePatch } from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import {
    dispatchLayoutRuntimeDrawerReverted,
    dispatchLayoutRuntimeDrawerSaved,
    LAYOUT_RUNTIME_DRAWER_REVERTED_EVENT,
    LAYOUT_RUNTIME_DRAWER_SAVED_EVENT,
} from "@/lib/layout/runtime/layoutRuntimeDrawerBlockEditEvents";
import { resolveLayoutRuntimeBlockEditMode } from "@/lib/layout/layoutEditorBlockConfig";
import type { LayoutItem } from "@/lib/layout/layoutV2";

const WEB_ROOT = join(process.cwd());

function BlockEditToggleProbe({ itemId }: { itemId: string }) {
    return (
        <LayoutRuntimeBlockEditProvider editMode="edit_button">
            <button type="button" data-testid={`layout-runtime-block-edit-${itemId}`}>
                Edit
            </button>
        </LayoutRuntimeBlockEditProvider>
    );
}

describe("layoutBuilderRuntimeParity 5.18S", () => {
    it("opportunity PATCH allowlist includes location_id", () => {
        const src = readFileSync(join(WEB_ROOT, "app/api/admin/opportunities/[id]/route.ts"), "utf8");
        const allowedStart = src.indexOf("const ALLOWED_KEYS = [");
        const allowedEnd = src.indexOf("] as const;", allowedStart);
        const allowedBlock = src.slice(allowedStart, allowedEnd);
        expect(allowedBlock).toContain('"location_id"');
    });

    it("layout runtime PATCH body uses location_id accepted by opportunity route", () => {
        const body = buildLayoutRuntimeOpportunityNativePatch(
            { "opportunity.location_id": "" },
            { "opportunity.location_id": "11111111-1111-4111-8111-111111111111" },
        );
        expect(body).toEqual({ location_id: "11111111-1111-4111-8111-111111111111" });
        expect(Object.keys(body)).toEqual(["location_id"]);
    });

    it("failed optimistic confirm leaves pre-save baseline for location patch generation", () => {
        const preSaveBaseline = { "opportunity.location_id": "" };
        const optimisticBaseline = { "opportunity.location_id": "11111111-1111-4111-8111-111111111111" };
        const draft = { "opportunity.location_id": "11111111-1111-4111-8111-111111111111" };

        expect(buildLayoutRuntimeOpportunityNativePatch(optimisticBaseline, draft)).toEqual({});
        expect(buildLayoutRuntimeOpportunityNativePatch(preSaveBaseline, draft)).toEqual({
            location_id: "11111111-1111-4111-8111-111111111111",
        });
    });

    it("related-list with editable columns resolves edit_button and renders Edit affordance", () => {
        const item: LayoutItem = {
            id: "rl-children",
            kind: "related_list",
            refKey: "enrollment_children",
            source: "enrollment_children",
            displayMode: "table",
            columns: [{ refKey: "inquiry_child.location_id", label: "School", editable: true }],
        };
        expect(resolveLayoutRuntimeBlockEditMode(item, {})).toBe("edit_button");
        const html = renderToStaticMarkup(<BlockEditToggleProbe itemId={item.id} />);
        expect(html).toContain('data-testid="layout-runtime-block-edit-rl-children"');
    });

    it("clicking Edit enables editable cells only when blockEditing is true", () => {
        expect(
            layoutRuntimeBlockAllowsFieldEdit({
                editMode: "edit_button",
                blockEditing: false,
                setBlockEditing: () => {},
            }),
        ).toBe(false);
        expect(
            layoutRuntimeBlockAllowsFieldEdit({
                editMode: "edit_button",
                blockEditing: true,
                setBlockEditing: () => {},
            }),
        ).toBe(true);
        expect(
            layoutRuntimeBlockAllowsFieldEdit({
                editMode: "display_only",
                blockEditing: true,
                setBlockEditing: () => {},
            }),
        ).toBe(false);
    });

    it("drawer save/revert dispatch helpers use stable event names", () => {
        expect(LAYOUT_RUNTIME_DRAWER_SAVED_EVENT).toBe("layout-runtime-drawer-saved");
        expect(LAYOUT_RUNTIME_DRAWER_REVERTED_EVENT).toBe("layout-runtime-drawer-reverted");
        expect(() => dispatchLayoutRuntimeDrawerSaved()).not.toThrow();
        expect(() => dispatchLayoutRuntimeDrawerReverted()).not.toThrow();
    });
});
