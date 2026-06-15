import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** ACT-1 — the Command Center shell is wired to live data (read-only + assignment, no send). */
describe("command center live wiring", () => {
    const shellSrc = readFileSync(join(process.cwd(), "app", "adminV2", "communications", "CommandCenterShell.tsx"), "utf8");
    const workspaceSrc = readFileSync(
        join(process.cwd(), "app", "adminV2", "communications", "FamilyCommunicationWorkspaceView.tsx"),
        "utf8"
    );
    const src = `${shellSrc}\n${workspaceSrc}`;
    it("fetches conversations from the dark API", () => {
        expect(src).toMatch(/\/api\/admin\/communications\/conversations/);
    });
    it("renders metrics, filters, queues, and a timeline", () => {
        expect(src).toMatch(/data-cc-metrics/);
        expect(src).toMatch(/data-cc-filters/);
        expect(src).toMatch(/visibleCommandCenterQueues/);
        expect(src).toMatch(/data-cc-timeline/);
        expect(src).toMatch(/computeCommandCenterMetrics/);
        expect(src).toMatch(/applyQueueFilters/);
        expect(src).toMatch(/groupConversationsByQueue/);
    });
    it("renders queue rows from visible sections and loads FamilyCommunicationWorkspace on selection", () => {
        expect(shellSrc).toMatch(/queueSections\.map/);
        expect(shellSrc).toMatch(/data-cc-conversation=/);
        expect(shellSrc).toMatch(/FamilyCommunicationWorkspaceView/);
        expect(shellSrc).toMatch(/selected \?/);
        expect(shellSrc).toMatch(/openConversation/);
    });
    it("auto-selects the first visible conversation on load", () => {
        expect(shellSrc).toMatch(/resolveCommandCenterSelection/);
        expect(shellSrc).toMatch(/flattenVisibleConversationIds/);
        expect(shellSrc).toMatch(/Loading first conversation/);
        expect(shellSrc).not.toMatch(/Select a family from the queue/);
    });
    it("wires claim/assign via the dark assign route", () => {
        expect(src).toMatch(/data-cc-claim/);
        expect(src).toMatch(/\/assign/);
        expect(src).toMatch(/action:\s*"claim"/);
    });
    it("does not send or embed a BOS panel", () => {
        expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutboundMessage|\/communications\/send/);
        expect(src).not.toMatch(/aiCommandSurface\/[A-Za-z]*Panel/);
    });
});
