/**
 * Phase 7 Slice 2 — Packet Studio convergence guard.
 *
 * Decision (option C, one creator): the Studio "Packets" tab is the definition MANAGER
 * (ProcessingPacketsStudio — list / open / edit / archive existing definitions via
 * ProcessingPacketBuilder), and its single CREATE path is the requirement-responsibility composer
 * (PosPacketsPanel in composerOnly mode). There is exactly one packet creator; the older blank
 * "Untitled packet" definition-create is retired. This guards those invariants against regression.
 */
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

const dir = path.join(process.cwd(), "app/adminV2/pos");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");

describe("Packet Studio convergence", () => {
    it("mounts the definition manager (ProcessingPacketsStudio) as the Packets tab", () => {
        const studio = read("ProcessingFormsStudio.tsx");
        expect(studio).toMatch(/ProcessingPacketsStudio/);
        expect(studio).toMatch(/studioTab === "packets"[\s\S]*ProcessingPacketsStudio/);
    });

    it("preserves definition management (open/edit existing) via ProcessingPacketBuilder", () => {
        const mgr = read("ProcessingPacketsStudio.tsx");
        expect(mgr).toMatch(/ProcessingPacketBuilder/);
        // Still lists all definitions (manager), and opens one into the builder.
        expect(mgr).toMatch(/packet-definitions/);
        expect(mgr).toMatch(/setSelectedPacketDefId/);
    });

    it("routes the single create path to the responsibility composer, not a blank definition", () => {
        const mgr = read("ProcessingPacketsStudio.tsx");
        // Create opens the composer…
        expect(mgr).toMatch(/PosPacketsPanel/);
        expect(mgr).toMatch(/composerOnly/);
        expect(mgr).toMatch(/setComposing\(true\)/);
        // …and the old blank-definition create (POST "Untitled packet") is retired.
        expect(mgr).not.toMatch(/Untitled packet/);
    });

    it("the composer supports a composer-only (create) mode", () => {
        const composer = read("PosPacketsPanel.tsx");
        expect(composer).toMatch(/composerOnly/);
        expect(composer).toMatch(/onCreated/);
    });
});
