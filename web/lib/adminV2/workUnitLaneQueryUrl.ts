import {
    captureRouteDebugStack,
    logAdminV2RouteWrite,
    type AdminV2RouteWriteKind,
} from "@/lib/debug/adminV2RouteDebug";

/** Lane keys owned by work-unit queue tabs (shallow `history` sync only). */
export const WORK_UNIT_LANE_QUERY_KEYS = ["queue", "unmapped", "attention_bucket"] as const;

export const ADMINV2_WORK_UNIT_LANE_QUERY_EVENT = "adminv2:work-unit-lane-query";

export function readWorkUnitUrlSearchSnapshot(): URLSearchParams {
    if (typeof window === "undefined") return new URLSearchParams();
    try {
        return new URLSearchParams(window.location.search);
    } catch {
        return new URLSearchParams();
    }
}

export function queueParamFromWindow(): string {
    if (typeof window === "undefined") return "";
    try {
        return new URL(window.location.href).searchParams.get("queue")?.trim() ?? "";
    } catch {
        return "";
    }
}

/** Path + `?search` string for the current document (no origin). */
export function workUnitDocumentUrlKey(pathname?: string, search?: string): string {
    if (typeof window === "undefined") return "";
    const path = pathname ?? window.location.pathname;
    const qs = search ?? window.location.search;
    return qs ? `${path}${qs.startsWith("?") ? qs : `?${qs}`}` : path;
}

export function formatWorkUnitBrowserUrl(path: string, sp: URLSearchParams): string {
    const qs = sp.toString();
    return qs ? `${path}?${qs}` : path;
}

export type WorkUnitLaneQueryCommit = {
    queueKey: string;
    unmappedActive: boolean;
    attentionBucket?: string;
    workViewId?: string | null;
    queueLayoutId?: string | null;
    focusLayoutId?: string | null;
};

/** Build the next lane query from the current snapshot + commit options. */
export function buildWorkUnitLaneSearchParams(
    base: URLSearchParams,
    opts: WorkUnitLaneQueryCommit
): URLSearchParams {
    const sp = new URLSearchParams(base.toString());
    sp.set("queue", opts.queueKey);
    if (opts.unmappedActive) sp.set("unmapped", "1");
    else sp.delete("unmapped");
    const na = opts.queueKey.trim().toLowerCase() === "needs_attention";
    if (!na) {
        sp.delete("attention_bucket");
    } else if (opts.attentionBucket !== undefined) {
        const v = opts.attentionBucket.trim();
        if (v) sp.set("attention_bucket", v);
        else sp.delete("attention_bucket");
    }
    const workViewId = opts.workViewId?.trim();
    if (workViewId) sp.set("work_view", workViewId);
    else sp.delete("work_view");
    const queueLayoutId = opts.queueLayoutId?.trim();
    if (queueLayoutId) sp.set("queue_layout", queueLayoutId);
    else sp.delete("queue_layout");
    const focusLayoutId = opts.focusLayoutId?.trim();
    if (focusLayoutId) sp.set("focus_layout", focusLayoutId);
    else sp.delete("focus_layout");
    return sp;
}

let laneUrlSyncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Best-effort address-bar sync for shareable URLs. Does not notify React — lane UI state is local.
 */
export function scheduleWorkUnitLaneUrlSync(
    opts: WorkUnitLaneQueryCommit & { caller?: string; workUnitId?: string | null }
): void {
    if (typeof window === "undefined") return;
    if (laneUrlSyncTimer != null) clearTimeout(laneUrlSyncTimer);
    laneUrlSyncTimer = setTimeout(() => {
        laneUrlSyncTimer = null;
        const sp = buildWorkUnitLaneSearchParams(readWorkUnitUrlSearchSnapshot(), opts);
        replaceWorkUnitBrowserSearch(sp, {
            caller: opts.caller ?? "scheduleWorkUnitLaneUrlSync",
            workUnitId: opts.workUnitId ?? null,
        });
    }, 0);
}

/**
 * Shallow lane query sync — preserves Next `history.state`; avoids App Router navigations.
 * Returns `true` when the URL was actually updated.
 */
export function replaceWorkUnitBrowserSearch(
    next: URLSearchParams,
    opts?: { caller?: string; onCommitted?: () => void; workUnitId?: string | null }
): boolean {
    if (typeof window === "undefined") return false;
    const caller = opts?.caller ?? "replaceWorkUnitBrowserSearch";
    const path = window.location.pathname;
    const previousUrl = workUnitDocumentUrlKey(path, window.location.search);
    const nextUrl = formatWorkUnitBrowserUrl(path, next);
    const queueKey = next.get("queue");

    if (previousUrl === nextUrl) {
        logAdminV2RouteWrite({
            kind: "skipped",
            caller,
            previousUrl,
            nextUrl,
            skipped: true,
            queueKey,
            workUnitId: opts?.workUnitId ?? null,
            stack: captureRouteDebugStack(),
        });
        return false;
    }

    window.history.replaceState(window.history.state, "", nextUrl);
    logAdminV2RouteWrite({
        kind: "history.replaceState",
        caller,
        previousUrl,
        nextUrl,
        skipped: false,
        queueKey,
        workUnitId: opts?.workUnitId ?? null,
        stack: captureRouteDebugStack(),
    });
    opts?.onCommitted?.();
    return true;
}

/** @deprecated Prefer {@link scheduleWorkUnitLaneUrlSync} — lane UI must not read URL after writes. */
export function commitWorkUnitLaneQueryUrl(
    opts: WorkUnitLaneQueryCommit & { caller?: string; workUnitId?: string | null },
    onCommitted?: () => void
): boolean {
    if (typeof window === "undefined") return false;
    const sp = buildWorkUnitLaneSearchParams(readWorkUnitUrlSearchSnapshot(), opts);
    return replaceWorkUnitBrowserSearch(sp, {
        caller: opts.caller ?? "commitWorkUnitLaneQueryUrl",
        workUnitId: opts.workUnitId ?? null,
        onCommitted,
    });
}

/** Log router.push/replace from call sites (does not perform navigation). */
export function logAdminV2RouterNavigation(
    kind: Extract<AdminV2RouteWriteKind, "router.push" | "router.replace">,
    caller: string,
    href: string,
    workUnitId?: string | null
): void {
    const previousUrl = typeof window !== "undefined" ? workUnitDocumentUrlKey() : "";
    const nextPath = href.split("#")[0] ?? href;
    const skipped = previousUrl === nextPath || previousUrl === href;
    logAdminV2RouteWrite({
        kind: skipped ? "skipped" : kind,
        caller,
        previousUrl,
        nextUrl: href,
        skipped,
        workUnitId: workUnitId ?? null,
        stack: captureRouteDebugStack(),
    });
}
