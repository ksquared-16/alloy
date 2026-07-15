import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(webRoot, rel), "utf8");

/**
 * /workspace boot must not fetch AI capabilities — the operator hasn't engaged the command surface.
 * The two capability probes (workflow-assist + config-layout-assist) are destination-triggered:
 * gated behind `hasEngagedCommandSurface`, which flips on first engagement (typing / thread expand /
 * focus-command-bar event), not on mount.
 */
describe("AI capability probes are destination-triggered (not /workspace boot work)", () => {
    const shell = read("app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx");

    it("declares an engagement gate armed by real command-surface interaction", () => {
        expect(shell).toContain("const [hasEngagedCommandSurface, setHasEngagedCommandSurface]");
        // Armed on typing / thread expand …
        expect(shell).toMatch(/commandText\.trim\(\)\.length > 0 \|\| threadExpanded\)\s*setHasEngagedCommandSurface\(true\)/);
        // … and on the focus-command-bar event.
        expect(shell).toMatch(/setHasEngagedCommandSurface\(true\);\s*\/\/ arm the capability probes/);
    });

    it("both capability fetches early-return until engaged (no mount-time fetch)", () => {
        // Each capability effect guards on the engagement flag before touching the sidecar.
        const guards = shell.match(/if \(!hasEngagedCommandSurface\) return;/g) ?? [];
        expect(guards.length).toBeGreaterThanOrEqual(2);
        // The capability sidecars are only referenced after the guard exists (destination-triggered).
        expect(shell).toContain('fetchAdminV2Sidecar("workflow_assist_capabilities")');
        expect(shell).toContain('fetchAdminV2Sidecar("config_layout_assist_capabilities")');
        // Effects re-run on engagement, not just on mount.
        expect(shell).toMatch(/config_layout_assist_capabilities[\s\S]*?\}, \[hasEngagedCommandSurface\]\)/);
    });
});
