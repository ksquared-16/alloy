// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import {
    isCanonicalAiActivityPath,
    isCanonicalSettingsPath,
    isCanonicalWorkflowsPath,
    isCanonicalWorkspacePath,
} from "@/lib/admin/canonicalAdminRoutes";
import { alloyOsRuntimeSplitActive } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import {
    workUnitPageContentReady,
    workUnitPageShowsLoadingGate,
} from "@/lib/adminV2/workUnitPageRevealPolicy";
import {
    coreSurfacePreloadKeys,
    CORE_SURFACE_PRELOAD_REGISTRY,
} from "@/lib/adminV2/coreSurfacePreloadRegistry";
import { selectFocusPanelModesToPrewarm, useFocusPanelModePrewarm } from "@/lib/adminV2/runtime/focusPanel/useFocusPanelModePrewarm";
import { useFocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/useFocusPanelMode";
import {
    buildResumeHref,
    buildResumeLabel,
    clearAllResumeSessions,
    isResumeSnapshotNavigable,
    readResumeSession,
    writeResumeSession,
    type ResumeSessionScope,
} from "@/lib/adminV2/runtime/resumeSession";
import { clearVolatileRuntimeSessionState } from "@/lib/adminV2/runtime/runtimeSessionState";
import { ADMIN_V2_SIDEBAR_COLLAPSED_KEY } from "@/lib/adminV2/navigation/adminV2SidebarCollapsed";
import { idleLogoutEnabled, IDLE_LOGOUT_MS, IDLE_WARN_MS } from "@/lib/adminV2/runtime/useIdleSessionLogout";
import { useWorkUnitDefaultOperationalSubjectAutoOpen } from "@/lib/adminV2/runtime/operationalSubject/useWorkUnitDefaultOperationalSubjectAutoOpen";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

function mount(ui: ReactNode) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(ui);
    });
    return {
        rerender: (next: ReactNode) =>
            act(() => {
                root.render(next);
            }),
        unmount: () => act(() => root.unmount()),
    };
}

const SCOPE: ResumeSessionScope = {
    orgId: "org-1",
    principalUserId: "user-1",
    accessScopeFingerprint: "scope:site-a",
};

beforeEach(() => {
    try {
        sessionStorage.clear();
    } catch {
        /* ignore */
    }
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    try {
        sessionStorage.clear();
    } catch {
        /* ignore */
    }
});

