import { describe, expect, it, beforeEach } from "vitest";

import { resolveIdentityFieldPolicy } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import {
    defaultNestedSurfaceConfig,
    setFieldVisibilityInNestedGroup,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

describe("tier-specific identity field policy", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("keeps Phone read-only in Summary and editable in Context", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.phone", "read-only", {
            tier: "summary",
        });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.phone", "editable", {
            tier: "context_fact",
        });

        expect(
            resolveIdentityFieldPolicy({
                config,
                groupKey: "contact_edit",
                fieldRef: "person.phone",
                tier: "summary",
            }),
        ).toBe("read-only");
        expect(
            resolveIdentityFieldPolicy({
                config,
                groupKey: "contact_edit",
                fieldRef: "person.phone",
                tier: "context_facts",
            }),
        ).toBe("editable");
    });

    it("allows Email hidden in Summary while editable in Details", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.email", "hidden", {
            tier: "summary",
        });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.email", "editable", {
            tier: "details",
        });

        expect(
            resolveIdentityFieldPolicy({
                config,
                groupKey: "contact_edit",
                fieldRef: "person.email",
                tier: "summary",
            }),
        ).toBe("hidden");
        expect(
            resolveIdentityFieldPolicy({
                config,
                groupKey: "contact_edit",
                fieldRef: "person.email",
                tier: "details",
            }),
        ).toBe("editable");
    });
});
