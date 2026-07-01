import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    OPERATIONAL_MODE_ENTRY_MESSAGES,
    resolveOperationalModeEntryMessage,
} from "@/lib/adminV2/runtime/operationalSubject/operationalModeEntryMessages";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("operationalModeEntryMessages", () => {
    it("uses preparation vocabulary while lane or rows are loading", () => {
        expect(
            resolveOperationalModeEntryMessage({
                queueItemsLoading: true,
                laneMayPaint: false,
                hasRows: false,
                routeRecordId: null,
                drawerOpen: false,
            }),
        ).toBe(OPERATIONAL_MODE_ENTRY_MESSAGES.preparingSurface);
    });

    it("shows resolving next work while rows exist but drawer is closed", () => {
        expect(
            resolveOperationalModeEntryMessage({
                queueItemsLoading: false,
                laneMayPaint: true,
                hasRows: true,
                routeRecordId: null,
                drawerOpen: false,
            }),
        ).toBe(OPERATIONAL_MODE_ENTRY_MESSAGES.resolvingNextWork);
    });

    it("shows opening Focus Panel while URL record is pending", () => {
        expect(
            resolveOperationalModeEntryMessage({
                queueItemsLoading: false,
                laneMayPaint: true,
                hasRows: true,
                routeRecordId: "opp-1",
                drawerOpen: false,
            }),
        ).toBe(OPERATIONAL_MODE_ENTRY_MESSAGES.openingFocusPanel);
    });
});

describe("Operational Mode entry loading guards", () => {
    it("QueueBlock gates expanded queue body while operational entry is preparing", () => {
        const queue = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(queue).toContain("operationalModePreparing");
        expect(queue).toContain("OperationalModeQueuePreparePanel");
        expect(queue).toContain('operationalEntry?.phase === "preparing"');
        expect(queue).toContain("!splitActive");
    });

    it("work unit page wires operational mode entry controller", () => {
        const page = readSrc(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
        );
        expect(page).toContain("useOperationalModeEntryController");
    });

    it("workspace providers expose operational mode entry context", () => {
        const providers = readSrc("app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx");
        expect(providers).toContain("OperationalModeEntryProvider");
    });

    it("runtime CSS holds condensed rail width during preparing and empty ready", () => {
        const css = readSrc("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toContain("data-alloy-os-operational-mode-preparing");
        expect(css).toContain("data-alloy-os-operational-mode-empty");
        expect(css).toContain("--alloy-os-queue-compressed-width");
    });

    it("expanded queue implementation remains for legacy runtime-off path", () => {
        const queue = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(queue).toContain("OperationalQueueRecordRow");
        expect(queue).toContain("ALLOY_OS_RUNTIME_ENABLED");
        expect(queue).toContain("operationalModePreparing");
    });

    it("entry controller resets preparing on lane key change", () => {
        const controller = readSrc(
            "lib/adminV2/runtime/operationalSubject/useOperationalModeEntryController.ts",
        );
        expect(controller).toContain("laneKey");
        expect(controller).toContain("resolveOperationalModeEntrySnapshot");
    });

    it("entry controller does not depend on unstable entry context identity", () => {
        const controller = readSrc(
            "lib/adminV2/runtime/operationalSubject/useOperationalModeEntryController.ts",
        );
        expect(controller).toContain("setOperationalModeEntry");
        expect(controller).not.toMatch(/\[entry,/);
        expect(controller).not.toMatch(/,\s*entry\s*,/);
        expect(controller).not.toMatch(/,\s*entry\s*\]/);
    });

    it("entry controller uses a single state writer (no competing lane-reset effect)", () => {
        const controller = readSrc(
            "lib/adminV2/runtime/operationalSubject/useOperationalModeEntryController.ts",
        );
        const setCalls = controller.match(/setOperationalModeEntry\(/g) ?? [];
        expect(setCalls.length).toBe(1);
    });

    it("URL record path waits for matching drawer before ready", () => {
        const controller = readSrc(
            "lib/adminV2/runtime/operationalSubject/useOperationalModeEntryController.ts",
        );
        expect(controller).toContain("drawerMatchesUrl");
        expect(controller).toContain("routeRecordId");
    });

    it("empty queue reveals ready without Focus Panel gate", () => {
        const controller = readSrc(
            "lib/adminV2/runtime/operationalSubject/useOperationalModeEntryController.ts",
        );
        expect(controller).toContain("rowCount === 0");
        expect(controller).toContain("ALLOY_OS_OPERATIONAL_MODE_EMPTY_ATTR");
    });
});
