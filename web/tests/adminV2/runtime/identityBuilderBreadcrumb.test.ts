import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
    buildIdentityBuilderBreadcrumb,
    identityBuilderPushPurpose,
    initialIdentityBuilderNavigation,
    navigateIdentityBuilderBreadcrumb,
    identityBuilderPopFrame,
} from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import { CHILDREN_SURFACE_ID, HOUSEHOLD_SURFACE_ID, nestedSurfaceLabel } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

describe("Identity Builder breadcrumb", () => {
    it("renders Summary / Primary Contact path correctly", () => {
        let state = initialIdentityBuilderNavigation(HOUSEHOLD_SURFACE_ID, nestedSurfaceLabel(HOUSEHOLD_SURFACE_ID));
        state = identityBuilderPushPurpose(state, {
            kind: "purpose",
            surfaceId: HOUSEHOLD_SURFACE_ID,
            groupKey: "primary_contact",
            purpose: "summary",
            groupLabel: "Primary Contact",
        });
        const segments = buildIdentityBuilderBreadcrumb(state);
        expect(segments.map((s) => s.label)).toEqual([
            "Household",
            "Summary Fields",
            "Primary Contact",
        ]);
        expect(segments[2]!.frameIndex).toBeNull();
        expect(segments[0]!.frameIndex).not.toBeNull();
        expect(segments[1]!.frameIndex).not.toBeNull();
    });

    it("renders Context Facts / Other Parent path correctly", () => {
        let state = initialIdentityBuilderNavigation(HOUSEHOLD_SURFACE_ID, "Household");
        state = identityBuilderPushPurpose(state, {
            kind: "purpose",
            surfaceId: HOUSEHOLD_SURFACE_ID,
            groupKey: "other_parent_guardian",
            purpose: "context_facts",
            groupLabel: "Other Parent / Guardian",
        });
        expect(buildIdentityBuilderBreadcrumb(state).map((s) => s.label)).toEqual([
            "Household",
            "Context Facts",
            "Other Parent / Guardian",
        ]);
    });

    it("renders Details / Primary Contact path correctly", () => {
        let state = initialIdentityBuilderNavigation(HOUSEHOLD_SURFACE_ID, "Household");
        state = identityBuilderPushPurpose(state, {
            kind: "purpose",
            surfaceId: HOUSEHOLD_SURFACE_ID,
            groupKey: "primary_contact",
            purpose: "details",
            groupLabel: "Primary Contact",
        });
        expect(buildIdentityBuilderBreadcrumb(state).map((s) => s.label)).toEqual([
            "Household",
            "Detail Fields",
            "Primary Contact",
        ]);
    });

    it("renders Evidence / Child path correctly", () => {
        let state = initialIdentityBuilderNavigation(CHILDREN_SURFACE_ID, nestedSurfaceLabel(CHILDREN_SURFACE_ID));
        state = identityBuilderPushPurpose(state, {
            kind: "purpose",
            surfaceId: CHILDREN_SURFACE_ID,
            groupKey: "identity",
            purpose: "evidence",
            groupLabel: "Child",
        });
        expect(buildIdentityBuilderBreadcrumb(state).map((s) => s.label)).toEqual([
            nestedSurfaceLabel(CHILDREN_SURFACE_ID),
            "Evidence Collections",
            "Child",
        ]);
    });

    it("clicking a breadcrumb segment navigates to the correct frame", () => {
        let state = initialIdentityBuilderNavigation(HOUSEHOLD_SURFACE_ID, "Household");
        state = identityBuilderPushPurpose(state, {
            kind: "purpose",
            surfaceId: HOUSEHOLD_SURFACE_ID,
            groupKey: "primary_contact",
            purpose: "details",
            groupLabel: "Primary Contact",
        });
        const segments = buildIdentityBuilderBreadcrumb(state);
        const surfaceNav = navigateIdentityBuilderBreadcrumb(state, segments[0]!.frameIndex!);
        expect(surfaceNav.stack).toHaveLength(1);
        expect(surfaceNav.stack[0]!.kind).toBe("surface");

        const purposeNav = navigateIdentityBuilderBreadcrumb(state, segments[1]!.frameIndex!);
        expect(purposeNav.stack).toHaveLength(2);
        expect(purposeNav.stack[1]).toMatchObject({ kind: "purpose", purpose: "details" });
    });

    it("Back and breadcrumb navigation remain consistent", () => {
        let state = initialIdentityBuilderNavigation(HOUSEHOLD_SURFACE_ID, "Household");
        state = identityBuilderPushPurpose(state, {
            kind: "purpose",
            surfaceId: HOUSEHOLD_SURFACE_ID,
            groupKey: "primary_contact",
            purpose: "details",
            groupLabel: "Primary Contact",
        });
        const afterBack = identityBuilderPopFrame(state);
        const afterBreadcrumb = navigateIdentityBuilderBreadcrumb(state, 0);
        expect(afterBack.stack).toHaveLength(1);
        expect(afterBreadcrumb.stack).toHaveLength(1);
        expect(afterBack.stack[0]!.kind).toBe("surface");
        expect(afterBreadcrumb.stack[0]!.kind).toBe("surface");
    });

    it("does not expose raw group keys when labels are provided", () => {
        let state = initialIdentityBuilderNavigation(HOUSEHOLD_SURFACE_ID, "Household");
        state = identityBuilderPushPurpose(state, {
            kind: "purpose",
            surfaceId: HOUSEHOLD_SURFACE_ID,
            groupKey: "other_parent_guardian",
            purpose: "summary",
            groupLabel: "Other Parent / Guardian",
        });
        const labels = buildIdentityBuilderBreadcrumb(state).map((s) => s.label);
        expect(labels.join(" ")).not.toContain("other_parent_guardian");
        expect(labels).toContain("Other Parent / Guardian");
    });

    it("Household and Children use the same breadcrumb component", () => {
        const editor = readFileSync(
            fileURLToPath(new URL("../../../components/adminV2/settings/surfaces/NestedSurfaceEditor.tsx", import.meta.url)),
            "utf8",
        );
        const breadcrumb = readFileSync(
            fileURLToPath(
                new URL("../../../components/adminV2/settings/surfaces/composer/IdentityBuilderBreadcrumb.tsx", import.meta.url),
            ),
            "utf8",
        );
        expect(editor).toContain("IdentityBuilderBreadcrumb");
        expect(editor).toContain("HOUSEHOLD_SURFACE_ID");
        expect(editor).toContain("CHILDREN_SURFACE_ID");
        expect(breadcrumb).toContain("data-identity-builder-breadcrumb");
    });
});
