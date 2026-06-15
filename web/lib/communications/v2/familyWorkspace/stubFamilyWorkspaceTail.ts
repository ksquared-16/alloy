// UI-5A/5B — stable empty defaults for the conversation tail (used when no comms data loaded).
import type { HealthSummary, ThreadVM, TimelineEventVM } from "./types";

export function stubFamilyWorkspaceTail(overrides?: {
    threads?: ThreadVM[];
    selectedThread?: ThreadVM | null;
    messages?: TimelineEventVM[];
    timelineEvents?: TimelineEventVM[];
    healthSummary?: Partial<HealthSummary>;
}): {
    threads: ThreadVM[];
    selectedThread: ThreadVM | null;
    messages: TimelineEventVM[];
    timelineEvents: TimelineEventVM[];
    healthSummary: HealthSummary;
} {
    return {
        threads: overrides?.threads ?? [],
        selectedThread: overrides?.selectedThread ?? null,
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
