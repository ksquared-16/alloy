import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldDeferOpportunityDrawerOpen } from "@/lib/admin/opportunityDrawerOpenCoordinator";

const webRoot = process.cwd();
const readSrc = (rel: string): string => readFileSync(join(webRoot, rel), "utf8");

const ROW = "app/adminV2/components/workspace/blocks/CompressedQueueRow.tsx";
const QUEUE_BLOCK = "app/adminV2/components/workspace/blocks/QueueBlock.tsx";
const PAGE = "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx";
const RESOLVER = "lib/adminV2/runtime/operationalSubject/useWorkUnitDefaultOperationalSubjectAutoOpen.ts";

describe("WU-05 queue row — full-row click affordance", () => {
    const src = readSrc(ROW);

    it("renders the whole row as a single button wired to onOpen", () => {
        expect(src).toContain("<button");
        expect(src).toContain("onClick={onOpen}");
        // The row comment documents the whole-row-is-one-button contract.
        expect(src).toMatch(/Whole row is one button|whole row/i);
    });

    it("does not stop propagation or attach nested click handlers inside the row", () => {
        expect(src).not.toContain("stopPropagation");
        // Only the row-level onClick exists; inner lines are plain spans.
        expect(src.match(/onClick=/g) ?? []).toHaveLength(1);
    });
});

describe("WU-05 immediate selection (does not wait for VM payload)", () => {
    const queue = readSrc(QUEUE_BLOCK);

    it("drives the active-row highlight from the pending clicked id, not only drawer.id", () => {
        // The pending clicked row owns the active highlight immediately during a model-swap VM wait.
        expect(queue).toContain("data-queue-row-active");
        expect(queue).toMatch(/rowOpenPending \|\|/);
        expect(queue).toContain("queueRowOpenPendingOpportunityId");
    });

    it("Focus Panel shell is not deferred on work-unit surfaces (switches immediately)", () => {
        expect(shouldDeferOpportunityDrawerOpen("/adminV2/workspace/dept/d1/work-unit/enrollment", "opp-1")).toBe(
            false,
        );
        // Empty / new ids are never deferred regardless of surface.
        expect(shouldDeferOpportunityDrawerOpen("/adminV2/workspace/dept/d1/work-unit/enrollment", "")).toBe(false);
        expect(shouldDeferOpportunityDrawerOpen("/adminV2/workspace/dept/d1/work-unit/enrollment", "new")).toBe(
            false,
        );
    });
});

describe("WU-05 overlay / preparing panel does not intercept clicks after reveal", () => {
    const queue = readSrc(QUEUE_BLOCK);

    it("operational preparing panel only replaces rows before the first subject opens", () => {
        // Gated by !splitActive && !openDrawerOpportunityId — once a subject is open, rows stay clickable.
        expect(queue).toMatch(/operationalModePreparing\s*=([\s\S]*?)!splitActive([\s\S]*?)!openDrawerOpportunityId/);
    });
});

describe("WU-05 manual selection wins over default resolver / rapid clicks settle latest", () => {
    const resolver = readSrc(RESOLVER);
    const page = readSrc(PAGE);

    it("default resolver early-returns when a manual selection is active", () => {
        expect(resolver).toContain("manualSelectionRef.current");
        expect(resolver).toContain("markManualOperationalSubjectSelection");
    });

    it("each manual click sets the pending selection id so the latest click wins", () => {
        expect(page).toContain("setQueueRowOpenPendingOpportunityId(id)");
        expect(page).toContain("markManualOperationalSubjectSelection()");
        expect(page).toContain('cancelBackgroundDrawerVmPrewarm("manual_selection")');
    });
});

describe("WU-05 perf:intent click lifecycle logs", () => {
    const queue = readSrc(QUEUE_BLOCK);
    const page = readSrc(PAGE);
    const resolver = readSrc(RESOLVER);

    it("emits click_down on row mouse-down with section id", () => {
        expect(queue).toContain('perfIntent("click_down", { section_id: "WU-05"');
    });

    it("emits row_selected and open_requested with section id", () => {
        expect(page).toContain('perfIntent("row_selected"');
        expect(page).toContain('perfIntent("open_requested"');
        expect(page.match(/section_id: "WU-05"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    });

    it("emits a blocked log with reason when the click has no item id", () => {
        expect(page).toContain('perfIntent("blocked", { section_id: "WU-05", reason: "empty_item_id" })');
    });

    it("emits stale_ignored when the default resolver is superseded by a manual selection", () => {
        expect(resolver).toContain('perfIntent("stale_ignored"');
        expect(resolver).toContain('reason: "default_resolver_blocked_manual_selection"');
    });
});
