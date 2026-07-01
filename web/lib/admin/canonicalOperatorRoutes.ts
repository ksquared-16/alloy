import {
    CANONICAL_ADMIN_BASE,
    CANONICAL_ADMIN_WORKSPACE,
    CANONICAL_OPERATOR_BASE,
    CANONICAL_OPERATOR_WORK_UNIT_PREFIX,
} from "@/lib/admin/canonicalAdminRoutes";
import { workUnitKeyToRouteSlug } from "@/lib/admin/workUnitRouteSlug";

/** Operator landing — daily work home (Phase G). */
export const OPERATOR_WORKSPACE_HREF = CANONICAL_OPERATOR_BASE;

/** Build `/workspace/work-unit/:slug` from platform key (`new_leads` → `new-leads`). */
export function operatorWorkUnitHrefFromKey(platformKey: string, recordId?: string | null): string {
    const slug = workUnitKeyToRouteSlug(platformKey);
    const base = `${CANONICAL_OPERATOR_WORK_UNIT_PREFIX}/${encodeURIComponent(slug)}`;
    const record = typeof recordId === "string" ? recordId.trim() : "";
    return record ? `${base}/${encodeURIComponent(record)}` : base;
}

/**
 * Build `/workspace/work-unit/:slug?work_view=:id` — the canonical route for a configured Work View.
 * The `:slug` resolves the host work unit (the process pipeline); `?work_view=` selects which configured
 * Work View is active so the runtime evaluates that view's predicates and shows its own count.
 * (`?work_view=` is read by `readWorkUnitQueueLocationParams`.)
 */
export function operatorWorkViewHref(platformKey: string, workViewId: string): string {
    const base = operatorWorkUnitHrefFromKey(platformKey);
    const id = typeof workViewId === "string" ? workViewId.trim() : "";
    return id ? `${base}?work_view=${encodeURIComponent(id)}` : base;
}

/** H1 compatibility — dept/uuid work-unit URL under `/admin/workspace`. */
export function legacyAdminWorkUnitHref(args: {
    departmentId: string;
    workUnitId: string;
    queueKey?: string | null;
}): string {
    const base = `${CANONICAL_ADMIN_WORKSPACE}/dept/${encodeURIComponent(args.departmentId)}/work-unit/${encodeURIComponent(args.workUnitId)}`;
    const queueKey = typeof args.queueKey === "string" ? args.queueKey.trim() : "";
    if (!queueKey) return base;
    return `${base}?queue=${encodeURIComponent(queueKey)}`;
}

/**
 * Resolve where "Open Lead" sends the operator after Create Lead success.
 *
 * Canonical destination is the Work Unit Focus Panel for the new record
 * (`/workspace/work-unit/:slug/:recordId`) — never the legacy adminV2 drawer. Precedence:
 *   1. `owningWorkUnitKey` — the work unit that owns the new lead's status (status-aware), when known.
 *   2. `currentWorkUnitKey` — the work unit the lead was created in.
 *   3. Operator workspace home — safe fallback when no work unit can be resolved (record still
 *      reachable from the workspace; no drawer route).
 *
 * Routing ownership lives here, in the workspace routing layer — Create Lead surfaces call this
 * rather than building drawer params or hrefs themselves.
 */
export function resolveCreatedLeadFocusPanelHref(args: {
    recordId: string | null | undefined;
    owningWorkUnitKey?: string | null;
    currentWorkUnitKey?: string | null;
}): string {
    const recordId = typeof args.recordId === "string" ? args.recordId.trim() : "";
    const key =
        (typeof args.owningWorkUnitKey === "string" ? args.owningWorkUnitKey.trim() : "") ||
        (typeof args.currentWorkUnitKey === "string" ? args.currentWorkUnitKey.trim() : "");
    if (!key) return OPERATOR_WORKSPACE_HREF;
    return operatorWorkUnitHrefFromKey(key, recordId || null);
}

/** Admin / settings / config landing (not operator home). */
export const ADMIN_CONFIG_LANDING_HREF = CANONICAL_ADMIN_BASE;

export function parseOperatorWorkUnitPath(pathname: string): {
    workUnitSlug: string | null;
    recordId: string | null;
} {
    const trimmed = pathname.trim();
    const prefix = `${CANONICAL_OPERATOR_WORK_UNIT_PREFIX}/`;
    if (!trimmed.startsWith(prefix)) {
        return { workUnitSlug: null, recordId: null };
    }
    const rest = trimmed.slice(prefix.length);
    const segments = rest.split("/").filter(Boolean);
    if (!segments.length) return { workUnitSlug: null, recordId: null };
    return {
        workUnitSlug: decodeURIComponent(segments[0] ?? "") || null,
        recordId: segments[1] ? decodeURIComponent(segments[1]) : null,
    };
}

export function isOperatorWorkspacePath(pathname: string): boolean {
    const p = pathname.trim();
    return p === CANONICAL_OPERATOR_BASE || p.startsWith(`${CANONICAL_OPERATOR_BASE}/`);
}

/** Normalize internal rewrite paths (`/adminV2/workspace`, `/admin/workspace`) to `/workspace`. */
export function normalizeOperatorPathname(pathname: string): string {
    const trimmed = pathname.trim();
    if (trimmed === CANONICAL_OPERATOR_BASE || trimmed.startsWith(`${CANONICAL_OPERATOR_BASE}/`)) {
        return trimmed;
    }
    if (trimmed === "/adminV2/workspace") {
        return CANONICAL_OPERATOR_BASE;
    }
    if (trimmed.startsWith("/adminV2/workspace/")) {
        return `${CANONICAL_OPERATOR_BASE}${trimmed.slice("/adminV2/workspace".length)}`;
    }
    if (trimmed === CANONICAL_ADMIN_WORKSPACE) {
        return CANONICAL_OPERATOR_BASE;
    }
    if (trimmed.startsWith(`${CANONICAL_ADMIN_WORKSPACE}/`)) {
        return `${CANONICAL_OPERATOR_BASE}${trimmed.slice(CANONICAL_ADMIN_WORKSPACE.length)}`;
    }
    return trimmed;
}
