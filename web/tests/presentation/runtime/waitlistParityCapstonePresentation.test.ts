import { afterEach, describe, expect, it, vi } from "vitest";

import {
    compactWaitlistPositionLabel,
    formatWaitlistRuntimePositionLabel,
} from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";
import {
    queueGroupCollapseStorageKey,
    readQueueGroupCollapsed,
    writeQueueGroupCollapsed,
} from "@/lib/presentation/runtime/queueGroupCollapseSession";
import { formatCompactRelativeDurationIso } from "@/lib/format/formatCompactRelativeDuration";

describe("waitlist compact rank presentation", () => {
    it("formats live ranks as #n/total", () => {
        expect(formatWaitlistRuntimePositionLabel("live", 1, 4)).toBe("#1/4");
        expect(formatWaitlistRuntimePositionLabel("preview", 2, 5)).toBe("Preview #2/5");
    });

    it("compacts legacy Position labels for top-right chrome", () => {
        expect(compactWaitlistPositionLabel("Position 1/4")).toBe("#1/4");
        expect(compactWaitlistPositionLabel("#2/3")).toBe("#2/3");
        expect(compactWaitlistPositionLabel("Preview position 1/2")).toBe("Preview #1/2");
        expect(compactWaitlistPositionLabel(null)).toBeNull();
    });
});

describe("queue group collapse session", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("scopes storage keys by host + view + group", () => {
        expect(
            queueGroupCollapseStorageKey({
                workUnitId: "wu-waitlist",
                workViewId: "waitlist",
                groupKind: "program",
                groupValue: "INFANT — 0–18 MONTHS",
            }),
        ).toContain("wu-waitlist");
    });

    it("reads/writes collapsed state when sessionStorage is available", () => {
        const store = new Map<string, string>();
        vi.stubGlobal("window", {
            sessionStorage: {
                getItem: (k: string) => store.get(k) ?? null,
                setItem: (k: string, v: string) => {
                    store.set(k, v);
                },
                removeItem: (k: string) => {
                    store.delete(k);
                },
            },
        });
        const key = queueGroupCollapseStorageKey({
            workUnitId: "wu-1",
            workViewId: "v-1",
            groupKind: "program",
            groupValue: "Toddler",
        });
        writeQueueGroupCollapsed(key, true);
        expect(readQueueGroupCollapsed(key)).toBe(true);
        writeQueueGroupCollapsed(key, false);
        expect(readQueueGroupCollapsed(key)).toBe(false);
    });
});

describe("wait since compact temporal grammar", () => {
    it("uses shared compact relative duration (not audit calendar dates)", () => {
        const threeDaysAgo = new Date(Date.UTC(2026, 7, 8, 12, 0, 0)).toISOString();
        const nowMs = Date.UTC(2026, 7, 11, 12, 0, 0);
        expect(formatCompactRelativeDurationIso(threeDaysAgo, nowMs)?.compact).toBe("3d");
    });
});
