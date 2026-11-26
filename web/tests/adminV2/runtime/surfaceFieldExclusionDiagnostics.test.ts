import { describe, expect, it } from "vitest";

import { diagnoseSurfaceFieldExclusion } from "@/lib/adminV2/settings/surfaces/surfaceFieldExclusionDiagnostics";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

ensureRuntimeSurfacesRegistered();

describe("surfaceFieldExclusionDiagnostics", () => {
    it("flags family aggregates on child-only namespaces", () => {
        const hit = diagnoseSurfaceFieldExclusion({
            fieldKey: "children.names",
            namespaces: ["child"],
            consumer: "focus_panel",
        });
        expect(hit?.reason).toBe("wrong_subject_grain");
    });

    it("flags non-compact queue fields", () => {
        const hit = diagnoseSurfaceFieldExclusion({
            fieldKey: "child.date_of_birth",
            namespaces: ["child"],
            consumer: "queue_row",
        });
        expect(hit?.reason).toBe("not_compact_effective");
    });

    it("returns null for selectable child DOB on focus panel", () => {
        const hit = diagnoseSurfaceFieldExclusion({
            fieldKey: "child.date_of_birth",
            namespaces: ["child"],
            consumer: "focus_panel",
        });
        expect(hit).toBeNull();
    });
});
