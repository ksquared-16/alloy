import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    commandSurfaceEntitySearchQuery,
    routeCommandSurface,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import { extractCommandSurfaceSlots } from "@/lib/adminV2/aiCommandSurface/commandSurfaceSlotExtract";
import { formatTaskAssistEntitySearchNoMatchMessage } from "@/lib/agent/taskAssist/taskAssistEntitySearchVariants";

const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);
const topNavPath = join(dirname(fileURLToPath(import.meta.url)), "../../app/adminV2/components/TopNavBar.tsx");

describe("Interaction Layer V1 command surface contract (Card 7)", () => {
    it("shell has no visible mode tabs, Find target, or Preview primary affordance", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).not.toContain("data-adminv2-command-surface-mode-tabs");
        expect(src).not.toContain("Find target");
        expect(src).not.toMatch(/>\s*Preview\s*</);
        expect(src).not.toContain("Enter to send · confirm targets and approve actions before anything sends");
        expect(src).not.toContain("Ask anything — text a family");
        expect(src).toContain('placeholder="Ask me anything"');
        expect(src).toContain("data-command-surface-submit");
        expect(src).toContain('busy ? "Working…" : "Ask"');
        expect(src).toContain("data-command-surface-thread-panel");
        expect(src).toContain("data-command-surface-thread-toggle");
        expect(src).toContain('case "workflow_assist"');
    });

    it("header Assistant link is removed", () => {
        const src = readFileSync(topNavPath, "utf8");
        expect(src).not.toContain("data-global-assistant-header-trigger");
    });

    it("Mitchell-family phrase extracts entity and goal separately (not full sentence)", () => {
        const cmd = "text the Mitchell family that we're excited for her youngest child to start";
        const slots = extractCommandSurfaceSlots(cmd);
        expect(slots.entity_search_text?.toLowerCase()).toMatch(/mitchell/);
        expect(slots.message_goal_text?.toLowerCase()).toContain("excited");
        expect(slots.message_goal_text?.toLowerCase()).not.toContain("mitchell");

        const r = routeCommandSurface(cmd);
        const q = commandSurfaceEntitySearchQuery(r.slots.raw, r.slots, r.taskAssistIntent);
        expect(q.toLowerCase()).toMatch(/mitchell/);
        expect(q.length).toBeLessThan(48);
        expect(q.toLowerCase()).not.toContain("excited");
    });

    it("workflow phrase routes to workflow_assist", () => {
        const r = routeCommandSurface("when forms complete move them to ready to enroll");
        expect(r.route).toBe("workflow_assist");
        expect(r.workflowAssistReadIntent?.sub_intent).toBe("workflow_summary");
    });

    it("job layout command routes to job_layout", () => {
        const r = routeCommandSurface("make the job overview more customer focused");
        expect(r.route).toBe("job_layout");
    });

    it("Task Assist comms command routes to task_assist", () => {
        const r = routeCommandSurface("email Smith family tomorrow about tour next steps");
        expect(r.route).toBe("task_assist");
        expect(r.taskAssistIntent?.intent_type).toBe("schedule_message");
    });

    it("no-match copy includes searched token", () => {
        expect(formatTaskAssistEntitySearchNoMatchMessage("Mitchell")).toContain("'Mitchell'");
    });
});
