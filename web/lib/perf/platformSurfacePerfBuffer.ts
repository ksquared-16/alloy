import type { PlatformPerfSurface } from "@/lib/perf/platformSurfacePerfTypes";

export type PlatformSurfacePerfEvent = {
    ts: number;
    iso: string;
    surface: PlatformPerfSurface;
    phase: string;
    payload: Record<string, unknown>;
    path: string;
};

const SESSION_KEY = "alloy:platform-perf-events";
const MAX_EVENTS = 200;

let memoryEvents: PlatformSurfacePerfEvent[] = [];

function readSessionEvents(): PlatformSurfacePerfEvent[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.sessionStorage.getItem(SESSION_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as PlatformSurfacePerfEvent[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeSessionEvents(events: PlatformSurfacePerfEvent[]): void {
    if (typeof window === "undefined") return;
    try {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(events));
    } catch {
        /* quota / private mode — memory buffer still works */
    }
}

function hydrateMemoryFromSession(): void {
    if (memoryEvents.length > 0) return;
    memoryEvents = readSessionEvents();
}

export function appendPlatformSurfacePerfEvent(event: PlatformSurfacePerfEvent): void {
    hydrateMemoryFromSession();
    memoryEvents.push(event);
    if (memoryEvents.length > MAX_EVENTS) {
        memoryEvents = memoryEvents.slice(-MAX_EVENTS);
    }
    writeSessionEvents(memoryEvents);
}

export function getPlatformSurfacePerfEvents(): PlatformSurfacePerfEvent[] {
    hydrateMemoryFromSession();
    return [...memoryEvents];
}

export function clearPlatformSurfacePerfBufferForTests(): void {
    memoryEvents = [];
    if (typeof window !== "undefined") {
        try {
            window.sessionStorage.removeItem(SESSION_KEY);
        } catch {
            /* ignore */
        }
    }
}

export function dumpPlatformSurfacePerfEventsToConsole(): PlatformSurfacePerfEvent[] {
    const events = getPlatformSurfacePerfEvents();
    if (typeof console !== "undefined" && typeof console.table === "function") {
        console.table(
            events.map((event) => ({
                iso: event.iso,
                surface: event.surface,
                phase: event.phase,
                path: event.path,
                ...event.payload,
            })),
        );
    }
    return events;
}
