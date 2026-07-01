/**
 * DrillResolver — maps a calculation's drill contract + AnalyticsContext + selection
 * into a NavigationIntent. It resolves to EXISTING navigation (workspace queue hrefs),
 * never a new action system.
 *
 * The resolver is pure and locator-driven: drill contracts express intent (which queue,
 * what filter); the caller injects a `WorkspaceQueueLocator` that maps a logical work
 * unit key to a real id. If reality can't be resolved, the resolver returns an
 * `unavailable` intent rather than fabricating a target or dead-ending.
 *
 * Href pattern (verified against enrollmentDepartmentViewModel):
 *   {base}/dept/{departmentId}/work-unit/{workUnitId}?status_keys=a,b
 *   {base}/dept/{departmentId}/work-unit/{workUnitId}?attention_reason_code=code
 *
 * Doctrine: docs/platform/core/operational-calculations.md
 */

import { departmentIdAllowed } from "@/lib/admin/accessScope";
import type { OperationalCalculation } from "@/lib/analytics/calculations/types";
import type {
    AnalyticsContext,
    DrillSelection,
    NavigationIntent,
} from "@/lib/analytics/runtime/types";

const DEFAULT_WORKSPACE_BASE_PATH = "/workspace";

/** A queue drill — opens a filtered work unit queue. The only kind wired in Phase 1. */
export type QueueDrillContract = {
    id: string;
    kind: "queue";
    label: string;
    /** Logical work unit key resolved to an id by the locator. */
    workUnitKey: string;
    /** Appended as ?status_keys=... when present. */
    statusKeys?: readonly string[];
    /** Appended as ?attention_reason_code=... when present. */
    attentionReasonCode?: string;
};

export type DrillContract = QueueDrillContract;

/**
 * Injected by the page that owns runtime work-unit data. Maps a logical work unit key
 * to its id within a department; returns null when the work unit is not present.
 */
export type WorkspaceQueueLocator = {
    workspaceBasePath?: string;
    departmentId: string;
    resolveWorkUnitId: (workUnitKey: string) => string | null;
};

/**
 * Declarative drill registry. Contracts are referenced by `OperationalCalculation.drillContractId`.
 * Conservative by design: queue drills open the owning work unit; status filters are added
 * only where a stable status mapping exists (none fabricated in Phase 1).
 */
export const DRILL_CONTRACTS: Record<string, DrillContract> = {
    "enrollment.leads": {
        id: "enrollment.leads",
        kind: "queue",
        label: "Open lead queue",
        workUnitKey: "enrollment_pipeline",
    },
    "enrollment.tours": {
        id: "enrollment.tours",
        kind: "queue",
        label: "Open tour queue",
        workUnitKey: "enrollment_pipeline",
    },
    "enrollment.tours_stalled": {
        id: "enrollment.tours_stalled",
        kind: "queue",
        label: "Open stalled tour queue",
        workUnitKey: "enrollment_pipeline",
    },
    "forms.incomplete": {
        id: "forms.incomplete",
        kind: "queue",
        label: "Open incomplete forms queue",
        workUnitKey: "enrollment_pipeline",
    },
    "ops.overdue": {
        id: "ops.overdue",
        kind: "queue",
        label: "Open overdue work queue",
        workUnitKey: "needs_attention",
    },
    "ops.needs_attention": {
        id: "ops.needs_attention",
        kind: "queue",
        label: "Open needs-attention queue",
        workUnitKey: "needs_attention",
    },
    "ops.readiness": {
        id: "ops.readiness",
        kind: "queue",
        label: "Open readiness queue",
        workUnitKey: "needs_attention",
    },
};

export function getDrillContract(id: string | undefined): DrillContract | null {
    if (!id) return null;
    return DRILL_CONTRACTS[id] ?? null;
}

function buildQueueHref(
    contract: QueueDrillContract,
    locator: WorkspaceQueueLocator,
    selection?: DrillSelection,
): string | null {
    const workUnitId = locator.resolveWorkUnitId(contract.workUnitKey);
    if (!workUnitId) return null;

    const basePath = (locator.workspaceBasePath ?? DEFAULT_WORKSPACE_BASE_PATH).replace(/\/$/, "");
    const base = `${basePath}/dept/${encodeURIComponent(locator.departmentId)}/work-unit/${encodeURIComponent(
        workUnitId,
    )}`;

    // Status filter: contract defaults, plus a status_key drill selection if present.
    const statusKeys = new Set<string>(contract.statusKeys ?? []);
    if (selection?.dimensionKey === "status_key" && selection.dimensionValue) {
        statusKeys.add(selection.dimensionValue);
    }

    const query = new URLSearchParams();
    if (statusKeys.size > 0) {
        query.set("status_keys", [...statusKeys].join(","));
    } else if (contract.attentionReasonCode) {
        query.set("attention_reason_code", contract.attentionReasonCode);
    }

    const qs = query.toString();
    return qs ? `${base}?${qs}` : base;
}

/** Resolve a concrete drill contract into a NavigationIntent. */
export function resolveDrill(
    contract: DrillContract,
    ctx: AnalyticsContext,
    locator: WorkspaceQueueLocator,
    selection?: DrillSelection,
): NavigationIntent {
    if (!departmentIdAllowed(ctx.accessScope, locator.departmentId)) {
        return { kind: "unavailable", reason: "access_denied" };
    }

    const href = buildQueueHref(contract, locator, selection);
    if (!href) {
        return { kind: "unavailable", reason: "work_unit_unresolved" };
    }

    return {
        kind: "href",
        destinationKind: "queue",
        label: contract.label,
        href,
    };
}

/** Resolve the default drill for a calculation. */
export function resolveCalculationDrill(
    calc: OperationalCalculation,
    ctx: AnalyticsContext,
    locator: WorkspaceQueueLocator,
    selection?: DrillSelection,
): NavigationIntent {
    if (calc.exploratoryOnly && !calc.drillContractId) {
        return { kind: "unavailable", reason: "exploratory_only" };
    }
    const contract = getDrillContract(calc.drillContractId);
    if (!contract) {
        return { kind: "unavailable", reason: "no_drill_contract" };
    }
    return resolveDrill(contract, ctx, locator, selection);
}