describe("Alloy OS performance pass", () => {
    // 1. Left nav does not remount across workspace route transitions.
    it("keeps every operator route inside the same persistent shell branch (no left-nav remount)", () => {
        const operatorRoutes = [
            "/workspace",
            "/workspace/work-unit/enrollment-new-leads",
            "/workspace/work-unit/enrollment-new-leads/opp-123",
            "/settings/processes",
            "/admin/workflows",
        ];
        const inPersistentShellBranch = (path: string) =>
            isCanonicalWorkspacePath(path) ||
            isCanonicalAiActivityPath(path) ||
            isCanonicalSettingsPath(path) ||
            isCanonicalWorkflowsPath(path);
        for (const route of operatorRoutes) {
            expect(inPersistentShellBranch(route)).toBe(true);
        }
    });

    // 2. Work-unit entry does not flash full-width queue.
    it("holds the work-unit cold shell until the critical bundle is ready, then activates the condensed split", () => {
        // Before the bundle is ready, the page gate holds (no full-width queue flash).
        expect(
            workUnitPageShowsLoadingGate({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: false,
            }),
        ).toBe(true);
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: true,
                coordinated_reveal_completed: false,
            }),
        ).toBe(true);
        // Operational subject open on a work-unit surface => condensed queue + Focus Panel (split), not full width.
        expect(
            alloyOsRuntimeSplitActive({
                perspectiveActive: true,
                drawerOpen: true,
                onWorkUnitSurface: true,
            }),
        ).toBe(true);
    });

    // 3. Operational prep gate holds only until subject/empty/deep-link ready.
    it("operational prep gate releases once the coordinated reveal (subject / empty / deep link) completes", () => {
        expect(
            workUnitPageShowsLoadingGate({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: false,
            }),
        ).toBe(true);
        // Once the coordinated reveal completes (deep link or subject resolved), the gate releases.
        expect(
            workUnitPageShowsLoadingGate({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: true,
            }),
        ).toBe(false);
    });

    // 4. Default subject resolver respects URL/manual selection.
    it("auto-opens the default subject, but yields to a URL deep-link record id", () => {
        const displayItems = [
            { id: "opp-1", title: "Wright Family", quickActions: [] },
        ] as unknown as QueuePreviewItemVm[];

        const baseParams = {
            enabled: true,
            workUnitId: "wu-1",
            workUnitKey: "enrollment",
            activeQueueKey: "new_leads",
            laneMayPaint: true,
            queueItemsLoading: false,
            displayItemsRef: { current: displayItems },
            rawQueueItemsRef: { current: null },
            queueEntityType: "opportunity" as const,
            drawerType: null,
            drawerId: null,
            currentUserId: "user-1",
            queueRevision: 1,
        };

        const openWithoutUrl = vi.fn();
        function HarnessNoUrl() {
            useWorkUnitDefaultOperationalSubjectAutoOpen({
                ...baseParams,
                routeRecordId: null,
                openRecord: openWithoutUrl,
            });
            return null;
        }
        const a = mount(createElement(HarnessNoUrl));
        expect(openWithoutUrl).toHaveBeenCalledTimes(1);
        expect(openWithoutUrl).toHaveBeenCalledWith("opp-1", "opportunity", "default_operational_subject");
        a.unmount();

        const openWithUrl = vi.fn();
        function HarnessWithUrl() {
            useWorkUnitDefaultOperationalSubjectAutoOpen({
                ...baseParams,
                routeRecordId: "opp-deep-link",
                openRecord: openWithUrl,
            });
            return null;
        }
        const b = mount(createElement(HarnessWithUrl));
        expect(openWithUrl).not.toHaveBeenCalled();
        b.unmount();
    });

    // 5. Focus Panel mode state persists across subject swaps where intended.
    it("retains Focus Panel mode across operational subject swaps", () => {
        let api: { mode: string; setMode: (m: "summary" | "work" | "activity") => void } | null = null;
        function Harness({ subjectId }: { subjectId: string }) {
            const hook = useFocusPanelMode({ subjectId });
            api = hook;
            return null;
        }
        const h = mount(createElement(Harness, { subjectId: "opp-1" }));
        expect(api!.mode).toBe("summary");
        act(() => api!.setMode("work"));
        expect(api!.mode).toBe("work");
        expect(sessionStorage.getItem("alloy:focus-panel-mode")).toBe("work");
        // Swap subject — mode must persist.
        h.rerender(createElement(Harness, { subjectId: "opp-2" }));
        expect(api!.mode).toBe("work");
        h.unmount();
    });

    // 6. Non-active Focus Panel modes can prewarm after active mode.
    it("selects only non-active modes for prewarm and warms them after a short idle", () => {
        expect(selectFocusPanelModesToPrewarm("summary")).toEqual(["work", "activity"]);
        expect(selectFocusPanelModesToPrewarm("activity")).toEqual(["summary", "work"]);
        expect(selectFocusPanelModesToPrewarm("summary")).not.toContain("summary");

        vi.stubGlobal("requestIdleCallback", undefined);
        vi.useFakeTimers();

        const warmWork = vi.fn();
        const warmActivity = vi.fn();
        const warmSummary = vi.fn();
        function Harness() {
            useFocusPanelModePrewarm({
                enabled: true,
                activeMode: "summary",
                subjectId: "opp-1",
                prewarm: { work: warmWork, activity: warmActivity, summary: warmSummary },
            });
            return null;
        }
        const h = mount(createElement(Harness));
        // Active mode (summary) warms immediately; non-active modes wait for idle.
        expect(warmSummary).toHaveBeenCalledTimes(1);
        expect(warmWork).not.toHaveBeenCalled();
        expect(warmActivity).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(700);
        });
        expect(warmWork).toHaveBeenCalledTimes(1);
        expect(warmActivity).toHaveBeenCalledTimes(1);
        h.unmount();
    });

    // 7. Core surface preload registry includes Communications, Work Items, Processing.
    it("registers the named core surfaces (incl. Communications, Work Items, Processing)", () => {
        const keys = coreSurfacePreloadKeys();
        expect(keys).toContain("workspace");
        expect(keys).toContain("work_units");
        expect(keys).toContain("communications");
        expect(keys).toContain("work_items");
        expect(keys).toContain("processing");
        const labels = CORE_SURFACE_PRELOAD_REGISTRY.map((e) => e.label);
        expect(labels).toEqual(
            expect.arrayContaining(["Communications", "Work Items", "Processing"]),
        );
    });

    // 8. Resume affordance respects URL override.
    it("round-trips resume state and rides the canonical URL so URL selection wins on arrival", () => {
        writeResumeSession(SCOPE, {
            workUnitSlug: "enrollment-new-leads",
            workUnitName: "Enrollment",
            departmentId: "dept-1",
            workUnitId: "wu-1",
            laneKey: "new_leads",
            laneLabel: "New Leads",
            perspectiveKey: null,
            subjectEntityId: "opp-1",
            subjectEntityType: "opportunity",
            subjectLabel: "Wright Family",
            focusPanelMode: "summary",
            queueScrollTop: 120,
        });
        const snap = readResumeSession(SCOPE);
        expect(isResumeSnapshotNavigable(snap)).toBe(true);
        expect(buildResumeLabel(snap!)).toBe("Resume Enrollment \u00b7 New Leads \u00b7 Wright Family");
        // Subject + lane ride the canonical URL — so the URL drives selection on arrival (URL wins).
        const href = buildResumeHref(snap!);
        expect(href).toBe("/workspace/work-unit/enrollment-new-leads/opp-1?queue=new_leads");

        // Not navigable (and therefore not offered) without a slug + work unit.
        expect(
            isResumeSnapshotNavigable({
                ...snap!,
                workUnitSlug: null,
            }),
        ).toBe(false);
    });

    it("does not write resume state when scope is incomplete", () => {
        writeResumeSession(
            { orgId: null, principalUserId: null, accessScopeFingerprint: "scope:unknown" },
            {
                workUnitSlug: "x",
                workUnitName: null,
                departmentId: null,
                workUnitId: "wu-1",
                laneKey: null,
                laneLabel: null,
                perspectiveKey: null,
                subjectEntityId: "opp-1",
                subjectEntityType: "opportunity",
                subjectLabel: null,
                focusPanelMode: null,
                queueScrollTop: null,
            },
        );
        expect(
            readResumeSession({ orgId: null, principalUserId: null, accessScopeFingerprint: "scope:unknown" }),
        ).toBeNull();
    });

    // 9. Idle logout clears session runtime state.
    it("clears volatile runtime + resume state on idle logout while preserving durable prefs", () => {
        sessionStorage.setItem(ADMIN_V2_SIDEBAR_COLLAPSED_KEY, "1");
        sessionStorage.setItem("alloy:focus-panel-mode", "work");
        sessionStorage.setItem("alloy:v6:admV2:ws:root:org-1:user-1:scope", "{}");
        writeResumeSession(SCOPE, {
            workUnitSlug: "enrollment-new-leads",
            workUnitName: "Enrollment",
            departmentId: "dept-1",
            workUnitId: "wu-1",
            laneKey: "new_leads",
            laneLabel: "New Leads",
            perspectiveKey: null,
            subjectEntityId: "opp-1",
            subjectEntityType: "opportunity",
            subjectLabel: "Wright Family",
            focusPanelMode: "summary",
            queueScrollTop: 0,
        });
        expect(readResumeSession(SCOPE)).not.toBeNull();

        clearVolatileRuntimeSessionState();

        expect(readResumeSession(SCOPE)).toBeNull();
        expect(sessionStorage.getItem("alloy:focus-panel-mode")).toBeNull();
        expect(sessionStorage.getItem("alloy:v6:admV2:ws:root:org-1:user-1:scope")).toBeNull();
        // Durable preference preserved.
        expect(sessionStorage.getItem(ADMIN_V2_SIDEBAR_COLLAPSED_KEY)).toBe("1");
    });

    // 10. Runtime flag off preserves legacy behavior.
    it("idle logout is opt-in (disabled by default) so the flag off preserves legacy behavior", () => {
        // No NEXT_PUBLIC_ALLOY_OS_IDLE_LOGOUT env set in tests => disabled.
        expect(idleLogoutEnabled()).toBe(false);
        // Defaults still defined for when the flag is enabled.
        expect(IDLE_WARN_MS).toBe(25 * 60 * 1000);
        expect(IDLE_LOGOUT_MS).toBe(30 * 60 * 1000);
    });

    it("clearAllResumeSessions removes resume keys across scopes", () => {
        writeResumeSession(SCOPE, {
            workUnitSlug: "a",
            workUnitName: null,
            departmentId: null,
            workUnitId: "wu-1",
            laneKey: null,
            laneLabel: null,
            perspectiveKey: null,
            subjectEntityId: "opp-1",
            subjectEntityType: "opportunity",
            subjectLabel: null,
            focusPanelMode: null,
            queueScrollTop: null,
        });
        expect(readResumeSession(SCOPE)).not.toBeNull();
        clearAllResumeSessions();
        expect(readResumeSession(SCOPE)).toBeNull();
    });
});
