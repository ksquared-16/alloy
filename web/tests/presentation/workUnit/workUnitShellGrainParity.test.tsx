/** @vitest-environment jsdom */

/**
 * Work View shell parity — family vs child grain must share ONE Work Unit outer shell.
 * Selected subject must not demote Enrollment/Pipeline chrome into focus density.
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: unknown; children: ReactNode }) => (
        <a href={typeof href === "string" ? href : "#"} {...rest}>
            {children}
        </a>
    ),
}));

vi.mock("@/components/presentation/workUnit/FocusPanelSurface", () => ({
    FocusPanelSurface: ({ children }: { children: ReactNode }) => (
        <div data-focus-panel-surface="true">{children}</div>
    ),
}));

vi.mock("@/components/presentation/workUnit/QueueRegion", () => ({
    QueueRegion: () => <div data-queue-region-stub="true" />,
}));

vi.mock("@/components/presentation/rightRail/RightRailSurface", () => ({
    RightRailSurface: () => null,
}));

vi.mock("@/components/presentation/rightRail/CreateLeadEventHost", () => ({
    CreateLeadEventHost: () => null,
}));

vi.mock("@/components/presentation/rightRail/BosWorkspaceScopeSync", () => ({
    BosWorkspaceScopeSync: () => null,
}));

vi.mock("@/components/presentation/rightRail/WorkUnitRightRailActions", () => ({
    WorkUnitRightRailActions: () => null,
}));

import { WorkUnitSurfaceBodyFromModel } from "@/components/presentation/workUnit/WorkUnitSurface";
import {
    DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG,
    buildWorkUnitHeaderPresentationForRuntime,
} from "@/lib/presentation/runtime/workUnitHeaderSurfaceConfig";
import type { WorkUnitSurfaceIntents, WorkUnitSurfaceModel } from "@/lib/presentation/runtime/types";

function headerModel() {
    return buildWorkUnitHeaderPresentationForRuntime(
        { ...DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG, title: "Enrollment", subtitle: "Pipeline" },
        { fallbackTitle: "Enrollment", fallbackSubtitle: "Pipeline", resolved: null },
    );
}

function baseModel(overrides: Partial<WorkUnitSurfaceModel> = {}): WorkUnitSurfaceModel {
    return {
        header: headerModel(),
        workViews: [
            { id: "leads", label: "Leads", isActive: false, count: 0, attentionCount: null },
            { id: "waitlist", label: "Waitlist", isActive: true, count: 2, attentionCount: null },
        ],
        queue: {
            rows: [],
            loading: false,
            error: null,
            errorKind: null,
            totalCount: null,
            rowConfig: {
                subject: { visible: true, fieldKeys: [] },
                status: { visible: true, fieldKeys: [] },
                contact: { visible: true, fieldKeys: [] },
                attention: { visible: true, fieldKeys: [] },
                work: { visible: true, fieldKeys: [] },
                groupCount: { visible: true, fieldKeys: [] },
            },
        },
        activeWorkViewId: "waitlist",
        selectedRecordId: null,
        selectedSubject: { selectedRecordId: null, source: "empty" },
        rightRailActions: [],
        departmentId: "dept-1",
        workUnitId: "wu-1",
        ready: true,
        readiness: {
            coldCompositionReady: true,
            coldOperationalReady: true,
            settlementReady: true,
            warmHoldActive: false,
        },
        ...overrides,
    } as WorkUnitSurfaceModel;
}

const intents: WorkUnitSurfaceIntents = {
    selectWorkView: () => {},
    prefetchWorkView: () => {},
    openRecord: () => {},
    prefetchRecord: () => {},
};

let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(node));
    return container;
}
afterEach(() => {
    if (container) {
        container.remove();
        container = null;
    }
});

describe("WorkUnitSurfaceBodyFromModel shell parity", () => {
    it("keeps browse header anatomy when a child Waitlist subject is selected", () => {
        const el = render(
            <WorkUnitSurfaceBodyFromModel
                model={baseModel({
                    selectedRecordId: "pi-lennon",
                    selectedSubject: { selectedRecordId: "pi-lennon", source: "url" },
                    activeWorkViewId: "waitlist",
                })}
                intents={intents}
            />,
        );
        expect(el.querySelector("[data-work-unit-header-mode='browse']")).not.toBeNull();
        expect(el.querySelector("[data-work-unit-header-mode='focus']")).toBeNull();
        expect(el.querySelector("[data-work-unit-header-title]")?.textContent).toBe("Enrollment");
        expect(el.querySelector("[data-work-unit-header-subtitle]")?.textContent).toBe("Pipeline");
        expect(el.querySelector("[data-work-unit-header-title]")?.className).toContain("text-[28px]");
    });

    it("uses the same outer shell path for family Leads with a selected subject", () => {
        const el = render(
            <WorkUnitSurfaceBodyFromModel
                model={baseModel({
                    workViews: [
                        { id: "leads", label: "Leads", isActive: true, count: 1, attentionCount: null },
                        { id: "waitlist", label: "Waitlist", isActive: false, count: 2, attentionCount: null },
                    ],
                    activeWorkViewId: "leads",
                    selectedRecordId: "opp-kurzman",
                    selectedSubject: { selectedRecordId: "opp-kurzman", source: "url" },
                })}
                intents={intents}
            />,
        );
        expect(el.querySelector("[data-work-unit-header-mode='browse']")).not.toBeNull();
        expect(el.querySelector("[data-work-unit-header-title]")?.textContent).toBe("Enrollment");
        expect(el.querySelector("[data-work-unit-header-subtitle]")?.textContent).toBe("Pipeline");
        expect(el.querySelector("[data-focus-panel-surface='true']")).not.toBeNull();
        expect(el.querySelector("[data-queue-region-stub='true']")).not.toBeNull();
    });
});
