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
import { mapQueueRowSurfaceToCompactConfig, type CompactRowSlots } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import {
    queueRowVariantMatchInputFromContext,
} from "@/lib/presentation/runtime/queueRowVariantResolve";
import { resolveQueueRowVariant } from "@/lib/presentation/runtime/resolveQueueRowVariant";
import { mergeCompactSlotsInheritDefault } from "@/lib/presentation/runtime/mergeCompactSlotsInheritDefault";
import type { QueueRowVariant, QueueRecordFixedControls } from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { WorkspaceHeaderKpiVm, WorkspaceHeaderPresentationModel } from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import type { ProcessCardIcon, ProcessCardAccent } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import { provisioningErrorKind, type LensSetEntry, type ProvisioningAnswer } from "./workUnitProvisioningAnswer";
import type { OperationalPresentation } from "./operationalPresentation";

/**
 * P2-B — resolve the applicable published row variant for one row's context. Returns the variant's
 * compact slots when a variant matches (Work View / stage / status / grain / process / row type), or
 * undefined so the caller keeps the queue-level default. Pure; never throws.
 *
 * Match input MUST come from {@link queueRowVariantMatchInputFromContext} (nested QueueRowContext
 * paths) — flat keys like `stage_key` / `grain` are not present on frozen row context.
 * Empty variant columns inherit Default (return undefined → queue-level `rowConfig`).
 * Slots the variant does not configure inherit from `defaultSlots` (Default children/contact/work).
 */
function resolveRowVariantSlots(
    context: unknown,
    variants: readonly QueueRowVariant[],
    fixedControls: QueueRecordFixedControls | null,
    workViewId: string | null,
    workViewKey: string | null,
    processKey: string | null,
    defaultSlots: CompactRowSlots,
): CompactRowSlots | undefined {
    if (variants.length === 0 || !fixedControls) return undefined;
    const rowContext = (context ?? {}) as QueueRowContext;
    const input = queueRowVariantMatchInputFromContext(rowContext, {
        workViewId,
        workViewKey,
    });
    if (!input.processKey && processKey) {
        input.processKey = processKey;
    }
    const matched = resolveQueueRowVariant(variants, input);
    if (!matched) return undefined;
    // Starter / incomplete variants ship empty columns — inherit Default rather than blanking the row.
    if (!matched.columns.length) return undefined;
    const variantSlots = mapQueueRowSurfaceToCompactConfig({
        variant: "operational-row",
        version: 3,
        columns: matched.columns,
        fixedControls: matched.fixedControls ?? fixedControls,
        variants: undefined,
    }).slots;
    return mergeCompactSlotsInheritDefault(variantSlots, defaultSlots);
}

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
 * THE PILL ORDER IS THE OPERATOR'S DECLARED ORDER.
 *
 * `LensSetEntry.displayOrder` carries what the builder's Work View ordering means, and until now every
 * consumer mapped straight over it and dropped it — the strip was in the right order only because
 * `savedWorkViewsFromDepartmentMetadata` happens to hand the array over pre-sorted. That made a
 * published, contractual field inert, and left the operator's intent riding on an upstream array
 * position that nothing promises to preserve. Any consumer that filtered, merged, or re-derived the
 * lens set would have lost the ordering silently, and the field that looks authoritative would not
 * have caught it.
 *
 * Sorted here, so the declared order is what decides. Ties break on label, matching
 * `normalizeWorkViewsDisplayOrder` — one rule for lens order, not two.
 */
function lensSetInDeclaredOrder(lensSet: readonly LensSetEntry[]): LensSetEntry[] {
    return [...lensSet].sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label));
}

/**
 * The committed world → the canonical Work Unit model.
 * Total function: every terminal (`operational` | `empty` | `error`) yields ONE coherent surface.
 */
