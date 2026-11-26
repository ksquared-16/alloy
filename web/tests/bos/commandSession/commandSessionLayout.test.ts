import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveBosCommandSessionLayoutDensity } from "@/lib/bos/commandSession/commandSessionLayout";

describe("resolveBosCommandSessionLayoutDensity", () => {
    it("uses compact layout when BOS is pinned", () => {
        expect(resolveBosCommandSessionLayoutDensity("pinned")).toBe("compact");
        expect(resolveBosCommandSessionLayoutDensity("floating")).toBe("expanded");
        expect(resolveBosCommandSessionLayoutDensity("closed")).toBe("expanded");
    });
});

describe("BosCommandSessionHost layout chrome", () => {
    it("exposes layout density and a single Discard affordance without header Close", () => {
        const host = readFileSync(
            resolve(
                __dirname,
                "../../../app/adminV2/components/aiCommandSurface/commandSession/BosCommandSessionHost.tsx"
            ),
            "utf8"
        );
        expect(host).toContain("data-bos-command-session-layout");
        expect(host).toContain("Discard command");
        expect(host).toContain("data-bos-command-session-discard");
        // Header Close label removed — rail Close remains for presentation.
        expect(host).not.toMatch(/>\s*Close\s*</);
    });
});
