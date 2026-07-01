import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    ALLOY_SECTION_LIST,
    ALLOY_SECTION_MAP,
    alloySectionDomAttrs,
    getAlloySection,
    type AlloySectionCache,
} from "@/lib/perf/alloySectionMap";
import { perfSection } from "@/lib/perf/perfNamespaceLog";

const webRoot = process.cwd();
const repoRoot = join(webRoot, "..");
const readSrc = (rel: string): string => readFileSync(join(webRoot, rel), "utf8");
const readDoc = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

const WU_IDS = Array.from({ length: 16 }, (_, i) => `WU-${String(i).padStart(2, "0")}`);
const WS_IDS = Array.from({ length: 11 }, (_, i) => `WS-${String(i).padStart(2, "0")}`);
const ALL_IDS = [...WU_IDS, ...WS_IDS];
const SNAPSHOT_IDS = ["WU-02", "WS-03", "WS-04", "WS-06"];
const OVERLAY_IDS = ["WU-15", "WS-10"];
const VALID_CACHE: AlloySectionCache[] = ["bootstrap", "session", "network", "snapshot", "none"];

const DOC_PATH = "docs/platform/operator/runtime-surface-section-map.md";

describe("Alloy section map — registry integrity", () => {
    it("registers every WU-00..WU-15 and WS-00..WS-10 section exactly once", () => {
        for (const id of ALL_IDS) {
            expect(ALLOY_SECTION_MAP[id], `missing section ${id}`).toBeDefined();
        }
        expect(ALLOY_SECTION_LIST).toHaveLength(ALL_IDS.length);
        const ids = ALLOY_SECTION_LIST.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("each entry has a valid surface, cache enum, owner path, and name", () => {
        for (const entry of ALLOY_SECTION_LIST) {
            expect(entry.surface).toBe(entry.id.startsWith("WU-") ? "work_unit" : "workspace");
            expect(VALID_CACHE).toContain(entry.cache);
            expect(entry.owner).toMatch(/^web\/.+\.tsx?$/);
            expect(entry.name.length).toBeGreaterThan(0);
            expect(entry.dataSource.length).toBeGreaterThan(0);
        }
    });

    it("getAlloySection resolves known ids and returns null for unknown", () => {
        expect(getAlloySection("WU-05")?.name).toBe("Condensed Queue Rows");
        expect(getAlloySection("ZZ-99")).toBeNull();
    });
});

describe("Alloy section map — readiness / blocking contract", () => {
    it("marks KPI snapshot sections non-blocking with snapshot cache", () => {
        for (const id of SNAPSHOT_IDS) {
            const entry = ALLOY_SECTION_MAP[id];
            expect(entry.snapshot, `${id} must be a snapshot section`).toBe(true);
            expect(entry.blocking, `${id} must not block after snapshot`).toBe(false);
            expect(entry.cache).toBe("snapshot");
        }
    });

    it("represents Focus Panel active-mode blocking behavior", () => {
        // Summary blocks only while active; inactive Work/Activity do not block.
        expect(ALLOY_SECTION_MAP["WU-09"].blocking).toBe(true);
        expect(ALLOY_SECTION_MAP["WU-09"].blockingNote).toMatch(/active/i);
        expect(ALLOY_SECTION_MAP["WU-10"].blocking).toBe(false);
        expect(ALLOY_SECTION_MAP["WU-11"].blocking).toBe(false);
    });

    it("blocks the core surface gates and leaves rails/overlays non-blocking", () => {
        for (const id of ["WU-00", "WU-01", "WU-03", "WU-04", "WU-07", "WU-08", "WS-00", "WS-02", "WS-05"]) {
            expect(ALLOY_SECTION_MAP[id].blocking, `${id} should block`).toBe(true);
        }
        // Queue body: WU-05 OR WU-06 resolves the blocking region — both are blocking-capable.
        expect(ALLOY_SECTION_MAP["WU-05"].blocking).toBe(true);
        expect(ALLOY_SECTION_MAP["WU-06"].blocking).toBe(true);
        for (const id of ["WU-12", "WU-13", "WU-14", "WS-07", "WS-08", "WS-09"]) {
            expect(ALLOY_SECTION_MAP[id].blocking, `${id} should not block core reveal`).toBe(false);
        }
    });

    it("operational workspace overlay blocks only when explicitly opened", () => {
        for (const id of OVERLAY_IDS) {
            const entry = ALLOY_SECTION_MAP[id];
            expect(entry.blocking).toBe(false);
            expect(entry.blockingNote).toMatch(/when_open/i);
            expect(entry.name).toMatch(/Operational Workspace Overlay/i);
        }
    });
});

describe("Alloy section map — DOM attributes", () => {
    it("builds the five data-alloy-section-* attributes for a known id", () => {
        const attrs = alloySectionDomAttrs("WU-02");
        expect(attrs).toEqual({
            "data-alloy-section-id": "WU-02",
            "data-alloy-section-name": "Work Unit KPI Strip",
            "data-alloy-section-owner": ALLOY_SECTION_MAP["WU-02"].owner,
            "data-alloy-section-blocking": "false",
            "data-alloy-section-cache": "snapshot",
        });
    });

    it("returns an empty object for an unknown id (never throws)", () => {
        expect(alloySectionDomAttrs("nope")).toEqual({});
    });
});

describe("perfSection logger", () => {
    afterEach(() => vi.restoreAllMocks());

    it("emits a [perf:section] line with section id + status", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        perfSection("WU-02", "ready", { source: "bootstrap", blocking: false, since_nav_ms: 312 });
        expect(warn).toHaveBeenCalledTimes(1);
        const [tag, payload] = warn.mock.calls[0];
        expect(tag).toBe("[perf:section]");
        expect(payload).toMatchObject({
            phase: "WU-02",
            status: "ready",
            source: "bootstrap",
            blocking: false,
            since_nav_ms: 312,
        });
    });
});

describe("Section map — DOM wiring presence on key roots", () => {
    const cases: Array<[string, string]> = [
        ["WU-00", "app/adminV2/components/AdminV2Shell.tsx"],
        ["WU-01", "components/admin/workspace/layout/WorkUnitCommandSurface.tsx"],
        ["WU-02", "components/admin/workspace/layout/WorkUnitCommandSurface.tsx"],
        ["WU-03", "components/admin/workspace/layout/WorkUnitCommandSurface.tsx"],
        ["WU-04", "app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx"],
        ["WU-05", "app/adminV2/components/workspace/blocks/QueueBlock.tsx"],
        ["WU-06", "app/adminV2/components/workspace/blocks/OperationalModeQueuePreparePanel.tsx"],
        ["WU-07", "components/admin/drawer/EntityDrawerOperatingShell.tsx"],
        ["WU-08", "components/admin/focusPanel/FocusPanelModeSwitch.tsx"],
        ["WU-09", "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"],
        ["WU-10", "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"],
        ["WU-11", "components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx"],
        ["WU-12", "app/adminV2/components/workspace/WorkspaceCommandRailActionsSection.tsx"],
        ["WU-13", "app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx"],
        ["WU-14", "app/adminV2/components/CommandRailBosMount.tsx"],
        ["WU-15", "app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx"],
        ["WS-01", "components/admin/workspace/ResumeWhereYouLeftOffChip.tsx"],
        ["WS-02", "components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx"],
        ["WS-03", "components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx"],
        ["WS-04", "components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx"],
        ["WS-05", "components/admin/workspace/WorkspaceRootLifecycleGrid.tsx"],
        ["WS-06", "components/admin/workspace/WorkspaceRootLifecycleGrid.tsx"],
        ["WS-07", "app/adminV2/components/workspace/WorkspaceCommandRailActionsSection.tsx"],
        ["WS-08", "app/adminV2/components/workspace/CommandRailDefaultEmptyTelemetry.tsx"],
    ];

    it.each(cases)("%s is wired via alloySectionDomAttrs in its owner root", (id, rel) => {
        const src = readSrc(rel);
        // Tolerate inline ternaries (e.g. mode/surface-keyed roots): require the helper call and the id literal.
        expect(src).toContain("alloySectionDomAttrs(");
        expect(src).toContain(`"${id}"`);
    });

    it("operational overlay overlay shell is not constrained by queue/focus split vars", () => {
        // WU-15 / WS-10 share AdminV2WorkspaceBosModalShell — it uses the full drawer canvas vars,
        // never the work-unit split layout token.
        const shell = readSrc("app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx");
        expect(shell).toContain('alloySectionDomAttrs("WU-15")');
        expect(shell).not.toContain("data-alloy-os-runtime-split");
    });
});

describe("Section map — documentation completeness", () => {
    const doc = readDoc(DOC_PATH);

    it("documents every WU and WS section id", () => {
        for (const id of ALL_IDS) {
            expect(doc, `doc missing ${id}`).toContain(id);
        }
    });

    it("documents each section name from the registry", () => {
        for (const entry of ALLOY_SECTION_LIST) {
            expect(doc, `doc missing name for ${entry.id}`).toContain(entry.name);
        }
    });

    it("states the KPI snapshot law over the snapshot sections", () => {
        expect(doc).toMatch(/KPI snapshot law/i);
        for (const id of SNAPSHOT_IDS) expect(doc).toContain(id);
    });

    it("states the operational workspace overlay law and the registration rule", () => {
        expect(doc).toMatch(/operational workspace overlay law/i);
        expect(doc).toMatch(/full available width|full operating canvas/i);
        expect(doc).toMatch(/must register an entry|Registration rule/i);
    });

    it("is linked from the four reference docs", () => {
        const link = "runtime-surface-section-map.md";
        expect(readDoc("docs/README.md")).toContain(link);
        expect(readDoc("docs/platform/operator/alloy-runtime-specification.md")).toContain(link);
        expect(readDoc("docs/platform/operator/operational-surface-design-system.md")).toContain(link);
        expect(readDoc("docs/platform/operator/operational-mode-default-state-doctrine.md")).toContain(link);
    });
});
