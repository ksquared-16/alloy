import { describe, expect, it } from "vitest";

import {
    selectWorkspaceProcessTileSnapshot,
    workspaceProcessSurfaceReady,
    type WorkspaceProcessTileSnapshot,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceAssembly";
import { DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import type { ProcessTileModel } from "@/lib/presentation/runtime";

function snapshot(label: string): WorkspaceProcessTileSnapshot {
    return {
        config: {
            ...DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
            cardByProcess: { enrollment: { title: label } },
        },
        processes: [
            {
                id: label,
                processKey: "enrollment",
                label,
                description: "",
                entryHref: "#",
                activeRecordCount: 1,
                needsAttentionCount: 0,
                workViews: [],
                primarySignal: {
                    key: "enrollment.active_leads",
                    label: "Active leads",
                    answer: "Active leads",
                    state: "healthy",
                    value: "12",
                    supportingContext: null,
                    trend: null,
                    drillHref: null,
                },
                supportingSignal: null,
            } satisfies ProcessTileModel,
        ],
    };
}

describe("workspaceProcessSurfaceAssembly", () => {
    it("does not commit the default runtime card before published config is loaded", () => {
        const selected = selectWorkspaceProcessTileSnapshot({
            previous: null,
            next: snapshot("Default Enrollment"),
            readiness: {
                cardsSettled: true,
                configLoaded: false,
                signalsSettled: true,
                totalsSettled: true,
            },
        });
        expect(selected.ready).toBe(false);
        expect(selected.snapshot).toBeNull();
    });

    it("keeps the previous complete tile while the next metric/count scope settles", () => {
        const selected = selectWorkspaceProcessTileSnapshot({
            previous: snapshot("Published Enrollment"),
            next: snapshot("Next Enrollment"),
            readiness: {
                cardsSettled: true,
                configLoaded: true,
                signalsSettled: false,
                totalsSettled: true,
            },
        });
        expect(selected.ready).toBe(true);
        expect(selected.snapshot?.processes[0]?.label).toBe("Published Enrollment");
    });

    it("commits only when cards, config, signals, and totals are all ready", () => {
        expect(
            workspaceProcessSurfaceReady({
                cardsSettled: true,
                configLoaded: true,
                signalsSettled: true,
                totalsSettled: true,
            }),
        ).toBe(true);
        const selected = selectWorkspaceProcessTileSnapshot({
            previous: snapshot("Old"),
            next: snapshot("New"),
            readiness: {
                cardsSettled: true,
                configLoaded: true,
                signalsSettled: true,
                totalsSettled: true,
            },
        });
        expect(selected.snapshot?.processes[0]?.label).toBe("New");
    });
});
