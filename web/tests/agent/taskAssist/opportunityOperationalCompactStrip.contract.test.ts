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
        const v11ReturnIdx = src.indexOf("if (!v11) return null");
        expect(taskAnchorIdx).toBeGreaterThan(-1);
        expect(sendAnchorIdx).toBeGreaterThan(-1);
        expect(v11ReturnIdx).toBeGreaterThan(-1);
        expect(taskAnchorIdx).toBeLessThan(v11ReturnIdx);
        expect(sendAnchorIdx).toBeLessThan(v11ReturnIdx);
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

    it("operational strip handoff focuses Orchestrator with active drawer context", () => {
        const src = readFileSync(stripPath, "utf8");
        expect(src).toContain("OrchestratorHandoffCard");
        expect(src).toContain("Review assist");
        expect(src).toContain("Operational read");
        expect(src).toContain("Continue in Orchestrator");
        expect(src).toContain("data-operational-orchestrator-handoff-card");
        expect(src).toContain("data-operational-orchestrator-handoff-eyebrow");
        expect(src).toContain("data-operational-orchestrator-handoff=\"true\"");
        expect(src).toContain("data-drawer-slot=\"operational_orchestrator_handoff\"");
        expect(src).toContain("focusCommandBar");
        expect(src).toContain("buildOpportunityOperationalContext");
        expect(src).toContain("orchestratorHandoffSeedCommand");
        expect(src).toContain("setAssistantContext");
        expect(src).toContain("autoSubmitSeedCommand: true");
        expect(src).not.toContain("Ask AI");
        expect(src).not.toContain("Chat with AI");
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

describe("AdminEntityDrawer operational strip wiring", () => {
    it("renders compact strip in header and omits heavy overview operational sections", () => {
        const src = readFileSync(drawerPath, "utf8");
        expect(src).toContain("OpportunityOperationalCompactStrip");
        expect(src).toContain("data-admin-opportunity-operational-strip");
        expect(src).not.toContain("OpportunityOperationalTasksSection");
        expect(src).not.toContain("OperationalAttentionDrawerSection");
        expect(src).not.toContain("Operational tasks & follow-ups");
        expect(src).not.toContain('data-drawer-section="operational_attention_detail"');
    });
});
