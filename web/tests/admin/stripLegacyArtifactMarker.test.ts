/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    isLegacyArtifactProcessName,
    stripLegacyArtifactMarker,
} from "@/lib/admin/buildOperatorLifecycleLanding";

describe("stripLegacyArtifactMarker — render-boundary legacy guard", () => {
    it("strips the (legacy) marker so a dirty name prints clean", () => {
        expect(stripLegacyArtifactMarker("Enrollment (legacy)")).toBe("Enrollment");
        expect(stripLegacyArtifactMarker("Enrollment (Legacy)")).toBe("Enrollment"); // case-insensitive
        expect(stripLegacyArtifactMarker("Enrollment (legacy copy)")).toBe("Enrollment");
        expect(stripLegacyArtifactMarker("Enrollment (migrated) Pipeline")).toBe("Enrollment Pipeline");
    });

    it("leaves clean names untouched; empty-after-strip → null", () => {
        expect(stripLegacyArtifactMarker("Enrollment")).toBe("Enrollment");
        expect(stripLegacyArtifactMarker("(legacy)")).toBeNull();
        expect(stripLegacyArtifactMarker("")).toBeNull();
        expect(stripLegacyArtifactMarker(null)).toBeNull();
    });

    it("agrees with the detection guard", () => {
        expect(isLegacyArtifactProcessName("Enrollment (legacy)")).toBe(true);
        expect(isLegacyArtifactProcessName("Enrollment")).toBe(false);
    });
});
