import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stripPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/opportunity/OpportunityOperationalCompactStrip.tsx"
);
const drawerPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/AdminEntityDrawer.tsx"
);

describe("OpportunityOperationalCompactStrip", () => {
    it("loads tasks and scheduled sends and listens for drawer refresh/focus events", () => {
        const src = readFileSync(stripPath, "utf8");
        expect(src).toContain("fetchOperationalTasks");
        expect(src).toContain("fetchCommunicationScheduledSends");
        expect(src).toContain("data-admin-opportunity-operational-strip");
        expect(src).toContain("data-operational-task-chip");
        expect(src).toContain("OperationalTaskDetailPopover");
        expect(src).toContain("scheduledSendUrgencyBadge");
        expect(src).toContain("operationalTaskUrgencyBadge");
        expect(src).toContain("scheduledSendStripVisible");
        expect(src).toContain("ScheduledSendDetailPopover");
        expect(src).toContain("popoverSendId");
        expect(src).not.toContain("pendingSends.map");
        expect(src).toContain("ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH");
        expect(src).toContain("ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS");
    });

    it("keeps popover anchor hooks before conditional returns (Rules of Hooks)", () => {
        const src = readFileSync(stripPath, "utf8");
        const taskAnchorIdx = src.indexOf("const taskPopoverAnchorRef = useRef");
        const sendAnchorIdx = src.indexOf("sendPopoverAnchorEl");
        const earlyReturnIdx = src.indexOf("if (!workEnabled && !taskAssistEnabled) return null");
        expect(taskAnchorIdx).toBeGreaterThan(-1);
        expect(sendAnchorIdx).toBeGreaterThan(-1);
        expect(earlyReturnIdx).toBeGreaterThan(-1);
        expect(taskAnchorIdx).toBeLessThan(earlyReturnIdx);
        expect(sendAnchorIdx).toBeLessThan(earlyReturnIdx);
    });

    it("scheduled-send chips open ScheduledSendDetailPopover with actionable wiring", () => {
        const src = readFileSync(stripPath, "utf8");
        expect(src).toContain('data-operational-scheduled-send-chip');
        expect(src).toContain('type="button"');
        expect(src).toMatch(/stripSends\.map\([\s\S]*?<button[\s\S]*?data-operational-scheduled-send-chip/);
        expect(src).toContain("e.stopPropagation()");
        expect(src).toContain("setSendPopoverAnchorEl");
        expect(src).toContain("anchorEl={sendPopoverAnchorEl}");
        expect(src).toContain("pointer-events-none");
        expect(src).toContain("data-scheduled-send-attention-banner");
        const sendChipBlock = src.match(/stripSends\.map\([\s\S]*?\}\)\}/);
        expect(sendChipBlock?.[0] ?? "", "scheduled-send chips stay actionable").not.toContain("disabled={");
    });

    it("task chips still use OperationalTaskDetailPopover", () => {
        const src = readFileSync(stripPath, "utf8");
        expect(src).toContain("popoverTaskId");
        expect(src).toContain("OperationalTaskDetailPopover");
        expect(src).toContain("setPopoverTaskId");
    });

});

describe("ScheduledSendDetailPopover", () => {
    const popoverPath = join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../components/admin/opportunity/ScheduledSendDetailPopover.tsx"
    );

    it("portals above drawer and defers outside mousedown", () => {
        const src = readFileSync(popoverPath, "utf8");
        expect(src).toContain("createPortal");
        expect(src).toContain("ADMINV2_DRAWER_PANEL_Z");
        expect(src).toContain("setTimeout");
        expect(src).toContain("anchorEl");
        expect(src).toContain("Edit & reschedule");
        expect(src).toContain("Process now");
        expect(src).toContain("Cancel send");
        expect(src).not.toContain("Send now");
    });
});