export function workUnitSurfaceModelFromSnapshot(snapshot: ProvisioningAnswer): WorkUnitSurfaceModel {
    // ── HONEST ERROR (U-O7) — one coherent error surface. Never a false-empty, and never partial
    //    operational content behind it: there are no rows and no subject.
    //
    //    HONEST, NOT FATAL. This branch used to hard-code `workViews: []`, reasoning that an error has
    //    "no lens set to render". That was true of the ANSWER, not of the world: by the time a
    //    grain-ambiguous lens is refused, the lens set is already resolved. Discarding it produced a
    //    measured defect — Firefly's "Active Pipeline" rendered a raw internal sentence with no pill
    //    strip and no retry, so an operator (sidebar collapsed by default) had no in-surface way to
    //    reach a working Work View. A refusal states what is wrong; it must not also remove the exit.
    if (snapshot.terminal === "error") {
        const frame = snapshot.navigationFrame;
        return {
            header: {
                title: snapshot.workUnit?.name ?? "Work Unit",
                subtitle: null,
                identityIcon: null,
                identityAccent: null,
                kpis: [],
            },
            // EVERY count stays null: counts are SETTLEMENT (U-S6) and this answer never reached it. A
            // pill with no badge is honest; a zero would be a claim this answer cannot make — the same
            // rule the operational path below already follows for `count`.
            workViews: lensSetInDeclaredOrder(frame?.lensSet ?? []).map((l): WorkViewLinkModel => ({
                id: l.id,
                label: l.label,
                isActive: l.id === frame?.activeWorkView.id,
                count: null,
                href: null,
                attentionCount: null,
                overdueCount: null,
                primaryGrainCount: null,
                supportingGrainCount: null,
            })),
            queue: {
                rows: [],
                totalCount: null,
                loading: false,
                // QueueRegion renders `error` (role="alert") — distinct from `empty` by construction.
                error: snapshot.message,
                errorKind: provisioningErrorKind(snapshot.code),
                rowConfig: EMPTY_ROW_SLOTS,
            },
            activeWorkViewId: frame?.activeWorkView.id ?? null,
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
    const workViews: WorkViewLinkModel[] = lensSetInDeclaredOrder(snapshot.lensSet).map((l) => ({
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

    const queueRowVariants = p.queue.rowVariants;
    const rows: QueueRowModel[] =
        snapshot.terminal === "operational"
            ? snapshot.rows
                  .map((r) => {
                      const model = queueRowModelFromQueueItem({ id: r.id, _queue_row_context: r.context }, "opportunity");
                      // P2-B: per-row variant. The published queue-row surface may define context-specific
                      // variants; each row resolves the first matching one and renders the SAME
                      // CondensedQueueRow with that variant's columns. No match (or no authored variants)
                      // keeps the queue-level default (`queue.rowConfig`) — so this is behavior-neutral
                      // until variants are authored, and Runtime-owned selected-row styling is unaffected.
                      if (model && queueRowVariants.length > 0) {
                          const slots = resolveRowVariantSlots(
                              r.context,
                              queueRowVariants,
                              p.queue.rowVariantFixedControls,
                              snapshot.activeWorkView.id,
                              snapshot.activeWorkView.label.trim().toLowerCase().replace(/\s+/g, "_") || null,
                              snapshot.businessProcess.key,
                              p.queue.rowSlots,
                          );
                          if (slots) model.rowConfig = slots;
                      }
                      return model;
                  })
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
            // P2-V: carry config-consumption provenance to the model so the DOM can prove WHICH surface
            // drove the rendered slots (was dropped here before — the observability gap).
            provenance: {
                source: p.provenance.queueRowSource,
                surfaceId: p.provenance.queueRowSurfaceId,
                resolvedSource: p.provenance.queueRowResolvedSource,
                variant: p.provenance.queueRowVariant,
                ineffectiveFieldKeys: p.provenance.queueRowIneffectiveFieldKeys,
            },
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
        // B — COMMIT-CRITICAL ACTIONS: the resolved right-rail action set is carried in the answer, so
        // the count + identities commit WITH the surface (no Actions(0) flash, no post-commit layout
        // discovery). Settlement still confirms with the same resolver but merges only non-empty results,
        // so it never clobbers this to zero. The snapshot-owned primary Action is elsewhere and untouched.
        // Department scope is baked with the projection — Actions (Create Lead) must not wait on Settlement.
        rightRailActions: snapshot.actionsProjection?.actions ?? [],
        departmentId: snapshot.actionsProjection?.departmentId ?? null,
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
