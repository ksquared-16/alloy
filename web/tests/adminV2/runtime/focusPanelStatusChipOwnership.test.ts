import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
    buildFocusPanelContextChipsFromQueuePreviewSeed,
    buildFocusPanelContextChips,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const RESOLVER = read("lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusLabel.ts");
const IDENTITY_BLOCK = read("components/admin/focusPanel/FocusPanelSubjectIdentityBlock.tsx");
const RESOLVED_HEADER = read("components/admin/focusPanel/OpportunityFocusPanelHeader.tsx");
const CSS = read("app/adminV2/components/alloyOsRuntime.css");

/**
 * WU-07 — THE STATUS CHIP HAS ONE OWNER, AND UNKNOWN IS NOT A VALUE.
 *
 * Measured on deployed staging (9620b05b), 14/14 cold opens: the header's status chip rendered
 * "Lead" at the completed frame and the owner corrected it to "New Lead" ~2.9s later. "Lead" was
 * the queue row's PROCESS STAGE, reaching the chip because the seed reads the row's configured
 * `status` display slot and this work unit binds that slot to `queue_row.stage_label`.
 *
 * There is no repair available inside the seed: the row's own status field carries "New" for the
 * same record, a third spelling that corrects just the same. So the chip is reserved until its
 * owner answers, and these pin that it stays that way.
 */
describe("focus panel status chip ownership", () => {
    it("seeds a RESERVED status chip instead of the seed's status text", () => {
        const chips = buildFocusPanelContextChipsFromQueuePreviewSeed({
            title: "Jordan Lee",
            statusLabel: "Lead", // the stage, as the live slot binding actually delivers it
            statusKey: "new",
            stageLabel: "New Leads",
            locationLabel: "North Campus",
        });
        const status = chips.filter((c) => c.kind === "status");
        expect(status).toHaveLength(1);
        expect(status[0].reserved).toBe(true);
        expect(status[0].label).toBe("");
    });

    it("renders no placeholder value in the reserved chip — a dash or ellipsis reads as a fact", () => {
        const [status] = buildFocusPanelContextChipsFromQueuePreviewSeed({
            title: "Jordan Lee",
            statusLabel: "Lead",
        });
        expect(status.label).toBe("");
        for (const placeholder of ["—", "-", "…", "...", "Unknown", "N/A", "Pending"]) {
            expect(status.label).not.toBe(placeholder);
        }
    });

    it("keeps the status chip present whatever the seed carries, so geometry never depends on content", () => {
        const withStatus = buildFocusPanelContextChipsFromQueuePreviewSeed({
            title: "A",
            statusLabel: "Lead",
        });
        const withoutStatus = buildFocusPanelContextChipsFromQueuePreviewSeed({ title: "A" });
        expect(withStatus.filter((c) => c.kind === "status")).toHaveLength(1);
        expect(withoutStatus.filter((c) => c.kind === "status")).toHaveLength(1);
    });

    it("still seeds process and location — those fields the row does own and they never corrected", () => {
        const chips = buildFocusPanelContextChipsFromQueuePreviewSeed({
            title: "Jordan Lee",
            stageLabel: "New Leads",
            locationLabel: "North Campus",
        });
        expect(chips.find((c) => c.kind === "process")?.label).toBe("New Leads");
        expect(chips.find((c) => c.kind === "location")?.label).toBe("North Campus");
    });

    it("the resolved header reserves the status chip when its owner reports UNKNOWN", () => {
        // The reserved arm is what keeps the chip count equal across the seed → resolved swap.
        expect(RESOLVED_HEADER).toContain('kind: "status" as const, reserved: true');
        expect(RESOLVED_HEADER).toMatch(/statusWithTour \?\s*\[\]\s*:/);
    });

    it("an owner-provided status still renders as a normal, non-reserved chip", () => {
        const chips = buildFocusPanelContextChips({
            statusLabel: "New Lead",
            statusKey: "new_inquiry",
        });
        expect(chips[0]).toMatchObject({ label: "New Lead", kind: "status" });
        expect(chips[0].reserved).toBeUndefined();
    });

    it("the resolver never promotes the queue seed to the status label", () => {
        // The parameter is still accepted (one call shape for callers) but must not be returned.
        expect(RESOLVER).not.toMatch(/return\s+seed\b/);
        expect(RESOLVER).not.toMatch(/\?\?\s*seed\b/);
        expect(RESOLVER).toContain("if (!vm) return null;");
    });

    it("the renderer shows nothing for a reserved chip and does not announce it", () => {
        expect(IDENTITY_BLOCK).toContain("chip.reserved ? null : chip.label");
        expect(IDENTITY_BLOCK).toContain('data-focus-panel-chip-reserved');
        // An empty live region would be announced on every cold open.
        expect(IDENTITY_BLOCK).toContain('chip.kind === "status" && !chip.reserved ? "status" : undefined');
    });

    it("the reserved chip holds width in CSS, so the row does not resize when the value lands", () => {
        const rule = CSS.split(".alloy-os-fp-header-compact__context-chip--reserved")[1] ?? "";
        expect(rule).toMatch(/min-width:/);
        expect(rule).toMatch(/color:\s*transparent/);
    });
});
