import { describe, expect, it } from "vitest";

import { resolveWorkUnitSurfaceRenderMode } from "@/components/presentation/workUnit/WorkUnitSurface";

/**
 * Surface Hold: a Work Unit re-establish (host change → config re-settle → `ready` briefly
 * false) must keep the prior surface visible, not drop to a full skeleton. The establish
 * skeleton is reserved for the FIRST arrival, when there is nothing to hold.
 */
describe("resolveWorkUnitSurfaceRenderMode — surface hold", () => {
    it("first arrival (not ready, nothing established) → cold skeleton", () => {
        expect(resolveWorkUnitSurfaceRenderMode({ ready: false, hasPriorEstablished: false })).toBe(
            "cold",
        );
    });

    it("re-establish (not ready, but a prior surface existed) → hold prior, no skeleton", () => {
        expect(resolveWorkUnitSurfaceRenderMode({ ready: false, hasPriorEstablished: true })).toBe(
            "held",
        );
    });

    it("ready → live (destination is primary)", () => {
        expect(resolveWorkUnitSurfaceRenderMode({ ready: true, hasPriorEstablished: false })).toBe(
            "live",
        );
        expect(resolveWorkUnitSurfaceRenderMode({ ready: true, hasPriorEstablished: true })).toBe(
            "live",
        );
    });
});
