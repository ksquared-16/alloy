/**
 * Dev-only settings route switch instrumentation.
 * Filter: `[perf:settings]`
 */

import { perfSettings } from "@/lib/perf/perfNamespaceLog";

export function markSettingsRouteSwitchStart(href: string, source: string): void {
    if (process.env.NODE_ENV === "production") return;
    perfSettings("route_switch_start", { href, source });
}

export function markSettingsRouteSwitchEnd(href: string, source: string): void {
    if (process.env.NODE_ENV === "production") return;
    perfSettings("route_switch_end", { href, source });
}
