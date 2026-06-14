// UI-5A — stable empty defaults for the 5B/5C tail (threads/messages/timeline/health).
import type { HealthSummary } from "./types";

export function stubFamilyWorkspaceTail(overrides?: {
    threads?: unknown[];
    messages?: unknown[];
    timelineEvents?: unknown[];
    healthSummary?: Partial<HealthSummary>;
}): {
    threads: unknown[];
    selectedThread: unknown | null;
    messages: unknown[];
    timelineEvents: unknown[];
    healthSummary: HealthSummary;
} {
    return {
        threads: overrides?.threads ?? [],
        selectedThread: null,
        messages: overrides?.messages ?? [],
        timelineEvents: overrides?.timelineEvents ?? [],
        healthSummary: {
            status: "healthy",
            engagementScore: 0,
            responseRate: null,
            lastContactAt: null,
            unreadCount: 0,
            ...(overrides?.healthSummary ?? {}),
        },
    };
}
