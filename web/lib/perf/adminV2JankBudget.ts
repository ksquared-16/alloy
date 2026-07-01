/**
 * Staging/dev network budget logger for enrollment WU + opportunity drawer path.
 */

export type AdminV2JankBudgetPhase =
    | "wu_bootstrap"
    | "drawer_open"
    | "sidecar_fetch"
    | "sidecar_cache_hit"
    | "sidecar_inflight_join"
    | "sidecar_blocked"
    | "drawer_tasks"
    | "drawer_actions"
    | "drawer_tours"
    | "other";

export type AdminV2JankBudgetEvent = {
    phase: AdminV2JankBudgetPhase;
    url: string;
    endpoint?: string;
    note?: string;
};

const WU_BOOTSTRAP_MAX = 1;
const DRAWER_OPEN_WINDOW_MS = 2000;
const DRAWER_OPEN_MAX = 3;
const SIDECAR_TTL_MS = 60_000;

let enabled =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ADMINV2_JANK_BUDGET === "1");

const wuBootstrapUrls = new Set<string>();
const drawerOpenLog: { atMs: number; url: string }[] = [];
const sidecarLog = new Map<string, number>();
const duplicateGuards = new Map<string, number>();

export function setAdminV2JankBudgetEnabled(on: boolean): void {
    enabled = on;
}

export function resetAdminV2JankBudgetForTests(): void {
    wuBootstrapUrls.clear();
    drawerOpenLog.length = 0;
    sidecarLog.clear();
    duplicateGuards.clear();
}

function logViolation(reason: string, detail: Record<string, unknown>): void {
    if (!enabled || typeof console === "undefined") return;
    console.warn("[adminv2-jank-budget-violation]", reason, detail);
}

function normalizeUrl(url: string): string {
    try {
        const u = new URL(url, "https://alloy.local");
        return `${u.pathname}${u.search}`;
    } catch {
        return url;
    }
}

export function recordAdminV2JankBudgetRequest(ev: AdminV2JankBudgetEvent): void {
    if (!enabled) return;
    const url = normalizeUrl(ev.url);
    const now = Date.now();

    if (ev.phase === "wu_bootstrap" && url.includes("operational-bootstrap")) {
        wuBootstrapUrls.add(url);
        if (wuBootstrapUrls.size > WU_BOOTSTRAP_MAX) {
            logViolation("wu_bootstrap_exceeded", { count: wuBootstrapUrls.size, url, max: WU_BOOTSTRAP_MAX });
        }
        return;
    }

    if (ev.phase === "sidecar_fetch" && ev.endpoint) {
        const last = sidecarLog.get(ev.endpoint) ?? 0;
        if (now - last < SIDECAR_TTL_MS) {
            logViolation("sidecar_repeat_within_ttl", { endpoint: ev.endpoint, url, msSinceLast: now - last });
        }
        sidecarLog.set(ev.endpoint, now);
        return;
    }

    if (url.includes("/api/admin/actions?")) {
        const sig = url.replace(/entity_id=[^&]+/, "entity_id=*");
        const n = (duplicateGuards.get(`actions:${sig}`) ?? 0) + 1;
        duplicateGuards.set(`actions:${sig}`, n);
        if (n > 1 && ev.phase === "drawer_actions") {
            logViolation("duplicate_actions", { url, count: n });
        }
    }

    if (url.includes("/tours/opportunities/") && url.includes("/bookings")) {
        const n = (duplicateGuards.get(`tours:${url}`) ?? 0) + 1;
        duplicateGuards.set(`tours:${url}`, n);
        if (n > 1) {
            logViolation("duplicate_tours_bookings", { url, count: n });
        }
    }

    if (ev.phase === "drawer_open" || url.includes("/api/admin/entity/opportunities/")) {
        drawerOpenLog.push({ atMs: now, url });
        const windowStart = now - DRAWER_OPEN_WINDOW_MS;
        while (drawerOpenLog.length && drawerOpenLog[0]!.atMs < windowStart) {
            drawerOpenLog.shift();
        }
        const critical = drawerOpenLog.filter(
            (e) =>
                e.url.includes("drawer-operational-bootstrap") ||
                e.url.includes("surface=drawer_primary") ||
                e.url.includes("surface=record_header") ||
                e.url.includes("surface=full")
        );
        if (critical.length > DRAWER_OPEN_MAX) {
            logViolation("drawer_open_burst", {
                count: critical.length,
                max: DRAWER_OPEN_MAX,
                urls: critical.map((e) => e.url),
            });
        }
    }
}

export function markAdminV2DrawerOpenBudgetStart(): void {
    if (!enabled) return;
    drawerOpenLog.length = 0;
    duplicateGuards.clear();
}
