/**
 * THE SNAPSHOT RENDERER — the frozen D1 answer, rendered by the canonical presentation tree.
 *
 * Governing: runtime-implementation-authorization.md — Operational U-O1…U-O7, Preparation U-P1…U-P7;
 * alloy-runtime-kernel.md §K3 "Focus … hands Presentation the committed world to render.
 * Presentation never asks Focus for permission and never tells Focus it is ready."
 *
 * There is NO second Work Unit UI. This maps `ProvisioningAnswer` onto the existing
 * `WorkUnitSurfaceModel` so the canonical components render committed truth unchanged. It is a pure
 * function of the snapshot: no fetch, no effect, no clock, no DOM. Everything the first visible frame
 * needs is already in the answer — that is what D1 + U-P7 + the row-context enrichment bought.
 *
 * THE SETTLEMENT BOUNDARY, RENDERED.
 * Fields D1 deliberately does not carry are RESERVED, never fetched and never blocking:
 *   - KPI values  → slots present with `pending: true`; the renderer already holds a stable
 *                   placeholder in the reserved slot, so a value "never flashes a placeholder that
 *                   then flips to a real number". Geometry now, value at D5.
 *   - view counts → `count: null` renders no badge, in reserved space.
 *   - right rail  → `[]`; RR.SURFACE is a zero-footprint anchor while empty, then reveals at D5.
 * None of these can gate the commit, because none of them is consulted to build this model.
 *
 * READINESS IS NOT A QUESTION HERE. `ready`/`readiness` are all true, unconditionally: this model is
 * only ever built FROM A COMMITTED TERMINAL. K3 already decided. The six-condition conjunction asked
 * "is it safe to show yet?" — a question that cannot arise once the surface is composed from a
 * terminal answer rather than from four races.
 */
import type {
    WorkUnitSurfaceModel,
    QueueRowModel,
    WorkViewLinkModel,
} from "@/lib/presentation/runtime/types";
import { queueRowModelFromQueueItem } from "@/lib/presentation/runtime/types";
import type { WorkspaceHeaderKpiVm, WorkspaceHeaderPresentationModel } from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import type { ProcessCardIcon, ProcessCardAccent } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import type { ProvisioningAnswer } from "./workUnitProvisioningAnswer";
import type { OperationalPresentation } from "./operationalPresentation";

/**
 * U-P7 header composition → the presentation model, with KPI VALUES RESERVED.
 * `pending: true` is the whole Settlement contract in one flag: the slot is laid out now; D5 fills it.
 */
function headerFromPresentation(p: OperationalPresentation): WorkspaceHeaderPresentationModel {
    const kpis: WorkspaceHeaderKpiVm[] = p.header.kpiSlots.map((s) => ({
        slot: s.slot,
        label: s.label,
        icon: (s.icon ?? "chart") as ProcessCardIcon,
        accent: (s.accent ?? null) as ProcessCardAccent | null,
        // Reserved geometry — NOT a value. The renderer shows its stable placeholder because
        // `pending` is true; it never renders a "—" that later flips to a number.
        formattedValue: "",
        status: "",
        sourceKey: s.sourceKey,
        drillHref: null,
        pending: true,
    }));
    return {
        title: p.header.title,
        subtitle: p.header.subtitle,
        identityIcon: (p.header.identityIcon ?? null) as ProcessCardIcon | null,
        identityAccent: (p.header.identityAccent ?? null) as ProcessCardAccent | null,
        kpis,
    };
}

/**
 * The committed world → the canonical Work Unit model.
 * Total function: every terminal (`operational` | `empty` | `error`) yields ONE coherent surface.
 */
export function workUnitSurfaceModelFromSnapshot(snapshot: ProvisioningAnswer): WorkUnitSurfaceModel {
    // ── HONEST ERROR (U-O7) — one coherent error surface. Never a false-empty, and never partial
    //    operational content behind it: there are no rows, no subject, no lens set to render.
    if (snapshot.terminal === "error") {
        return {
            header: {
                title: snapshot.workUnit?.name ?? "Work Unit",
                subtitle: null,
                identityIcon: null,
                identityAccent: null,
                kpis: [],
            },
            workViews: [],
            queue: {
                rows: [],
                totalCount: null,
                loading: false,
                // QueueRegion renders `error` (role="alert") — distinct from `empty` by construction.
                error: snapshot.message,
                rowConfig: EMPTY_ROW_SLOTS,
            },
            activeWorkViewId: null,
            selectedRecordId: null,
            selectedSubject: { selectedRecordId: null, source: "empty" },
            rightRailActions: [],
            departmentId: null,
            workUnitId: snapshot.workUnit?.id ?? null,
            ready: true, // committed: an honest error IS a workable place, not a pending state
            readiness: READY_ALL,
        };
    }

    const p = snapshot.presentation;
    const workViews: WorkViewLinkModel[] = snapshot.lensSet.map((l) => ({
        id: l.id,
        label: l.label,
        isActive: l.id === snapshot.activeWorkView.id,
        // Work View counts are SETTLEMENT (U-S6). `null` renders no badge — reserved, not missing.
        count: null,
        attentionCount: null,
        overdueCount: null,
        // Grain-bucketed counts are Settlement too (§0.5.1/G7: counts are emitted at the view's one
        // Row Grain; a supporting count of another grain is a derived bucket, never a second
        // declared grain). Reserved here, filled at D5 — never a commit gate.
        primaryGrainCount: null,
        supportingGrainCount: null,
        // Work Unit pills select in-page; the lens is an attention movement, never a link.
        href: null,
    }));

    const rows: QueueRowModel[] =
        snapshot.terminal === "operational"
            ? snapshot.rows
                  .map((r) => queueRowModelFromQueueItem({ id: r.id, _queue_row_context: r.context }, "opportunity"))
                  .filter((r): r is QueueRowModel => r != null)
            : [];

    const selectedRecordId =
        snapshot.terminal === "operational" ? snapshot.recordOfAttention.id : null;

    return {
        header: headerFromPresentation(p),
        workViews,
        queue: {
            rows,
            // Totals are SETTLEMENT (U-S6) — reserved, never a commit gate.
            totalCount: null,
            // Never loading: this model exists only because a terminal already arrived.
            loading: false,
            // AUTHORITATIVE EMPTY (U-O6) is `rows: []` with NO error — QueueRegion's renderState
            // distinguishes `empty` from `error` on exactly this, so the two can never be confused.
            error: null,
            rowConfig: p.queue.rowSlots,
        },
        activeWorkViewId: snapshot.activeWorkView.id,
        selectedRecordId,
        selectedSubject: {
            selectedRecordId,
            source:
                snapshot.terminal === "operational"
                    ? snapshot.recordOfAttention.strategySource === "configured"
                        ? "strategy"
                        : "first_row"
                    : "empty",
        },
        // Right-rail actions are SETTLEMENT (U-S7) — the rail is a zero-footprint anchor until D5.
        rightRailActions: [],
        departmentId: null,
        workUnitId: snapshot.workUnit.id,
        ready: true,
        readiness: READY_ALL,
    };
}

/** Committed truth is ready by definition — K3 already decided. See the header note. */
const READY_ALL = {
    shellReady: true,
    retainedCompositionReady: true,
    coldCompositionReady: true,
    interactionReady: true,
} as const;

/** All slots visible, no overrides — the generic-context shape, for the error surface. */
const EMPTY_ROW_SLOTS = {
    subject: { visible: true },
    status: { visible: true },
    contact: { visible: true },
    attention: { visible: true },
    work: { visible: true },
    groupCount: { visible: true },
} as WorkUnitSurfaceModel["queue"]["rowConfig"];
